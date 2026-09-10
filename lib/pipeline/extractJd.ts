import { callStructured, SchemaType } from "../gemini";
import { JdProfileSchema, type JdProfile } from "../schemas";

const JD_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    role_archetype: {
      type: SchemaType.STRING,
      enum: [
        "software_engineering",
        "data_ml",
        "devops_infra",
        "core_engineering_hardware",
        "design_product",
        "business_ops",
        "other",
      ],
    },
    field_taxonomy_tag: { type: SchemaType.STRING },
    required_years: { type: SchemaType.NUMBER, nullable: true },
    required_level: {
      type: SchemaType.STRING,
      enum: ["entry", "mid", "senior", "lead"],
      nullable: true,
    },
    requirements: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          text: { type: SchemaType.STRING },
          category: {
            type: SchemaType.STRING,
            enum: [
              "technical_skills",
              "experience",
              "domain_alignment",
              "projects",
              "education",
              "certifications",
              "responsibilities",
            ],
          },
          priority_signal: {
            type: SchemaType.STRING,
            enum: ["mandatory", "preferred", "unspecified"],
          },
        },
        required: ["id", "text", "category", "priority_signal"],
      },
    },
  },
  required: [
    "role_archetype",
    "field_taxonomy_tag",
    "requirements",
  ],
};

const SYSTEM_PROMPT = `You are a precise job description parser. Extract every distinct requirement as its own item — do not merge "Java, Python, and SQL" into one requirement, split into three separate requirement items.

Classify priority_signal from the JD's own language:
- "must have," "required," "X+ years," "essential" → mandatory
- "preferred," "nice to have," "a plus," "familiarity with," "bonus" → preferred
- everything else → unspecified

Assign IDs as "r1", "r2", "r3", etc.

Do not infer a candidate's fit here — this call only reads the JD. Extract what the JD asks for, categorize it, and determine its priority signal.

For field_taxonomy_tag, provide a concise description of the role's field, e.g. "backend software engineering", "machine learning engineering", "frontend web development".

For required_years, extract the number of years mentioned (e.g. "5+ years" → 5). If no years mentioned, use null.

For required_level, infer from title and requirements: entry (0-2 years, junior), mid (2-5 years), senior (5+ years), lead (team lead, staff). If unclear, use null.`;

export async function extractJdProfile(jdText: string): Promise<JdProfile> {
  return callStructured(
    SYSTEM_PROMPT,
    `Job Description:\n\n${jdText}`,
    JD_RESPONSE_SCHEMA as Record<string, unknown>,
    (input) => JdProfileSchema.parse(input)
  );
}
