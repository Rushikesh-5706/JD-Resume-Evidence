import { describe, it, expect } from "vitest";
import {
  verifyEvidence,
  wordBoundaryMatch,
  normalizeWhitespace,
} from "../lib/pipeline/verify";

const RESUME_WITH_JAVASCRIPT = `
John Developer
Software Engineer

EXPERIENCE
Senior Frontend Developer | WebCo | 2020 - Present
- Built complex single-page applications using JavaScript and TypeScript
- Implemented responsive UI components with React and CSS modules
- Optimized JavaScript bundle sizes reducing load times by 50%

SKILLS
JavaScript, TypeScript, React, HTML, CSS, Node.js, Git
`;

const RESUME_STRONG = `
Jane Smith
Senior Software Engineer
jane.smith@email.com | San Francisco, CA

PROFESSIONAL EXPERIENCE

Senior Software Engineer | CloudScale Systems | 2019 - Present (5 years)
- Designed and implemented a distributed microservices architecture serving 2M daily active users using Python and Java
- Built RESTful APIs handling 50K requests per minute with comprehensive rate limiting and authentication
- Managed PostgreSQL databases with 500GB+ of data, implementing query optimization that reduced response times by 40%
- Deployed services on AWS using EC2, S3, and Lambda, achieving 99.95% uptime SLA
- Implemented CI/CD pipelines using Jenkins and GitHub Actions, reducing deployment time from 2 hours to 15 minutes
- Containerized all services with Docker and orchestrated them using Kubernetes on EKS
`;

describe("verify.ts", () => {
  describe("wordBoundaryMatch", () => {
    it("should match exact word", () => {
      expect(wordBoundaryMatch("I know Python well", "Python")).toBe(true);
    });

    it("should not match Java inside JavaScript (A2)", () => {
      expect(wordBoundaryMatch("Expert in JavaScript", "Java")).toBe(false);
    });

    it("should match Java when it appears as standalone word", () => {
      expect(wordBoundaryMatch("Expert in Java and Python", "Java")).toBe(true);
    });

    it("should not match partial word boundaries", () => {
      expect(wordBoundaryMatch("Experienced with PostgreSQL", "SQL")).toBe(false);
    });

    it("should handle case-insensitive matching", () => {
      expect(wordBoundaryMatch("Experience with PYTHON", "python")).toBe(true);
    });
  });

  describe("verifyEvidence - exact match", () => {
    it("should verify a quote that exists verbatim in the resume", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "narrative",
          quote:
            "Designed and implemented a distributed microservices architecture serving 2M daily active users using Python and Java",
          model_confidence: 0.95,
          note: "Direct match",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_STRONG);
      expect(result[0].verified).toBe(true);
      expect(result[0].verification_method).toBe("exact");
    });

    it("should handle null quotes without verification status", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "missing",
          context: "none",
          quote: null,
          model_confidence: 0,
          note: "Not found",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_STRONG);
      expect(result[0].verified).toBeUndefined();
      expect(result[0].verification_method).toBeUndefined();
    });
  });

  describe("verifyEvidence - fuzzy match", () => {
    it("should fuzzy-match a quote with minor whitespace differences", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "narrative",
          quote:
            "Designed and implemented a distributed microservices architecture  serving 2M daily active users using Python and Java",
          model_confidence: 0.9,
          note: "Minor whitespace diff",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_STRONG);
      expect(result[0].verified).toBe(true);
    });

    it("should fail verification for a completely fabricated quote (A1)", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "narrative",
          quote:
            "Led the development of a groundbreaking AI platform processing 10 billion requests daily across 50 global data centers",
          model_confidence: 0.95,
          note: "Hallucinated claim",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_STRONG);
      expect(result[0].verified).toBe(false);
      expect(result[0].verification_method).toBe("failed");
    });
  });

  describe("A2 - Java vs JavaScript word boundary", () => {
    it("should NOT verify 'Java' against a resume that only contains 'JavaScript'", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "list_mention",
          quote: "JavaScript",
          model_confidence: 0.8,
          note: "Found JavaScript in skills",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_WITH_JAVASCRIPT);
      // The quote "JavaScript" DOES exist in the resume, so it verifies as a quote
      expect(result[0].verified).toBe(true);
      // But the key test: the word "Java" alone should not pass a word boundary check
      // This is about the scoring/extraction side ensuring Java != JavaScript
      expect(wordBoundaryMatch(RESUME_WITH_JAVASCRIPT, "Java")).toBe(false);
    });

    it("should verify 'JavaScript' when it exists in resume", () => {
      const evidence = [
        {
          requirement_id: "r2",
          status: "explicit",
          context: "narrative",
          quote:
            "Built complex single-page applications using JavaScript and TypeScript",
          model_confidence: 0.95,
          note: "Direct match for JavaScript",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_WITH_JAVASCRIPT);
      expect(result[0].verified).toBe(true);
      expect(result[0].verification_method).toBe("exact");
    });
  });

  describe("A3 - Evidence specificity", () => {
    it("should verify the quote exists but scoring handles the specificity gap", () => {
      const cloudResume = `
        Mike Chen
        EXPERIENCE
        - Worked with various cloud technologies including AWS and Azure for hosting
        - familiar with cloud technologies and deployment
      `;

      const evidence = [
        {
          requirement_id: "r1",
          status: "weak_inferred",
          context: "narrative",
          quote: "familiar with cloud technologies",
          model_confidence: 0.3,
          note: "Generic cloud mention, not specific to AWS Lambda",
        },
      ];

      const result = verifyEvidence(evidence, cloudResume);
      expect(result[0].verified).toBe(true);
      // The status should remain weak_inferred — scored in score.test.ts
    });
  });

  describe("edge cases", () => {
    it("should handle empty resume text", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "narrative",
          quote: "Some quote",
          model_confidence: 0.9,
          note: "Test",
        },
      ];

      const result = verifyEvidence(evidence, "");
      expect(result[0].verified).toBe(false);
      expect(result[0].verification_method).toBe("failed");
    });

    it("should handle empty evidence array", () => {
      const result = verifyEvidence([], RESUME_STRONG);
      expect(result).toEqual([]);
    });

    it("should handle quote with different casing", () => {
      const evidence = [
        {
          requirement_id: "r1",
          status: "explicit",
          context: "narrative",
          quote: "deployed services on aws using ec2, s3, and lambda",
          model_confidence: 0.9,
          note: "Lowercase version",
        },
      ];

      const result = verifyEvidence(evidence, RESUME_STRONG);
      expect(result[0].verified).toBe(true);
    });
  });
});
