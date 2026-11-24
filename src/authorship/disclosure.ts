import type { AuthorshipReport, Signal } from "./types";

export interface OwnerAccount { tools?: string[]; assisted?: string[]; reviewed?: string }
export interface DisclosureClaim { text: string; /** ids of the signals that support the sentence, or "owner" for text the owner supplied */ basis: string[] | "owner" }
export interface DisclosureDraft { markdown: string; claims: DisclosureClaim[]; includedSignalIds: string[] }

const FILL = {
  assisted: "_[Fill in: which parts of the project the tools helped with, for example scaffolding, tests, documentation, or specific modules.]_",
  reviewed: "_[Fill in: what you read, tested, changed or rejected yourself, and who is accountable for the final code.]_",
  own: "_[Fill in: anything else readers should know about how you worked.]_",
};

const group = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, T[]>>((m, x) => ((m[key(x)] ??= []).push(x), m), {});
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Drafts a "How this was built" README section. Every factual sentence comes from a strong or moderate signal
 * (or from text the owner supplied) and carries its basis. Speculative signals are never used.
 * The owner edits and decides what to publish.
 */
export function draftDisclosure(report: AuthorshipReport, owner: OwnerAccount = {}): DisclosureDraft {
  const claims: DisclosureClaim[] = [];
  const used = new Set<string>();
  const usable = report.signals.filter((s) => s.strength !== "speculative");
  const bullet = (text: string, sigs: Signal[]) => { sigs.forEach((s) => used.add(s.id)); claims.push({ text, basis: sigs.map((s) => s.id) }); return `- ${text}`; };

  const shows: string[] = [];
  for (const s of usable.filter((x) => x.kind === "tool-file")) shows.push(bullet(`The repository contains \`${s.ref.replace("tool-file:", "")}\`, which configures ${s.tool} for this project.`, [s]));
  const trailers = usable.filter((x) => x.kind === "commit-trailer");
  for (const [tool, ss] of Object.entries(group(trailers, (x) => x.tool ?? "an AI tool"))) shows.push(bullet(`${plural(ss.length, "commit")} name ${tool} in a commit trailer (for example ${ss[0]!.commit!.slice(0, 7)}).`, ss));
  const bots = usable.filter((x) => x.kind === "bot-author");
  for (const [tool, ss] of Object.entries(group(bots, (x) => x.tool ?? "an AI tool"))) shows.push(bullet(`${plural(ss.length, "commit")} are attributed to a ${tool} account.`, ss));
  for (const s of usable.filter((x) => x.claim === "ai-assisted")) shows.push(bullet(`The documentation already says AI tools were used (${s.file}:${s.line}).`, [s]));

  const explain: string[] = [];
  for (const s of usable.filter((x) => x.kind === "history-pattern")) { used.add(s.id); explain.push(`- ${s.title}. If readers might ask about it, say how those commits were produced.`); }
  for (const s of usable.filter((x) => x.claim === "human-only")) {
    used.add(s.id);
    explain.push(report.counts.strong ? `- ${s.file}:${s.line} says no AI was used, but the repository also contains the signals above. Reconcile the two before publishing.` : `- ${s.file}:${s.line} says no AI was used. Assay found nothing that contradicts that, but it cannot verify it.`);
  }

  const toolLines: string[] = [];
  for (const t of report.disclosure.toolsDetected) toolLines.push(`- ${t} (detected in the repository)`);
  for (const t of owner.tools ?? []) { toolLines.push(`- ${t} (declared by you)`); claims.push({ text: `${t} was used`, basis: "owner" }); }

  const assistedLines = (owner.assisted ?? []).map((a) => { claims.push({ text: a, basis: "owner" }); return `- ${a} (declared by you)`; });
  if (owner.reviewed) claims.push({ text: owner.reviewed, basis: "owner" });

  const out: string[] = [
    "## How this was built", "",
    "<!-- Draft from Assay's authorship audit. Edit freely, keep only what is accurate, and add your own account. -->", "",
  ];
  if (shows.length) out.push("### What the repository shows", "", ...shows, "");
  else out.push("### What the repository shows", "", "No signals of AI-assisted authorship were detected. That does not show how the project was written, so this section is yours to write.", "");
  if (toolLines.length) out.push("### Tools", "", ...toolLines, "");
  out.push("### What was assisted", "", ...(assistedLines.length ? assistedLines : [FILL.assisted]), "");
  out.push("### What I reviewed and decided", "", owner.reviewed ? `${owner.reviewed} (declared by you)` : FILL.reviewed, "");
  if (explain.length) out.push("### Worth explaining", "", ...explain, "");
  out.push("### In my own words", "", FILL.own, "");
  return { markdown: out.join("\n"), claims, includedSignalIds: [...used] };
}
