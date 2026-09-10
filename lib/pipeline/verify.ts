import { distance } from "fastest-levenshtein";

interface VerifiableEvidence {
  requirement_id: string;
  status: string;
  context: string;
  quote: string | null;
  model_confidence: number;
  note: string;
  verified?: boolean;
  verification_method?: "exact" | "fuzzy" | "failed";
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(/[.\n;!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
  return sentences;
}

// Word-boundary check: ensures a token isn't just a substring of a longer word.
// "Java" must not match inside "JavaScript".
function wordBoundaryMatch(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  return regex.test(haystack);
}

function slidingWindowFuzzyMatch(
  quote: string,
  resumeText: string,
  threshold: number = 0.85
): { matched: boolean; bestRatio: number } {
  const normQuote = normalizeWhitespace(quote);
  const normResume = normalizeWhitespace(resumeText);

  // For very short quotes (single words/skills), use word boundary matching
  if (normQuote.split(" ").length <= 3) {
    if (wordBoundaryMatch(normResume, normQuote)) {
      return { matched: true, bestRatio: 1.0 };
    }
    // Check sentences for fuzzy match on short quotes
    const sentences = splitIntoSentences(normResume);
    let bestRatio = 0;
    for (const sentence of sentences) {
      const words = sentence.split(" ");
      const quoteWords = normQuote.split(" ").length;
      for (let i = 0; i <= words.length - quoteWords; i++) {
        const window = words.slice(i, i + quoteWords).join(" ");
        const ratio = levenshteinRatio(normQuote, window);
        bestRatio = Math.max(bestRatio, ratio);
      }
    }
    return { matched: bestRatio >= threshold, bestRatio };
  }

  // For longer quotes, do a sliding window over characters
  const quoteLen = normQuote.length;
  const windowPadding = Math.max(Math.floor(quoteLen * 0.15), 10);
  let bestRatio = 0;

  for (
    let i = 0;
    i <= normResume.length - quoteLen + windowPadding;
    i += Math.max(1, Math.floor(quoteLen / 4))
  ) {
    const windowEnd = Math.min(i + quoteLen + windowPadding, normResume.length);
    const window = normResume.slice(i, windowEnd);
    const ratio = levenshteinRatio(normQuote, window);
    bestRatio = Math.max(bestRatio, ratio);
    if (bestRatio >= threshold) break;
  }

  return { matched: bestRatio >= threshold, bestRatio };
}

export function verifyEvidence(
  evidence: VerifiableEvidence[],
  resumeText: string
): VerifiableEvidence[] {
  const normResume = normalizeWhitespace(resumeText);

  return evidence.map((item) => {
    if (!item.quote) {
      return {
        ...item,
        verified: undefined,
        verification_method: undefined,
      };
    }

    const normQuote = normalizeWhitespace(item.quote);

    // Step 1: exact substring match
    if (normResume.includes(normQuote)) {
      return {
        ...item,
        verified: true,
        verification_method: "exact" as const,
      };
    }

    // Step 2: sliding-window fuzzy match
    const { matched } = slidingWindowFuzzyMatch(item.quote, resumeText, 0.85);
    if (matched) {
      return {
        ...item,
        verified: true,
        verification_method: "fuzzy" as const,
      };
    }

    // Step 3: verification failed
    return {
      ...item,
      verified: false,
      verification_method: "failed" as const,
    };
  });
}

// Exported for testing
export { wordBoundaryMatch, levenshteinRatio, normalizeWhitespace, slidingWindowFuzzyMatch };
