import { Bot, webhookCallback, InlineKeyboard } from "grammy";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession, saveSession, resetSession } from "../lib/session";
import { extractJdProfile } from "../lib/pipeline/extractJd";
import { extractEvidence } from "../lib/pipeline/extractEvidence";
import { verifyEvidence } from "../lib/pipeline/verify";
import { computeFullScore } from "../lib/pipeline/score";
import { generateRoadmap } from "../lib/pipeline/roadmap";
import {
  renderScoreCard,
  scoreCardKeyboard,
  renderRanking,
  renderGaps,
  renderWhyScore,
  renderRoadmap,
} from "../lib/bot/render";
import {
  handleDeterministicIntent,
  detectIntent,
  detectCandidateSwitch,
  handleGroundedFollowup,
} from "../lib/bot/intents";
import type { Evidence, ResumeProfile, CandidateResult } from "../lib/schemas";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

const bot = new Bot(token);

// /start
bot.command("start", async (ctx) => {
  await resetSession(ctx.chat.id, false);
  await ctx.reply(
    "Send me a job description to begin.\nThen send one or more résumés (PDF, DOCX, or TXT) to score them against it."
  );
});

// /help
bot.command("help", async (ctx) => {
  await ctx.reply(
    "<b>Commands</b>\n\n" +
      "/start — Fresh session\n" +
      "/rank — Leaderboard of all analyzed candidates\n" +
      "/gaps — Critical + important gaps for the active candidate\n" +
      "/reset — Clear candidates (option to keep or discard JD)\n" +
      "/help — Show this message\n\n" +
      "Or just ask a question about any candidate's score.",
    { parse_mode: "HTML" }
  );
});

// /rank
bot.command("rank", async (ctx) => {
  const session = await getSession(ctx.chat.id);
  if (!session.jd_profile || session.candidates.length === 0) {
    await ctx.reply("No candidates analyzed yet. Send a JD and résumé first.");
    return;
  }
  const text = renderRanking(
    session.candidates,
    session.jd_profile.field_taxonomy_tag
  );
  await ctx.reply(text, { parse_mode: "HTML" });
});

// /gaps
bot.command("gaps", async (ctx) => {
  const session = await getSession(ctx.chat.id);
  if (session.candidates.length === 0) {
    await ctx.reply("No candidates analyzed yet.");
    return;
  }
  const idx =
    session.active_candidate_index ?? session.candidates.length - 1;
  const candidate = session.candidates[idx];
  await ctx.reply(renderGaps(candidate), { parse_mode: "HTML" });
});

// /reset
bot.command("reset", async (ctx) => {
  const session = await getSession(ctx.chat.id);
  if (!session.jd_profile) {
    await resetSession(ctx.chat.id, false);
    await ctx.reply("Session reset. Send a new job description.");
    return;
  }

  await ctx.reply("Reset candidates. Keep the current JD?", {
    reply_markup: new InlineKeyboard()
      .text("Same JD, new résumés", "reset:keep_jd")
      .text("New JD", "reset:new_jd"),
  });
});

// Callback queries
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  await ctx.answerCallbackQuery();

  if (!ctx.chat) return;

  const session = await getSession(ctx.chat.id);

  // Reset callbacks
  if (data === "reset:keep_jd") {
    await resetSession(ctx.chat.id, true);
    await ctx.reply("Candidates cleared. Send new résumés against the same JD.");
    return;
  }
  if (data === "reset:new_jd") {
    await resetSession(ctx.chat.id, false);
    await ctx.reply("Session reset. Send a new job description.");
    return;
  }

  // Intent callbacks from score card
  if (data.startsWith("intent:")) {
    const intent = data.replace("intent:", "");
    const response = handleDeterministicIntent(intent, session);
    if (response) {
      await ctx.reply(response, { parse_mode: "HTML" });
    }
    return;
  }
});

