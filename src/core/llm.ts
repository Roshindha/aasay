import type { Finding, Lane, SourceFile } from "./types";

/**
 * All model access goes through this interface. The heuristic client is the only implementation:
 * it is deterministic, offline, and never contacts a host. A model-backed client is deferred to a future module
 * that must bring its own explicit allowlist entry; nothing here reads API keys.
 */
export interface LlmClient {
  readonly name: string;
  /** Extra findings a model might raise for one file in one lane. The heuristic client returns none. */
  reviewFile(lane: Lane, file: SourceFile): Promise<Finding[]>;
  /** One-paragraph plain-language explanation of a finding. */
  explain(finding: Finding): Promise<string>;
}

export class HeuristicLlmClient implements LlmClient {
  readonly name = "heuristic";
  async reviewFile(): Promise<Finding[]> { return []; }
  async explain(f: Finding): Promise<string> {
    return `${f.title} (${f.lane}, ${f.severity}, ${f.label}) at ${f.file}:${f.line}. ${f.detail}`;
  }
}

export function createLlm(): LlmClient {
  return new HeuristicLlmClient();
}
