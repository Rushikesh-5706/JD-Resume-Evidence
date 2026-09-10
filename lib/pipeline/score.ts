import type {
  Evidence,
  JdProfile,
  ResumeProfile,
  RequirementScore,
  ScoreBreakdown,
  ReqCategory,
  RoleArchetype,
} from "../schemas";
import { computeDomainAlignmentScore } from "../taxonomy";

const STATUS_BASE_SCORES: Record<string, number> = {
  explicit: 95,
  strong_inferred: 65,
  weak_inferred: 35,
  missing: 0,
  contradicted: 0,
};

const PRIORITY_WEIGHTS: Record<string, number> = {
  mandatory: 3,
  unspecified: 2,
  preferred: 1,
};

const ARCHETYPE_CATEGORY_WEIGHTS: Record<
  string,
  Record<string, number>
> = {
  software_engineering: {
    technical_skills: 0.3,
    experience: 0.2,
    domain_alignment: 0.1,
    projects: 0.2,
    education: 0.05,
    certifications: 0.05,
    responsibilities: 0.1,
  },
  data_ml: {
    technical_skills: 0.28,
    experience: 0.17,
    domain_alignment: 0.1,
    projects: 0.25,
    education: 0.1,
    certifications: 0.05,
    responsibilities: 0.05,
  },
  devops_infra: {
    technical_skills: 0.3,
    experience: 0.2,
    domain_alignment: 0.1,
    projects: 0.15,
    education: 0.05,
    certifications: 0.1,
    responsibilities: 0.1,
  },
  core_engineering_hardware: {
    technical_skills: 0.25,
    experience: 0.2,
    domain_alignment: 0.2,
    projects: 0.15,
    education: 0.1,
    certifications: 0.05,
    responsibilities: 0.05,
  },
  design_product: {
    technical_skills: 0.15,
    experience: 0.2,
    domain_alignment: 0.15,
    projects: 0.25,
    education: 0.1,
    certifications: 0.05,
    responsibilities: 0.1,
  },
  business_ops: {
    technical_skills: 0.1,
    experience: 0.25,
    domain_alignment: 0.15,
    projects: 0.1,
    education: 0.15,
    certifications: 0.1,
    responsibilities: 0.15,
  },
  other: {
    technical_skills: 0.2,
    experience: 0.2,
    domain_alignment: 0.15,
    projects: 0.15,
    education: 0.15,
    certifications: 0.05,
    responsibilities: 0.1,
  },
};

export function scoreRequirement(
  evidence: Evidence,
  prioritySignal: string
): RequirementScore {
  const flags: string[] = [];

  let score = STATUS_BASE_SCORES[evidence.status] ?? 0;

  if (evidence.status === "contradicted") {
    flags.push("contradicted_evidence");
  }

  // Context modifier: list_mention caps at 60
  if (evidence.context === "list_mention") {
    score = Math.min(score, 60);
    if (score < STATUS_BASE_SCORES[evidence.status]) {
      flags.push("list_mention_capped");
    }
  }

  // Verification modifier: failed verification caps at 15
  if (evidence.verified === false) {
    score = Math.min(score, 15);
    flags.push("verification_failed");
  }

  const weight = PRIORITY_WEIGHTS[prioritySignal] ?? 2;

  return {
    requirement_id: evidence.requirement_id,
    raw_score: score,
    weight,
    flags,
  };
}

export function computeCategoryScores(
  requirementScores: RequirementScore[],
  requirements: { id: string; category: string }[]
): Record<string, number> {
  const categoryScores: Record<string, number> = {};
  const categories = new Set(requirements.map((r) => r.category));

  for (const cat of categories) {
    const catReqIds = requirements
      .filter((r) => r.category === cat)
      .map((r) => r.id);
    const catScores = requirementScores.filter((rs) =>
      catReqIds.includes(rs.requirement_id)
    );

    if (catScores.length === 0) {
      categoryScores[cat] = 0;
      continue;
    }

    const weightedSum = catScores.reduce(
      (sum, rs) => sum + rs.raw_score * rs.weight,
      0
    );
    const totalWeight = catScores.reduce((sum, rs) => sum + rs.weight, 0);
    categoryScores[cat] = Math.round(weightedSum / totalWeight);
  }

  return categoryScores;
}

