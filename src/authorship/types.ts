import { z } from "zod";

/** How much weight a signal deserves. "speculative" signals can never change a repo's overall result by themselves. */
export const StrengthSchema = z.enum(["strong", "moderate", "speculative"]);
export type Strength = z.infer<typeof StrengthSchema>;

export const SignalKindSchema = z.enum(["commit-trailer", "bot-author", "tool-file", "readme-statement", "history-pattern", "style-pattern"]);
export type SignalKind = z.infer<typeof SignalKindSchema>;

export const CommitInfoSchema = z.object({
  sha: z.string(),
  message: z.string(),
  authorName: z.string().default(""),
  authorEmail: z.string().default(""),
  committerName: z.string().optional(),
  committerEmail: z.string().optional(),
  /** ISO 8601 */
  date: z.string(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});
export type CommitInfo = z.infer<typeof CommitInfoSchema>;

export const SignalSchema = z.object({
  id: z.string(),
  kind: SignalKindSchema,
  strength: StrengthSchema,
  /** Stable key used by the answer key, e.g. "tool-file:CLAUDE.md", "commit-trailer:3fa91c2", "readme:human", "history:burst" */
  ref: z.string(),
  title: z.string(),
  /** Plain-language explanation of what the signal does and does not show */
  explanation: z.string(),
  evidence: z.array(z.string()),
  file: z.string().optional(),
  line: z.number().int().optional(),
  commit: z.string().optional(),
  /** AI tool the signal points at, when identifiable */
  tool: z.string().optional(),
  /** For README statements: what the text claims */
  claim: z.enum(["ai-assisted", "human-only"]).optional(),
  /** Shown next to speculative and history signals */
  caveat: z.string().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const DisclosureStatusSchema = z.enum(["disclosed", "undisclosed", "mismatch", "none-found"]);
export type DisclosureStatus = z.infer<typeof DisclosureStatusSchema>;

export const OverallSchema = z.enum(["clear", "needs-review", "action-needed"]);
export type Overall = z.infer<typeof OverallSchema>;

export const AuthorshipReportSchema = z.object({
  status: DisclosureStatusSchema,
  overall: OverallSchema,
  /** Plain-language summary. Never a verdict about who or what wrote the code. */
  summary: z.string(),
  signals: z.array(SignalSchema),
  counts: z.object({ strong: z.number(), moderate: z.number(), speculative: z.number() }),
  disclosure: z.object({
    aiClaimed: z.boolean(),
    humanOnlyClaimed: z.boolean(),
    conflictingClaims: z.boolean(),
    toolsDetected: z.array(z.string()),
    toolsNamedInDocs: z.array(z.string()),
    toolsNotNamedInDocs: z.array(z.string()),
  }),
  caveats: z.array(z.string()),
  /** What the audit looked at, so a clean result is not over-read */
  coverage: z.object({ paths: z.number(), commits: z.number(), commitStats: z.boolean(), docsRead: z.array(z.string()) }),
});
export type AuthorshipReport = z.infer<typeof AuthorshipReportSchema>;

/** Everything the audit reads. `paths` is the full file listing (including hidden folders); `files` are the readable text files. */
export interface AuthorshipInput {
  paths: string[];
  files: Array<{ path: string; content: string }>;
  commits: CommitInfo[];
}

export const STYLE_CAVEAT =
  "Style patterns are weak evidence. Human authors write dense comments, placeholders, generic names and thorough docstrings too, and AI-assisted code is often edited until it looks ordinary. This signal alone says nothing reliable about authorship.";
export const HISTORY_CAVEAT =
  "Commit-history shape has many innocent explanations (importing an existing project, squashed merges, scripted commits, bulk refactors). Treat it as a prompt to look, not as evidence of anything.";
