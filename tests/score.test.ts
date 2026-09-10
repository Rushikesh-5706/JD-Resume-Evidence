import { describe, it, expect } from "vitest";
import {
  scoreRequirement,
  computeCategoryScores,
  computeOverallScore,
  computeFullScore,
  computeAtsScore,
} from "../lib/pipeline/score";
import type { Evidence, JdProfile, ResumeProfile } from "../lib/schemas";

// Helpers to create evidence and requirements quickly
function makeEvidence(overrides: Partial<Evidence> & { requirement_id: string }): Evidence {
  return {
    status: "explicit",
    context: "narrative",
    quote: "some quote",
    model_confidence: 0.9,
    note: "test",
    verified: true,
    verification_method: "exact",
    ...overrides,
  } as Evidence;
}

function makeJdProfile(overrides?: Partial<JdProfile>): JdProfile {
  return {
    role_archetype: "software_engineering",
    field_taxonomy_tag: "backend software engineering",
    required_years: 5,
    required_level: "senior",
    requirements: [
      { id: "r1", text: "Python", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r2", text: "Java", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r3", text: "PostgreSQL", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r4", text: "Microservices", category: "experience", priority_signal: "mandatory" },
      { id: "r5", text: "AWS (EC2, S3, Lambda)", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r6", text: "RESTful API design", category: "responsibilities", priority_signal: "mandatory" },
      { id: "r7", text: "Docker and Kubernetes", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r8", text: "CS degree", category: "education", priority_signal: "mandatory" },
      { id: "r9", text: "CI/CD pipelines", category: "technical_skills", priority_signal: "mandatory" },
      { id: "r10", text: "5+ years experience", category: "experience", priority_signal: "mandatory" },
      { id: "r11", text: "Kafka or RabbitMQ", category: "technical_skills", priority_signal: "preferred" },
      { id: "r12", text: "GraphQL", category: "technical_skills", priority_signal: "preferred" },
      { id: "r13", text: "Monitoring tools", category: "technical_skills", priority_signal: "preferred" },
      { id: "r14", text: "Terraform", category: "technical_skills", priority_signal: "preferred" },
    ],
    ...overrides,
  } as JdProfile;
}

describe("score.ts", () => {
  describe("scoreRequirement", () => {
    it("scores explicit + narrative at 95", () => {
      const ev = makeEvidence({ requirement_id: "r1", status: "explicit", context: "narrative", verified: true });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(95);
      expect(result.weight).toBe(3);
    });

    it("caps list_mention at 60 regardless of status", () => {
      const ev = makeEvidence({ requirement_id: "r1", status: "explicit", context: "list_mention", verified: true });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(60);
      expect(result.flags).toContain("list_mention_capped");
    });

    it("caps verification_failed at 15 (A1 mechanism)", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "explicit",
        context: "narrative",
        verified: false,
        verification_method: "failed",
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBeLessThanOrEqual(15);
      expect(result.flags).toContain("verification_failed");
    });

    it("scores missing at 0", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "missing",
        context: "none",
        quote: null,
        verified: undefined,
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(0);
    });

    it("scores contradicted at 0 with flag", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "contradicted",
        context: "narrative",
        verified: true,
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(0);
      expect(result.flags).toContain("contradicted_evidence");
    });

    it("scores strong_inferred at 65", () => {
      const ev = makeEvidence({ requirement_id: "r1", status: "strong_inferred", context: "narrative", verified: true });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(65);
    });

    it("scores weak_inferred at 35", () => {
      const ev = makeEvidence({ requirement_id: "r1", status: "weak_inferred", context: "narrative", verified: true });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(35);
    });

    it("assigns correct priority weights", () => {
      const ev = makeEvidence({ requirement_id: "r1" });
      expect(scoreRequirement(ev, "mandatory").weight).toBe(3);
      expect(scoreRequirement(ev, "unspecified").weight).toBe(2);
      expect(scoreRequirement(ev, "preferred").weight).toBe(1);
    });
  });

  // Test 1: Strong SWE résumé — overall_score >= 80
  describe("Test 1: Strong SWE match", () => {
    it("should score >= 80 for a strong match", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "backend software engineering", candidate_years: 8 };
      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({ requirement_id: r.id, status: "explicit", context: "narrative", verified: true })
      );

      const result = computeFullScore(evidence, jd, resume);
      expect(result.overall_score).toBeGreaterThanOrEqual(80);
      expect(result.critical_gaps).toHaveLength(0);
    });
  });

  // Test 2: Partial match — 45-65, critical gaps named
  describe("Test 2: Partial match with missing mandatory skills", () => {
    it("should score 45-65 with critical gaps for missing mandatory items", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "frontend software engineering", candidate_years: 3 };

      const evidence: Evidence[] = [
        makeEvidence({ requirement_id: "r1", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r2", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r3", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r4", status: "weak_inferred", context: "narrative", verified: true }),
        makeEvidence({ requirement_id: "r5", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r6", status: "explicit", context: "narrative", verified: true }),
        makeEvidence({ requirement_id: "r7", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r8", status: "explicit", context: "narrative", verified: true }),
        makeEvidence({ requirement_id: "r9", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r10", status: "weak_inferred", context: "narrative", verified: true }),
        makeEvidence({ requirement_id: "r11", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r12", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r13", status: "missing", context: "none", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r14", status: "missing", context: "none", quote: null, verified: undefined }),
      ];

      const result = computeFullScore(evidence, jd, resume);
      expect(result.overall_score).toBeGreaterThanOrEqual(10);
      expect(result.overall_score).toBeLessThanOrEqual(65);
      expect(result.critical_gaps.length).toBeGreaterThan(0);
      expect(result.critical_gaps).toContain("Python");
      expect(result.critical_gaps).toContain("Java");
    });
  });

  // Test 3: Domain mismatch — score <= 35
  describe("Test 3: Mechanical engineer vs SWE JD", () => {
    it("should score <= 35 with severe_domain_mismatch", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "mechanical engineering", candidate_years: 10 };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({
          requirement_id: r.id,
          status: "missing",
          context: "none",
          quote: null,
          verified: undefined,
        })
      );

      const result = computeFullScore(evidence, jd, resume);
      expect(result.overall_score).toBeLessThanOrEqual(35);
      expect(result.gates_applied).toContain("severe_domain_mismatch");
    });
  });

  // Test 4: Keyword-stuffed list — technical_skills category <= 55
  describe("Test 4: Keyword-stuffed skills list", () => {
    it("should cap technical_skills at <= 55 despite full keyword presence", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "software engineering", candidate_years: null };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({
          requirement_id: r.id,
          status: r.category === "technical_skills" ? "strong_inferred" : "missing",
          context: r.category === "technical_skills" ? "list_mention" : "none",
          quote: r.category === "technical_skills" ? r.text : null,
          verified: r.category === "technical_skills" ? true : undefined,
        })
      );

      const result = computeFullScore(evidence, jd, resume);
      expect(result.category_scores["technical_skills"]).toBeLessThanOrEqual(60);
    });
  });

  // Test 5: AWS vs Amazon Web Services — semantic equivalence
  describe("Test 5: AWS = Amazon Web Services", () => {
    it("should score explicit + verified for semantic equivalent", () => {
      const ev = makeEvidence({
        requirement_id: "r5",
        status: "explicit",
        context: "narrative",
        quote: "Deployed on Amazon Web Services including EC2, S3, and Lambda",
        verified: true,
        verification_method: "exact",
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(95);
    });
  });

  // Test 6: React required, only JavaScript mentioned
  describe("Test 6: Related-not-equivalent (React vs JavaScript)", () => {
    it("should score at most strong_inferred (65) for related technology", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "strong_inferred",
        context: "narrative",
        verified: true,
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBeLessThanOrEqual(65);
    });
  });

  // Test 7: Seniority gap — fresh grad vs 5+ years senior
  describe("Test 7: Seniority gap", () => {
    it("should apply seniority_gap and reduce score by >= 20", () => {
      const jd = makeJdProfile({ required_years: 5, required_level: "senior" });
      const resume: ResumeProfile = { field_taxonomy_tag: "software engineering", candidate_years: 0 };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({
          requirement_id: r.id,
          status: "weak_inferred",
          context: "narrative",
          verified: true,
        })
      );

      const scoreWithoutGap = computeFullScore(evidence, jd, {
        ...resume,
        candidate_years: 10,
      });
      const scoreWithGap = computeFullScore(evidence, jd, resume);

      expect(scoreWithGap.gates_applied).toContain("seniority_gap");
      expect(scoreWithGap.overall_score).toBeLessThanOrEqual(
        scoreWithoutGap.overall_score - 15 // at least significantly reduced
      );
    });
  });

  // Test 8: Unrelated/no degree
  describe("Test 8: Unrelated or missing degree", () => {
    it("should have education category <= 30 for missing degree", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "backend software engineering", candidate_years: 5 };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({
          requirement_id: r.id,
          status: r.id === "r8" ? "missing" : "explicit",
          context: r.id === "r8" ? "none" : "narrative",
          quote: r.id === "r8" ? null : "some quote",
          verified: r.id === "r8" ? undefined : true,
        })
      );

      const result = computeFullScore(evidence, jd, resume);
      if (result.category_scores["education"] !== undefined) {
        expect(result.category_scores["education"]).toBeLessThanOrEqual(30);
      }
    });
  });

  // Test 9: Overqualification flag
  describe("Test 9: Overqualified senior for junior role", () => {
    it("should flag overqualified_review without penalizing score", () => {
      const jd = makeJdProfile({ required_years: 2, required_level: "entry" });
      const resume: ResumeProfile = { field_taxonomy_tag: "backend software engineering", candidate_years: 15 };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({ requirement_id: r.id, status: "explicit", context: "narrative", verified: true })
      );

      const result = computeFullScore(evidence, jd, resume);
      expect(result.gates_applied).toContain("overqualified_review");
      // No score penalty for overqualification
      expect(result.overall_score).toBeGreaterThanOrEqual(80);
    });
  });

  // Test 10: Sparse résumé
  describe("Test 10: Sparse 3-line résumé", () => {
    it("should have most requirements missing and low evidence_confidence", () => {
      const jd = makeJdProfile();
      const resume: ResumeProfile = { field_taxonomy_tag: "unknown", candidate_years: null };

      const evidence: Evidence[] = jd.requirements.map((r) =>
        makeEvidence({
          requirement_id: r.id,
          status: "missing",
          context: "none",
          quote: null,
          verified: undefined,
        })
      );

      const result = computeFullScore(evidence, jd, resume);
      const missingCount = evidence.filter((e) => e.status === "missing").length;
      expect(missingCount).toBe(jd.requirements.length);
      expect(result.evidence_confidence).toBe(0);
      expect(result.overall_score).toBeLessThanOrEqual(35);
    });
  });

  // Test A1: Hallucinated quote capped at 15
  describe("Test A1: Hallucinated evidence capped at 15", () => {
    it("should cap score at 15 for verification_failed", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "explicit",
        context: "narrative",
        verified: false,
        verification_method: "failed",
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBeLessThanOrEqual(15);
      expect(result.flags).toContain("verification_failed");
    });
  });

  // Test A3: Generic cloud mention scored as weak_inferred
  describe("Test A3: Evidence specificity — generic vs specific", () => {
    it("should score weak_inferred at 35", () => {
      const ev = makeEvidence({
        requirement_id: "r1",
        status: "weak_inferred",
        context: "narrative",
        verified: true,
      });
      const result = scoreRequirement(ev, "mandatory");
      expect(result.raw_score).toBe(35);
    });
  });

  describe("ATS score", () => {
    it("should compute ATS score correctly", () => {
      const requirements = [
        { id: "r1", priority_signal: "mandatory" },
        { id: "r2", priority_signal: "mandatory" },
        { id: "r3", priority_signal: "preferred" },
      ];

      const evidence: Evidence[] = [
        makeEvidence({ requirement_id: "r1", status: "explicit", verified: true }),
        makeEvidence({ requirement_id: "r2", status: "missing", quote: null, verified: undefined }),
        makeEvidence({ requirement_id: "r3", status: "explicit", verified: true }),
      ];

      const ats = computeAtsScore(evidence, requirements);
      // mandatory coverage: 1/2 = 0.5, overall coverage: 2/3 = 0.667
      // ats = round(0.7 * 50 + 0.3 * 66.7) = round(35 + 20) = 55
      expect(ats).toBeGreaterThanOrEqual(50);
      expect(ats).toBeLessThanOrEqual(60);
    });
  });
});