export function computeOverallScore(
  categoryScores: Record<string, number>,
  archetype: string
): number {
  const weights = ARCHETYPE_CATEGORY_WEIGHTS[archetype] ?? ARCHETYPE_CATEGORY_WEIGHTS.other;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [cat, weight] of Object.entries(weights)) {
    if (cat in categoryScores) {
      weightedSum += categoryScores[cat] * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

export function computeFullScore(
  evidence: Evidence[],
  jdProfile: JdProfile,
  resumeProfile: ResumeProfile
): ScoreBreakdown {
  const gatesApplied: string[] = [];

  // Score each requirement
  const requirementScores = evidence.map((ev) => {
    const req = jdProfile.requirements.find((r) => r.id === ev.requirement_id);
    return scoreRequirement(ev, req?.priority_signal ?? "unspecified");
  });

  // Category scores
  const categoryScores = computeCategoryScores(
    requirementScores,
    jdProfile.requirements
  );

  // Overall pre-gate
  let overallScore = computeOverallScore(categoryScores, jdProfile.role_archetype);

  // Domain alignment
  const domainAlignmentScore = computeDomainAlignmentScore(
    jdProfile.role_archetype,
    jdProfile.field_taxonomy_tag,
    resumeProfile.field_taxonomy_tag
  );

  // Domain gate
  if (domainAlignmentScore < 30) {
    overallScore = Math.min(overallScore, 35);
    gatesApplied.push("severe_domain_mismatch");
  } else if (domainAlignmentScore < 55) {
    overallScore = Math.min(overallScore, 60);
    gatesApplied.push("domain_concern");
  }

  // Seniority gate
  if (
    jdProfile.required_years !== null &&
    resumeProfile.candidate_years !== null
  ) {
    if (resumeProfile.candidate_years < jdProfile.required_years * 0.5) {
      overallScore -= 20;
      gatesApplied.push("seniority_gap");
    }
    if (
      jdProfile.required_level &&
      ["entry", "mid"].includes(jdProfile.required_level) &&
      resumeProfile.candidate_years > jdProfile.required_years * 2.5
    ) {
      gatesApplied.push("overqualified_review");
    }
  }

  // Clamp
  overallScore = Math.max(0, Math.min(100, overallScore));

  // Gaps and strengths
  const criticalGaps: string[] = [];
  const importantGaps: string[] = [];
  const strengths: string[] = [];

  for (const ev of evidence) {
    const req = jdProfile.requirements.find((r) => r.id === ev.requirement_id);
    if (!req) continue;

    const rs = requirementScores.find(
      (s) => s.requirement_id === ev.requirement_id
    );
    if (!rs) continue;

    const isMissing =
      ev.status === "missing" ||
      ev.status === "weak_inferred" ||
      ev.verified === false;

    if (isMissing) {
      if (req.priority_signal === "mandatory") {
        criticalGaps.push(req.text);
      } else if (req.priority_signal === "unspecified") {
        importantGaps.push(req.text);
      }
    }

    if (rs.raw_score >= 80 && ev.context === "narrative") {
      strengths.push(req.text);
    }
  }

  // Evidence confidence: ratio of verified evidence to total with quotes
  const withQuotes = evidence.filter((e) => e.quote !== null);
  const verifiedCount = withQuotes.filter((e) => e.verified === true).length;
  const evidenceConfidence =
    withQuotes.length > 0
      ? Math.round((verifiedCount / withQuotes.length) * 100)
      : 0;

  // ATS score
  const atsScore = computeAtsScore(evidence, jdProfile.requirements);

  return {
    overall_score: overallScore,
    category_scores: categoryScores,
    domain_alignment_score: domainAlignmentScore,
    ats_score: atsScore,
    evidence_confidence: evidenceConfidence,
    gates_applied: gatesApplied,
    critical_gaps: criticalGaps,
    important_gaps: importantGaps,
    strengths,
    requirement_scores: requirementScores,
  };
}

export function computeAtsScore(
  evidence: Evidence[],
  requirements: { id: string; priority_signal: string }[]
): number {
  const mandatoryReqs = requirements.filter(
    (r) => r.priority_signal === "mandatory"
  );

  const mandatoryCoverage =
    mandatoryReqs.length > 0
      ? mandatoryReqs.filter((r) => {
          const ev = evidence.find((e) => e.requirement_id === r.id);
          return (
            ev &&
            (ev.status === "explicit" || ev.status === "strong_inferred") &&
            ev.verified !== false
          );
        }).length / mandatoryReqs.length
      : 0;

  const overallCoverage =
    requirements.length > 0
      ? requirements.filter((r) => {
          const ev = evidence.find((e) => e.requirement_id === r.id);
          return (
            ev &&
            (ev.status === "explicit" || ev.status === "strong_inferred") &&
            ev.verified !== false
          );
        }).length / requirements.length
      : 0;

  return Math.round(0.7 * mandatoryCoverage * 100 + 0.3 * overallCoverage * 100);
}
