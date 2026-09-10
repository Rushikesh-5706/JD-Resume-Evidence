import { z } from "zod";

export const PrioritySignal = z.enum(["mandatory", "preferred", "unspecified"]);
export type PrioritySignal = z.infer<typeof PrioritySignal>;

export const ReqCategory = z.enum([
  "technical_skills",
  "experience",
  "domain_alignment",
  "projects",
  "education",
  "certifications",
  "responsibilities",
]);
export type ReqCategory = z.infer<typeof ReqCategory>;

export const RequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: ReqCategory,
  priority_signal: PrioritySignal,
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const EvidenceStatus = z.enum([
  "explicit",
  "strong_inferred",
  "weak_inferred",
  "missing",
  "contradicted",
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatus>;

export const EvidenceContext = z.enum(["narrative", "list_mention", "none"]);
export type EvidenceContext = z.infer<typeof EvidenceContext>;

export const EvidenceSchema = z.object({
  requirement_id: z.string(),
  status: EvidenceStatus,
  context: EvidenceContext,
  quote: z.string().nullable(),
  model_confidence: z.number().min(0).max(1),
  note: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema> & {
  verified?: boolean;
  verification_method?: "exact" | "fuzzy" | "failed";
};

export const RoleArchetype = z.enum([
  "software_engineering",
  "data_ml",
  "devops_infra",
  "core_engineering_hardware",
  "design_product",
  "business_ops",
  "other",
]);
export type RoleArchetype = z.infer<typeof RoleArchetype>;

export const RequiredLevel = z.enum(["entry", "mid", "senior", "lead"]).nullable();
export type RequiredLevel = z.infer<typeof RequiredLevel>;

export const JdProfileSchema = z.object({
  role_archetype: RoleArchetype,
  field_taxonomy_tag: z.string(),
  required_years: z.number().nullable(),
  required_level: RequiredLevel,
  requirements: z.array(RequirementSchema),
});
export type JdProfile = z.infer<typeof JdProfileSchema>;

export const ResumeProfileSchema = z.object({
  field_taxonomy_tag: z.string(),
  candidate_years: z.number().nullable(),
});
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

export interface RequirementScore {
  requirement_id: string;
  raw_score: number;
  weight: number;
  flags: string[];
}

export interface ScoreBreakdown {
  overall_score: number;
  category_scores: Record<string, number>;
  domain_alignment_score: number;
  ats_score: number;
  evidence_confidence: number;
  gates_applied: string[];
  critical_gaps: string[];
  important_gaps: string[];
  strengths: string[];
  requirement_scores: RequirementScore[];
}

export interface CandidateResult {
  label: string;
  resume_text: string;
  evidence: Evidence[];
  score: ScoreBreakdown;
  roadmap: RoadmapItem[][];
  resume_profile: ResumeProfile;
  analyzed_at: number;
}

export type TelegramSessionState = "AWAITING_JD" | "AWAITING_RESUMES";

export interface TelegramSession {
  chat_id: number;
  state: TelegramSessionState;
  jd_profile: JdProfile | null;
  candidates: CandidateResult[];
  active_candidate_index: number | null;
}

export interface RoadmapItem {
  requirement: string;
  category: string;
  why_it_matters: string;
  next_action: string;
  gap_type: "experience" | "skill" | "education" | "certification" | "other";
}

export const RoadmapItemSchema = z.object({
  requirement: z.string(),
  category: z.string(),
  why_it_matters: z.string(),
  next_action: z.string(),
  gap_type: z.enum(["experience", "skill", "education", "certification", "other"]),
});

export const RoadmapResponseSchema = z.object({
  priority_1: z.array(RoadmapItemSchema),
  priority_2: z.array(RoadmapItemSchema),
  priority_3: z.array(RoadmapItemSchema).max(2),
});

export const EvidenceArraySchema = z.object({
  evidence: z.array(EvidenceSchema),
  field_taxonomy_tag: z.string(),
  candidate_years: z.number().nullable(),
});
