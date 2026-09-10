import type { TelegramSession } from "../schemas";
import { chatCompletion } from "../gemini";
import {
  renderWhyScore,
  renderGaps,
  renderRoadmap,
  renderRanking,
  renderEvidence,
} from "./render";

export function handleDeterministicIntent(
  intent: string,
  session: TelegramSession
): string | null {
  if (!session.jd_profile || session.candidates.length === 0) {
    return "No analysis data yet. Send a JD and résumé first.";
  }

  const activeIdx = session.active_candidate_index ?? session.candidates.length - 1;
  const candidate = session.candidates[activeIdx];
  if (!candidate) return "No active candidate. Send a résumé first.";

  switch (intent) {
    case "why_score":
      return renderWhyScore(candidate);
    case "top_gaps":
      return renderGaps(candidate);
    case "roadmap":
      return renderRoadmap(candidate);
    case "evidence":
      return renderEvidence(candidate, session.jd_profile);
    case "rank":
      return renderRanking(
        session.candidates,
        session.jd_profile.field_taxonomy_tag
      );
    default:
      return null;
  }
}

// Detect if the user message is a simple deterministic query
export function detectIntent(message: string): string | null {
  const msg = message.toLowerCase().trim();

  if (
    msg.includes("why") &&
    (msg.includes("score") || msg.includes("low") || msg.includes("high") || msg.includes("get"))
  ) {
    return "why_score";
  }

  if (
    msg.includes("gap") ||
    msg.includes("missing") ||
    msg.includes("weak") ||
    msg.includes("learn") ||
    msg.includes("improve")
  ) {
    return "top_gaps";
  }

  if (msg.includes("evidence") || msg.includes("quote") || msg.includes("reason")) {
    return "evidence";
  }

  if (
    (msg.includes("mandatory") && msg.includes("preferred")) ||
    msg.includes("must have")
  ) {
    return "why_score";
  }

  if (msg.includes("strength") || msg.includes("well") || msg.includes("good")) {
    return "why_score";
  }

  if (msg.includes("rank") || msg.includes("compare") || msg.includes("leader")) {
    return "rank";
  }

  if (msg.includes("roadmap") || msg.includes("plan") || msg.includes("next step")) {
    return "roadmap";
  }

  return null;
}

// Try to detect if user references a specific candidate and switch active index
export function detectCandidateSwitch(
  message: string,
  candidates: { label: string }[]
): number | null {
  const msg = message.toLowerCase();

  // "candidate 2", "the second one", "#2"
  const numMatch = msg.match(/candidate\s*(\d+)|#(\d+)|(\d+)(?:st|nd|rd|th)\s/);
  if (numMatch) {
    const num = parseInt(numMatch[1] || numMatch[2] || numMatch[3]) - 1;
    if (num >= 0 && num < candidates.length) return num;
  }

  // Filename substring match
  for (let i = 0; i < candidates.length; i++) {
    const label = candidates[i].label.toLowerCase();
    if (label.length > 3 && msg.includes(label)) return i;
    // Also match without extension
    const noExt = label.replace(/\.\w+$/, "");
    if (noExt.length > 3 && msg.includes(noExt)) return i;
  }

  return null;
}

export async function handleGroundedFollowup(
  message: string,
  session: TelegramSession
): Promise<string> {
  const activeIdx = session.active_candidate_index ?? session.candidates.length - 1;
  const candidate = session.candidates[activeIdx];

  if (!candidate || !session.jd_profile) {
    return "No analysis available. Send a JD and résumé first.";
  }

  const systemPrompt = `You are a job-fit analysis assistant answering via Telegram. You may ONLY state facts present in the JSON data provided below. If the user asks about something not covered by this data, say the analysis doesn't cover that rather than guessing. Keep responses concise — use short lists, not paragraphs. Use plain text (no HTML tags).

ANALYSIS DATA:
${JSON.stringify({
    candidate_label: candidate.label,
    score: candidate.score,
    evidence: candidate.evidence.map((ev) => {
      const req = session.jd_profile!.requirements.find(
        (r) => r.id === ev.requirement_id
      );
      return {
        requirement: req?.text,
        category: req?.category,
        priority: req?.priority_signal,
        status: ev.status,
        context: ev.context,
        quote: ev.quote,
        verified: ev.verified,
        score:
          candidate.score.requirement_scores.find(
            (s) => s.requirement_id === ev.requirement_id
          )?.raw_score ?? 0,
      };
    }),
    resume_profile: candidate.resume_profile,
    jd_profile: {
      role_archetype: session.jd_profile.role_archetype,
      field_taxonomy_tag: session.jd_profile.field_taxonomy_tag,
      required_years: session.jd_profile.required_years,
      required_level: session.jd_profile.required_level,
    },
  })}`;

  return chatCompletion(systemPrompt, message);
}
