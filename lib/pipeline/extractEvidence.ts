import { callStructured, SchemaType } from "../gemini";
import { EvidenceArraySchema, type Evidence, type Requirement } from "../schemas";

const EVIDENCE_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    field_taxonomy_tag: { type: SchemaType.STRING },
    candidate_years: { type: SchemaType.NUMBER, nullable: true },
    evidence: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          requirement_id: { type: SchemaType.STRING },
          status: {
            type: SchemaType.STRING,
            enum: [
              "explicit",
              "strong_inferred",
              "weak_inferred",
              "missing",
              "contradicted",
            ],
          },
          context: {
            type: SchemaType.STRING,
            enum: ["narrative", "list_mention", "none"],
          },
          quote: { type: SchemaType.STRING, nullable: true },
          model_confidence: { type: SchemaType.NUMBER },
          note: { type: SchemaType.STRING },
        },
        required: [
          "requirement_id",
          "status",
          "context",
          "quote",
          "model_confidence",
          "note",
        ],
      },
    },
  },
  required: ["evidence", "field_taxonomy_tag"],
};

const SYSTEM_PROMPT = `For every requirement, search the résumé text below for supporting evidence. If you find a supporting sentence or phrase, copy it into \`quote\` character-for-character from the résumé — do not paraphrase, do not fix typos, do not combine two separate sentences into one quote. If no supporting text exists, set \`quote\` to null and \`status\` to "missing". Set \`context\` to "narrative" only if the quote sits inside a sentence describing an action, project, or outcome (verbs, tools, numbers). Set \`context\` to "list_mention" if the quote is just a bare item in a skills/tools list with no surrounding description. A skill mentioned only in a list is never "explicit" strength — use "strong_inferred" or lower for list mentions. A related-but-different technology (e.g. résumé says JavaScript, requirement is React; résumé says SQL, requirement is PostgreSQL) is never "explicit" — at most "strong_inferred", and only if there is a real technical relationship, not superficial word similarity.

For field_taxonomy_tag, provide your assessment of the candidate's actual professional field based on their résumé content.
For candidate_years, estimate total years of professional experience. If the résumé is from a fresh graduate with no work experience, use 0. If unclear, use null.

You MUST return exactly one evidence entry per requirement — match by requirement_id.`;

export async function extractEvidence(
  resumeText: string,
  requirements: Requirement[]
): Promise<{
  evidence: Evidence[];
  field_taxonomy_tag: string;
  candidate_years: number | null;
}> {
  const requirementList = requirements
    .map((r) => `- ${r.id}: "${r.text}" (category: ${r.category})`)
    .join("\n");

  const userMessage = `Requirements to evaluate:\n${requirementList}\n\nRésumé text:\n\n${resumeText}`;

  const result = await callStructured(
    SYSTEM_PROMPT,
    userMessage,
    EVIDENCE_RESPONSE_SCHEMA as Record<string, unknown>,
    (input) => EvidenceArraySchema.parse(input)
  );

  return {
    evidence: result.evidence as Evidence[],
    field_taxonomy_tag: result.field_taxonomy_tag,
    candidate_years: result.candidate_years ?? null,
  };
}
