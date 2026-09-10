import type { Evidence, ScoreBreakdown } from "../schemas";
import { computeAtsScore } from "./score";

export function computeAts(
  evidence: Evidence[],
  requirements: { id: string; priority_signal: string }[]
): {
  ats_score: number;
  missing_mandatory: string[];
  missing_other: string[];
} {
  const atsScore = computeAtsScore(evidence, requirements);

  const mandatoryReqs = requirements.filter(
    (r) => r.priority_signal === "mandatory"
  );
  const missingMandatory = mandatoryReqs
    .filter((r) => {
      const ev = evidence.find((e) => e.requirement_id === r.id);
      return (
        !ev ||
        ev.status === "missing" ||
        ev.status === "weak_inferred" ||
        ev.verified === false
      );
    })
    .map((r) => r.id);

  const otherReqs = requirements.filter(
    (r) => r.priority_signal !== "mandatory"
  );
  const missingOther = otherReqs
    .filter((r) => {
      const ev = evidence.find((e) => e.requirement_id === r.id);
      return (
        !ev ||
        ev.status === "missing" ||
        ev.status === "weak_inferred" ||
        ev.verified === false
      );
    })
    .map((r) => r.id);

  return { ats_score: atsScore, missing_mandatory: missingMandatory, missing_other: missingOther };
}
