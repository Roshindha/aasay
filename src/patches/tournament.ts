import type { Finding, ScoredPatch, SourceFile } from "@/core/types";
import type { GateOptions } from "@/gate/gate";
import { generateCandidates } from "./generate";
import { scorePatch } from "./score";

export interface TournamentResult {
  finding: Finding;
  /** Eligible patches first, by descending total; ineligible after */
  ranked: ScoredPatch[];
  winner: ScoredPatch | null;
}

export async function runTournament(finding: Finding, files: SourceFile[], gateOpts?: GateOptions): Promise<TournamentResult> {
  const candidates = generateCandidates(finding, files);
  const scored = await Promise.all(candidates.map((c) => scorePatch(finding, c, files, gateOpts)));
  const ranked = scored.sort((a, b) => Number(b.gate.eligible) - Number(a.gate.eligible) || b.total - a.total);
  return { finding, ranked, winner: ranked.find((r) => r.gate.eligible) ?? null };
}
