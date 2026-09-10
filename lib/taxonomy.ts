import type { RoleArchetype } from "./schemas";

interface AdjacencyEntry {
  same: string[];
  adjacent: string[];
}

const ARCHETYPE_ADJACENCY: Record<string, AdjacencyEntry> = {
  software_engineering: {
    same: [
      "software engineering", "backend software engineering",
      "frontend software engineering", "fullstack software engineering",
      "web development", "mobile development", "software development",
    ],
    adjacent: [
      "devops", "infrastructure engineering", "data engineering",
      "machine learning engineering", "cloud engineering",
      "site reliability engineering", "platform engineering",
    ],
  },
  data_ml: {
    same: [
      "data science", "machine learning", "artificial intelligence",
      "data engineering", "ml engineering", "deep learning",
      "natural language processing", "computer vision",
    ],
    adjacent: [
      "software engineering", "backend software engineering",
      "data analytics", "statistics", "research engineering",
    ],
  },
  devops_infra: {
    same: [
      "devops", "infrastructure engineering", "site reliability engineering",
      "cloud engineering", "platform engineering", "systems administration",
    ],
    adjacent: [
      "software engineering", "backend software engineering",
      "network engineering", "security engineering",
    ],
  },
  core_engineering_hardware: {
    same: [
      "hardware engineering", "embedded systems", "firmware engineering",
      "electrical engineering", "chip design", "VLSI", "FPGA",
      "mechanical engineering", "robotics engineering",
    ],
    adjacent: [
      "systems programming", "IoT engineering",
    ],
  },
  design_product: {
    same: [
      "product design", "UX design", "UI design", "interaction design",
      "product management", "UX research",
    ],
    adjacent: [
      "frontend software engineering", "web development",
      "graphic design", "visual design",
    ],
  },
  business_ops: {
    same: [
      "business operations", "project management", "program management",
      "business analysis", "management consulting", "operations management",
    ],
    adjacent: [
      "product management", "data analytics", "financial analysis",
      "marketing", "sales operations",
    ],
  },
  other: {
    same: [],
    adjacent: [],
  },
};

function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
}

export function computeDomainAlignmentScore(
  jdArchetype: RoleArchetype,
  jdFieldTag: string,
  resumeFieldTag: string
): number {
  const normJd = normalizeTag(jdFieldTag);
  const normResume = normalizeTag(resumeFieldTag);

  if (normJd === normResume) return 100;

  const adjacency = ARCHETYPE_ADJACENCY[jdArchetype];
  if (!adjacency) return 50;

  const sameNorm = adjacency.same.map(normalizeTag);
  const adjNorm = adjacency.adjacent.map(normalizeTag);

  const resumeInSame = sameNorm.some(
    (s) => normResume.includes(s) || s.includes(normResume)
  );
  if (resumeInSame) return 90;

  const jdInSame = sameNorm.some(
    (s) => normJd.includes(s) || s.includes(normJd)
  );
  const resumeInAdj = adjNorm.some(
    (s) => normResume.includes(s) || s.includes(normResume)
  );

  if (jdInSame && resumeInAdj) return 50;
  if (resumeInAdj) return 50;

  const resumeArchetypeMatch = Object.entries(ARCHETYPE_ADJACENCY).find(
    ([, entry]) =>
      entry.same.map(normalizeTag).some(
        (s) => normResume.includes(s) || s.includes(normResume)
      )
  );

  if (resumeArchetypeMatch) {
    const resumeArch = resumeArchetypeMatch[0];
    if (resumeArch === jdArchetype) return 90;

    const jdAdj = ARCHETYPE_ADJACENCY[jdArchetype]?.adjacent.map(normalizeTag) ?? [];
    const resumeSameFields = ARCHETYPE_ADJACENCY[resumeArch]?.same.map(normalizeTag) ?? [];
    const hasOverlap = resumeSameFields.some((f) =>
      jdAdj.some((a) => f.includes(a) || a.includes(f))
    );
    if (hasOverlap) return 50;
  }

  return 10;
}
