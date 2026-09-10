import type { ScoreBreakdown, CandidateResult, JdProfile } from "../schemas";
import { InlineKeyboard } from "grammy";

export function bar(score: number): string {
  const filled = Math.round(score / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function verdict(score: number, gates: string[]): string {
  if (gates.includes("severe_domain_mismatch")) return "Domain Mismatch";
  if (score >= 80) return "Strong Match";
  if (score >= 55) return "Partial Match";
  if (score >= 35) return "Weak Match";
  return "Low Match";
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderScoreCard(candidate: CandidateResult): string {
  const s = candidate.score;
  const v = verdict(s.overall_score, s.gates_applied);
  const cats = s.category_scores;

  const catLines = [
    ["Technical", cats["technical_skills"]],
    ["Experience", cats["experience"]],
    ["Domain", cats["domain_alignment"]],
    ["Projects", cats["projects"]],
    ["Education", cats["education"]],
    ["Certs", cats["certifications"]],
    ["Responsibilities", cats["responsibilities"]],
  ]
    .filter(([, v]) => v !== undefined)
    .map(([label, val]) => `${label} ${bar(val as number)} ${val}%`)
    .join("\n");

  const topGaps =
    s.critical_gaps.length > 0
      ? s.critical_gaps.slice(0, 3).map(esc).join(", ")
      : "none";

  const topStrength =
    s.strengths.length > 0
      ? esc(s.strengths[0])
      : "insufficient evidence";

  const gates =
    s.gates_applied.length > 0
      ? `\n🚩 ${s.gates_applied.map((g) => g.replace(/_/g, " ")).join(", ")}`
      : "";

  return (
    `<b>${esc(candidate.label)}</b>\n` +
    `${bar(s.overall_score)}  <b>${s.overall_score}/100</b> — ${v}\n\n` +
    `${catLines}\n\n` +
    `⚠️ Critical gaps: ${topGaps}\n` +
    `✅ Strongest: ${topStrength}` +
    `${gates}\n\n` +
    `📊 ATS: ${s.ats_score}% | Confidence: ${s.evidence_confidence}%`
  );
}

export function scoreCardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Why this score?", "intent:why_score")
    .text("Top gaps", "intent:top_gaps")
    .row()
    .text("Learning plan", "intent:roadmap")
    .text("Rank all so far", "intent:rank");
}

export function renderRanking(
  candidates: CandidateResult[],
  jdFieldTag: string
): string {
  if (candidates.length === 0) {
    return "No candidates analyzed yet. Send résumé files to begin.";
  }

  const sorted = [...candidates].sort(
    (a, b) => b.score.overall_score - a.score.overall_score
  );

  const lines = sorted.map((c, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    return `${medal} ${esc(c.label)} — <b>${c.score.overall_score}/100</b> ${bar(c.score.overall_score)}`;
  });

  return (
    `<b>Ranking — ${candidates.length} candidate${candidates.length > 1 ? "s" : ""} vs. ${esc(jdFieldTag)}</b>\n\n` +
    lines.join("\n")
  );
}

export function renderGaps(candidate: CandidateResult): string {
  const s = candidate.score;
  const lines: string[] = [`<b>Gaps for ${esc(candidate.label)}</b>\n`];

  if (s.critical_gaps.length > 0) {
    lines.push("🔴 <b>Critical:</b>");
    s.critical_gaps.forEach((g) => lines.push(`  • ${esc(g)}`));
  }

  if (s.important_gaps.length > 0) {
    lines.push("\n🟡 <b>Important:</b>");
    s.important_gaps.forEach((g) => lines.push(`  • ${esc(g)}`));
  }

  if (s.critical_gaps.length === 0 && s.important_gaps.length === 0) {
    lines.push("No significant gaps identified.");
  }

  return lines.join("\n");
}

export function renderWhyScore(candidate: CandidateResult): string {
  const s = candidate.score;
  const lines: string[] = [`<b>Score breakdown for ${esc(candidate.label)}</b>\n`];

  const catEntries = Object.entries(s.category_scores).sort(
    ([, a], [, b]) => b - a
  );
  for (const [cat, score] of catEntries) {
    const label = cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`${label}: ${bar(score)} ${score}%`);
  }

  lines.push(`\nDomain Alignment: ${s.domain_alignment_score}%`);
  lines.push(`ATS: ${s.ats_score}%`);
  lines.push(`Evidence Confidence: ${s.evidence_confidence}%`);

  if (s.gates_applied.length > 0) {
    lines.push(`\n🚩 Gates: ${s.gates_applied.map((g) => g.replace(/_/g, " ")).join(", ")}`);
  }

  if (s.critical_gaps.length > 0) {
    lines.push(
      `\nBiggest reducers: ${s.critical_gaps.slice(0, 3).map(esc).join(", ")}`
    );
  }

  return lines.join("\n");
}

export function renderRoadmap(candidate: CandidateResult): string {
  const roadmap = candidate.roadmap;
  if (!roadmap || roadmap.every((tier) => tier.length === 0)) {
    return `No learning roadmap for ${esc(candidate.label)} — no significant gaps found.`;
  }

  const labels = ["🔴 Priority 1 — Critical", "🟡 Priority 2 — Important", "⚪ Priority 3 — Minor"];
  const lines: string[] = [`<b>Learning plan for ${esc(candidate.label)}</b>\n`];

  roadmap.forEach((tier, i) => {
    if (tier.length === 0) return;
    lines.push(`\n<b>${labels[i]}</b>`);
    tier.forEach((item) => {
      lines.push(`• <b>${esc(item.requirement)}</b> [${item.gap_type}]`);
      lines.push(`  ${esc(item.why_it_matters)}`);
      lines.push(`  → ${esc(item.next_action)}`);
    });
  });

  return lines.join("\n");
}
