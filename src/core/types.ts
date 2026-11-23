import { z } from "zod";

export const LaneSchema = z.enum(["hallucination", "spec-drift", "test-theater", "phantom-dependency"]);
export type Lane = z.infer<typeof LaneSchema>;

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const LabelSchema = z.enum(["confirmed", "likely", "speculative"]);
export type Label = z.infer<typeof LabelSchema>;

export const RegistrySchema = z.enum(["npm", "pypi"]);
export type Registry = z.infer<typeof RegistrySchema>;

export const RegistryStatusSchema = z.enum(["exists", "not-found", "unknown"]);
export type RegistryStatus = z.infer<typeof RegistryStatusSchema>;

export const SourceFileSchema = z.object({ path: z.string(), content: z.string() });
export type SourceFile = z.infer<typeof SourceFileSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  lane: LaneSchema,
  severity: SeveritySchema,
  label: LabelSchema,
  file: z.string(),
  line: z.number().int().nonnegative(),
  title: z.string(),
  detail: z.string(),
  evidence: z.array(z.string()).default([]),
  /** Phantom-dependency lane only */
  specifier: z.string().optional(),
  registry: RegistrySchema.optional(),
  registryStatus: RegistryStatusSchema.optional(),
  typosquatOf: z.string().optional(),
  /** Lanes that independently reported this finding after dedupe */
  lanes: z.array(LaneSchema).default([]),
});
export type Finding = z.infer<typeof FindingSchema>;

export const AnswerKeyEntrySchema = z.object({
  id: z.string(),
  lane: LaneSchema,
  file: z.string(),
  line: z.number().int(),
  critical: z.boolean(),
  description: z.string(),
});
export const AnswerKeySchema = z.object({
  /** Matching tolerance in lines */
  lineTolerance: z.number().int().default(2),
  bugs: z.array(AnswerKeyEntrySchema),
});
export type AnswerKey = z.infer<typeof AnswerKeySchema>;
export type AnswerKeyEntry = z.infer<typeof AnswerKeyEntrySchema>;

export const EvalResultSchema = z.object({
  mode: z.literal("seeded"),
  recall: z.number(),
  precision: z.number(),
  criticalRecall: z.number(),
  gate: z.enum(["pass", "fail"]),
  gateReasons: z.array(z.string()),
  found: z.array(z.string()),
  missed: z.array(z.string()),
  falsePositives: z.array(z.string()),
  totalBugs: z.number(),
  totalFindings: z.number(),
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

export const ScoreAxesSchema = z.object({
  correctness: z.number().min(0).max(1),
  minimality: z.number().min(0).max(1),
  safety: z.number().min(0).max(1),
  maintainability: z.number().min(0).max(1),
  testability: z.number().min(0).max(1),
});
export type ScoreAxes = z.infer<typeof ScoreAxesSchema>;

export const PatchStrategySchema = z.enum(["conservative", "idiomatic", "robust"]);
export type PatchStrategy = z.infer<typeof PatchStrategySchema>;

export const PatchCandidateSchema = z.object({
  id: z.string(),
  findingId: z.string(),
  strategy: PatchStrategySchema,
  summary: z.string(),
  diff: z.string(),
});
export type PatchCandidate = z.infer<typeof PatchCandidateSchema>;

export const GateResultSchema = z.object({
  applies: z.boolean(),
  eligible: z.boolean(),
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), output: z.string() })),
  reason: z.string().optional(),
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const ScoredPatchSchema = z.object({
  candidate: PatchCandidateSchema,
  axes: ScoreAxesSchema,
  total: z.number(),
  gate: GateResultSchema,
});
export type ScoredPatch = z.infer<typeof ScoredPatchSchema>;

export const EvidenceNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["finding", "file", "dependency", "manifest"]),
  label: z.string(),
});
export const EvidenceEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(["located-in", "imports", "declared-in", "duplicates", "missing-from"]),
});
export const EvidenceGraphSchema = z.object({
  nodes: z.array(EvidenceNodeSchema),
  edges: z.array(EvidenceEdgeSchema),
});
export type EvidenceGraph = z.infer<typeof EvidenceGraphSchema>;

export const TelemetrySchema = z.object({
  inspectedFiles: z.array(z.object({ path: z.string(), chars: z.number(), estTokens: z.number() })),
  totalEstTokens: z.number(),
  cacheKeys: z.array(z.string()),
});
export type Telemetry = z.infer<typeof TelemetrySchema>;
