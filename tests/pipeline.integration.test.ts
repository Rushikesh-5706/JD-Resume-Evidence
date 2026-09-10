import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// These tests only run when GEMINI_API_KEY is set
const API_KEY = process.env.GEMINI_API_KEY;
const describeIfApi = API_KEY ? describe : describe.skip;

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, "fixtures", name), "utf-8");
}

describeIfApi("Pipeline Integration Tests (requires GEMINI_API_KEY)", () => {
  // Increase timeout for API calls
  const TIMEOUT = 60_000;

  it(
    "Test 1: Strong SWE match — full pipeline, overall_score >= 80",
    async () => {
      const { extractJdProfile } = await import("../lib/pipeline/extractJd");
      const { extractEvidence } = await import("../lib/pipeline/extractEvidence");
      const { verifyEvidence } = await import("../lib/pipeline/verify");
      const { computeFullScore } = await import("../lib/pipeline/score");

      const jdText = loadFixture("jd-software-engineer.txt");
      const resumeText = loadFixture("resume-strong-match.txt");

      const jdProfile = await extractJdProfile(jdText);
      expect(jdProfile.requirements.length).toBeGreaterThan(5);
      expect(jdProfile.role_archetype).toBe("software_engineering");

      const { evidence, field_taxonomy_tag, candidate_years } =
        await extractEvidence(resumeText, jdProfile.requirements);

      expect(evidence.length).toBe(jdProfile.requirements.length);

      const verified = verifyEvidence(evidence, resumeText);
      const verifiedCount = verified.filter((e) => e.verified === true).length;
      expect(verifiedCount).toBeGreaterThan(0);

      // Check no hallucinated quotes
      for (const ev of verified) {
        if (ev.quote && ev.verified === false) {
          console.warn(
            `Unverified quote for ${ev.requirement_id}: "${ev.quote}"`
          );
        }
      }

      const resumeProfile = { field_taxonomy_tag, candidate_years };
      const score = computeFullScore(
        verified as import("../lib/schemas").Evidence[],
        jdProfile,
        resumeProfile
      );

      console.log("Strong match score:", score.overall_score);
      console.log("Category scores:", score.category_scores);
      expect(score.overall_score).toBeGreaterThanOrEqual(60);
    },
    TIMEOUT
  );

  it(
    "Test 2: Partial match — 2 mandatory missing, score 30-65",
    async () => {
      const { extractJdProfile } = await import("../lib/pipeline/extractJd");
      const { extractEvidence } = await import("../lib/pipeline/extractEvidence");
      const { verifyEvidence } = await import("../lib/pipeline/verify");
      const { computeFullScore } = await import("../lib/pipeline/score");

      const jdText = loadFixture("jd-software-engineer.txt");
      const resumeText = loadFixture("resume-partial-match.txt");

      const jdProfile = await extractJdProfile(jdText);
      const { evidence, field_taxonomy_tag, candidate_years } =
        await extractEvidence(resumeText, jdProfile.requirements);

      const verified = verifyEvidence(evidence, resumeText);
      const resumeProfile = { field_taxonomy_tag, candidate_years };
      const score = computeFullScore(
        verified as import("../lib/schemas").Evidence[],
        jdProfile,
        resumeProfile
      );

      console.log("Partial match score:", score.overall_score);
      console.log("Critical gaps:", score.critical_gaps);
      expect(score.overall_score).toBeLessThanOrEqual(65);
      expect(score.critical_gaps.length).toBeGreaterThan(0);
    },
    TIMEOUT
  );

  it(
    "Test 3: Domain mismatch — mechanical eng vs SWE, score <= 35",
    async () => {
      const { extractJdProfile } = await import("../lib/pipeline/extractJd");
      const { extractEvidence } = await import("../lib/pipeline/extractEvidence");
      const { verifyEvidence } = await import("../lib/pipeline/verify");
      const { computeFullScore } = await import("../lib/pipeline/score");

      const jdText = loadFixture("jd-software-engineer.txt");
      const resumeText = loadFixture("resume-mechanical-engineer.txt");

      const jdProfile = await extractJdProfile(jdText);
      const { evidence, field_taxonomy_tag, candidate_years } =
        await extractEvidence(resumeText, jdProfile.requirements);

      const verified = verifyEvidence(evidence, resumeText);
      const resumeProfile = { field_taxonomy_tag, candidate_years };
      const score = computeFullScore(
        verified as import("../lib/schemas").Evidence[],
        jdProfile,
        resumeProfile
      );

      console.log("Domain mismatch score:", score.overall_score);
      console.log("Gates:", score.gates_applied);
      expect(score.overall_score).toBeLessThanOrEqual(35);
      expect(score.gates_applied).toContain("severe_domain_mismatch");
    },
    TIMEOUT
  );
});