// Document handler (PDF/DOCX/TXT résumé uploads)
bot.on("message:document", async (ctx) => {
  const session = await getSession(ctx.chat.id);

  if (session.state === "AWAITING_JD") {
    await ctx.reply("Send a job description as text first, then upload résumés.");
    return;
  }

  if (!session.jd_profile) {
    await ctx.reply("No JD on file. Send a job description first.");
    return;
  }

  const doc = ctx.message.document;
  const fileName = doc.file_name?.toLowerCase() ?? "";
  const label = doc.file_name ?? `Candidate ${session.candidates.length + 1}`;

  if (
    !fileName.endsWith(".pdf") &&
    !fileName.endsWith(".docx") &&
    !fileName.endsWith(".doc") &&
    !fileName.endsWith(".txt") &&
    !fileName.endsWith(".md")
  ) {
    await ctx.reply("Unsupported file type. Send a PDF, DOCX, or TXT file.");
    return;
  }

  await ctx.reply(`📄 Processing <b>${label}</b>...`, { parse_mode: "HTML" });

  try {
    const file = await ctx.api.getFile(doc.file_id);
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());

    let resumeText = "";

    if (fileName.endsWith(".pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      resumeText = result.pages
        .map((p: { text: string }) => p.text)
        .join("\n");
    } else if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      resumeText = result.value;
    } else {
      resumeText = buffer.toString("utf-8");
    }

    if (!resumeText || resumeText.trim().length < 10) {
      await ctx.reply("Could not extract text from the file. Try a different format.");
      return;
    }

    resumeText = resumeText.trim();

    // Run pipeline: extract → verify → score → roadmap
    const extractionResult = await extractEvidence(
      resumeText,
      session.jd_profile.requirements
    );

    const verifiedEvidence = verifyEvidence(
      extractionResult.evidence,
      resumeText
    ) as Evidence[];

    const resumeProfile: ResumeProfile = {
      field_taxonomy_tag: extractionResult.field_taxonomy_tag,
      candidate_years: extractionResult.candidate_years,
    };

    const scoreBreakdown = computeFullScore(
      verifiedEvidence,
      session.jd_profile,
      resumeProfile
    );

    // Generate roadmap
    let roadmap: import("../lib/schemas").RoadmapItem[][] = [[], [], []];
    try {
      const criticalGapItems = scoreBreakdown.critical_gaps.map((text) => {
        const req = session.jd_profile!.requirements.find(
          (r) => r.text === text
        );
        return {
          text,
          category: req?.category ?? "other",
          weight: req?.priority_signal === "mandatory" ? 3 : 2,
        };
      });
      const importantGapItems = scoreBreakdown.important_gaps.map((text) => {
        const req = session.jd_profile!.requirements.find(
          (r) => r.text === text
        );
        return {
          text,
          category: req?.category ?? "other",
          weight:
            req?.priority_signal === "mandatory"
              ? 3
              : req?.priority_signal === "preferred"
              ? 1
              : 2,
        };
      });
      if (criticalGapItems.length > 0 || importantGapItems.length > 0) {
        roadmap = await generateRoadmap(
          criticalGapItems,
          importantGapItems,
          session.jd_profile.role_archetype
        );
      }
    } catch {
      // Roadmap is supplementary
    }

    const candidateResult: CandidateResult = {
      label,
      resume_text: resumeText,
      evidence: verifiedEvidence,
      score: scoreBreakdown,
      roadmap,
      resume_profile: resumeProfile,
      analyzed_at: Date.now(),
    };

    session.candidates.push(candidateResult);
    session.active_candidate_index = session.candidates.length - 1;
    await saveSession(session);

    const scoreCard = renderScoreCard(candidateResult);
    await ctx.reply(scoreCard, {
      parse_mode: "HTML",
      reply_markup: scoreCardKeyboard(),
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    const msg =
      error instanceof Error ? error.message : "Unknown error";
    await ctx.reply(`❌ Analysis failed: ${msg}`);
  }
});

// Text message handler (JD input or follow-up questions)
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.startsWith("/")) return;

  const session = await getSession(ctx.chat.id);

  // AWAITING_JD: treat as JD
  if (session.state === "AWAITING_JD") {
    if (text.trim().length < 20) {
      await ctx.reply("That looks too short for a job description. Paste the full JD text.");
      return;
    }

    await ctx.reply("⏳ Analyzing job description...");

    try {
      const jdProfile = await extractJdProfile(text.trim());
      session.jd_profile = jdProfile;
      session.state = "AWAITING_RESUMES";
      await saveSession(session);

      const arch = jdProfile.role_archetype.replace(/_/g, " ");
      const mandCount = jdProfile.requirements.filter(
        (r) => r.priority_signal === "mandatory"
      ).length;
      const prefCount = jdProfile.requirements.filter(
        (r) => r.priority_signal === "preferred"
      ).length;

      await ctx.reply(
        `✅ <b>${jdProfile.field_taxonomy_tag}</b> — ${jdProfile.requirements.length} requirements (${mandCount} mandatory, ${prefCount} preferred).\n\nSend résumé files (PDF/DOCX/TXT) to score them.`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("JD extraction error:", error);
      await ctx.reply(
        "❌ Failed to analyze the JD. Try pasting it again."
      );
    }
    return;
  }

  // AWAITING_RESUMES: follow-up question
  if (session.state === "AWAITING_RESUMES") {
    if (session.candidates.length === 0) {
      await ctx.reply(
        "No candidates analyzed yet. Send a résumé file (PDF/DOCX/TXT) to begin scoring."
      );
      return;
    }

    // Check for candidate switch
    const switchIdx = detectCandidateSwitch(text, session.candidates);
    if (switchIdx !== null && switchIdx !== session.active_candidate_index) {
      session.active_candidate_index = switchIdx;
      await saveSession(session);
    }

    // Try deterministic intent first
    const intent = detectIntent(text);
    if (intent) {
      const response = handleDeterministicIntent(intent, session);
      if (response) {
        await ctx.reply(response, { parse_mode: "HTML" });
        return;
      }
    }

    // Grounded model fallback
    try {
      const response = await handleGroundedFollowup(text, session);
      await ctx.reply(response);
    } catch (error) {
      console.error("Follow-up error:", error);
      await ctx.reply("❌ Failed to generate a response. Try rephrasing.");
    }
  }
});

// Vercel serverless handler
const handler = webhookCallback(bot, "next-js");

export default async function (req: VercelRequest, res: VercelResponse) {
  try {
    await handler(req, res);
  } catch (error) {
    console.error("Webhook handler error:", error);
    res.status(200).json({ ok: true });
  }
}
