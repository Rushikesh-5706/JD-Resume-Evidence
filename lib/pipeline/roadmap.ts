import { callStructured, SchemaType } from "../gemini";
import { RoadmapResponseSchema, type RoadmapItem } from "../schemas";

const ROADMAP_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    priority_1: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          requirement: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          why_it_matters: { type: SchemaType.STRING },
          next_action: { type: SchemaType.STRING },
          gap_type: {
            type: SchemaType.STRING,
            enum: ["experience", "skill", "education", "certification", "other"],
          },
        },
        required: [
          "requirement",
          "category",
          "why_it_matters",
          "next_action",
          "gap_type",
        ],
      },
    },
    priority_2: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          requirement: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          why_it_matters: { type: SchemaType.STRING },
          next_action: { type: SchemaType.STRING },
          gap_type: {
            type: SchemaType.STRING,
            enum: ["experience", "skill", "education", "certification", "other"],
          },
        },
        required: [
          "requirement",
          "category",
          "why_it_matters",
          "next_action",
          "gap_type",
        ],
      },
    },
    priority_3: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          requirement: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          why_it_matters: { type: SchemaType.STRING },
          next_action: { type: SchemaType.STRING },
          gap_type: {
            type: SchemaType.STRING,
            enum: ["experience", "skill", "education", "certification", "other"],
          },
        },
        required: [
          "requirement",
          "category",
          "why_it_matters",
          "next_action",
          "gap_type",
        ],
      },
    },
  },
  required: ["priority_1", "priority_2", "priority_3"],
};

const SYSTEM_PROMPT = `You are generating a focused improvement roadmap for a job candidate. You receive ONLY the gaps found between a résumé and a job description.

Group into:
- Priority 1: Critical gaps (mandatory requirements that are missing or weak)
- Priority 2: Important gaps (other requirements that are missing or weak)
- Priority 3: Minor gaps worth mentioning (max 2 items)

For each item:
- One sentence on why it matters for this specific role
- One concrete next action: a course, project, or resume-wording fix — be explicit about which type of gap it is
- Never claim that completing a course makes the candidate equivalent to someone with real production experience
- If the gap is an experience gap, recommend a project, not a course
- If the gap is a skill gap they can learn, recommend a specific course or tutorial
- If the gap is a resume-wording issue, suggest how to reframe existing experience

Be specific and actionable. No generic advice like "gain more experience."`;

export async function generateRoadmap(
  criticalGaps: { text: string; category: string; weight: number }[],
  importantGaps: { text: string; category: string; weight: number }[],
  roleArchetype: string
): Promise<RoadmapItem[][]> {
  const gapList = [
    ...criticalGaps.map(
      (g) =>
        `[CRITICAL] "${g.text}" (category: ${g.category}, weight: ${g.weight})`
    ),
    ...importantGaps.map(
      (g) =>
        `[IMPORTANT] "${g.text}" (category: ${g.category}, weight: ${g.weight})`
    ),
  ].join("\n");

  if (gapList.trim().length === 0) {
    return [[], [], []];
  }

  const userMessage = `Role archetype: ${roleArchetype}\n\nGaps identified:\n${gapList}`;

  const result = await callStructured(
    SYSTEM_PROMPT,
    userMessage,
    ROADMAP_RESPONSE_SCHEMA as Record<string, unknown>,
    (input) => RoadmapResponseSchema.parse(input)
  );

  return [result.priority_1, result.priority_2, result.priority_3];
}
