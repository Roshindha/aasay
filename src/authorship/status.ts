import { detectAll } from "./detect";
import { AI_TOOLS } from "./patterns";
import { AuthorshipReportSchema, type AuthorshipInput, type AuthorshipReport, type DisclosureStatus, type Overall, type Signal } from "./types";

const GENERIC_TOOL = /AGENTS\.md convention/;

export const REPORT_CAVEATS = [
  "Assay reports signals, not verdicts. It never says who or what wrote the code.",
  "Strong signals show an AI tool was configured or named in this repository, not how much of the code it produced or whether the owner reviewed it.",
  "No strong signals does not mean the code was written by a person. Tools can be used without leaving a trace, and traces can be removed.",
  "Style-based detection is unreliable: speculative signals are shown for completeness and never change the overall result.",
];

function docsText(files: AuthorshipInput["files"]): string {
  return files.filter((f) => /^readme(\.\w+)?$/i.test(f.path.split("/").pop()!) || /^docs\/.+\.(md|mdx|txt|rst)$/i.test(f.path)).map((f) => f.content).join("\n");
}

export function decideStatus(signals: Signal[]): { status: DisclosureStatus; conflicting: boolean } {
  const strong = signals.filter((s) => s.strength === "strong");
  const aiClaim = signals.some((s) => s.claim === "ai-assisted");
  const humanClaim = signals.some((s) => s.claim === "human-only");
  const conflicting = aiClaim && humanClaim;
  if (strong.length) {
    if (humanClaim && !aiClaim) return { status: "mismatch", conflicting };
    return { status: aiClaim ? "disclosed" : "undisclosed", conflicting };
  }
  // No strong signals: a README that says AI was used is the owner's own account, so it is accepted as a disclosure.
  return { status: aiClaim ? "disclosed" : "none-found", conflicting };
}

export function decideOverall(status: DisclosureStatus, signals: Signal[], conflicting: boolean, notNamed: string[]): Overall {
  if (status === "undisclosed" || status === "mismatch") return "action-needed";
  if (status === "disclosed") return conflicting || notNamed.length ? "needs-review" : "clear";
  // none-found: only moderate non-claim evidence (e.g. a burst of large commits) asks for a look.
  // Speculative signals never move the result, and an unverifiable "hand-written" claim is not evidence either.
  const moderateEvidence = signals.some((s) => s.strength === "moderate" && s.kind !== "readme-statement");
  return moderateEvidence ? "needs-review" : "clear";
}

function summarise(status: DisclosureStatus, strong: number, moderate: number, speculative: number, tools: string[], notNamed: string[], conflicting: boolean): string {
  const toolText = tools.length ? ` (${tools.join(", ")})` : "";
  const extra = moderate + speculative ? ` ${moderate} moderate and ${speculative} speculative signal(s) are also listed with their caveats.` : "";
  switch (status) {
    case "mismatch":
      return `The documentation says the project was written without AI, but the repository contains ${strong} strong signal(s) that AI tools were used${toolText}. Review the statement or explain how these signals arose.${extra}`;
    case "undisclosed":
      return `The repository contains ${strong} strong signal(s) that AI tools were used${toolText}, and no statement about it was found in the README or docs. Consider adding an accurate disclosure.${extra}`;
    case "disclosed":
      return `${strong ? `The repository contains ${strong} strong signal(s) that AI tools were used${toolText}, and` : "No strong signals were found, but"} the documentation discloses AI use.` +
        (notNamed.length ? ` It does not name: ${notNamed.join(", ")}.` : "") + (conflicting ? " The documentation also contains a statement claiming no AI use; make the two consistent." : "") + extra;
    default:
      return `No strong signals of AI-assisted authorship were found. This is not evidence that the code was written by a person: tools can be used without leaving a trace.${extra}`;
  }
}

export function buildReport(input: AuthorshipInput): AuthorshipReport {
  const signals = detectAll(input);
  const { status, conflicting } = decideStatus(signals);
  const strong = signals.filter((s) => s.strength === "strong");
  const toolsDetected = [...new Set(strong.map((s) => s.tool).filter((t): t is string => !!t))];
  const text = docsText(input.files);
  const toolsNamedInDocs = AI_TOOLS.filter(({ re }) => re.test(text)).map((t) => t.tool);
  const aiClaimed = signals.some((s) => s.claim === "ai-assisted");
  const toolsNotNamedInDocs = aiClaimed
    ? toolsDetected.filter((t) => !GENERIC_TOOL.test(t) && !toolsNamedInDocs.includes(t))
    : [];
  const counts = {
    strong: strong.length,
    moderate: signals.filter((s) => s.strength === "moderate").length,
    speculative: signals.filter((s) => s.strength === "speculative").length,
  };
  const overall = decideOverall(status, signals, conflicting, toolsNotNamedInDocs);
  return AuthorshipReportSchema.parse({
    status, overall,
    summary: summarise(status, counts.strong, counts.moderate, counts.speculative, toolsDetected, toolsNotNamedInDocs, conflicting),
    signals, counts,
    disclosure: {
      aiClaimed, humanOnlyClaimed: signals.some((s) => s.claim === "human-only"), conflictingClaims: conflicting,
      toolsDetected, toolsNamedInDocs, toolsNotNamedInDocs,
    },
    caveats: REPORT_CAVEATS,
    coverage: {
      paths: input.paths.length, commits: input.commits.length, commitStats: input.commits.some((c) => c.additions !== undefined),
      docsRead: input.files.filter((f) => /^readme(\.\w+)?$/i.test(f.path.split("/").pop()!) || /^docs\/.+\.(md|mdx|txt|rst)$/i.test(f.path)).map((f) => f.path),
    },
  });
}
