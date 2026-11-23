import OpenAI from "openai";
import { z } from "zod";
import { FindingSchema, type Finding, type Lane, type SourceFile } from "./types";

/**
 * All LLM access goes through this interface. The default implementation is deterministic and offline.
 * LLM-originated findings are never labelled above "speculative" (see `normalizeLlmFinding`).
 */
export interface LlmClient {
  readonly name: string;
  /** Extra findings an LLM might raise for one file in one lane. Heuristic client returns none. */
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

const LlmFindingsSchema = z.object({
  findings: z.array(z.object({ line: z.number().int(), title: z.string(), detail: z.string(), severity: z.enum(["critical", "high", "medium", "low"]).default("medium") })),
});

export function normalizeLlmFinding(lane: Lane, file: string, raw: z.infer<typeof LlmFindingsSchema>["findings"][number]): Finding {
  return FindingSchema.parse({
    id: `llm:${lane}:${file}:${raw.line}`, lane, severity: raw.severity, label: "speculative",
    file, line: Math.max(0, raw.line), title: raw.title, detail: raw.detail, evidence: ["model-proposed; unverified"], lanes: [lane],
  });
}

/** Hosts the LLM transport may reach. Separate from the data allowlist and used only when OpenAI is explicitly enabled. */
export const LLM_HOST = "api.openai.com";

export class OpenAiLlmClient implements LlmClient {
  readonly name: string;
  private client: OpenAI;
  constructor(private apiKey: string, private model: string, client?: OpenAI) {
    this.name = `openai:${model}`;
    this.client = client ?? new OpenAI({
      apiKey: this.apiKey,
      baseURL: `https://${LLM_HOST}/v1`,
      fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
        if (url.hostname !== LLM_HOST) throw new Error(`LLM transport blocked host ${url.hostname}`);
        return fetch(input, init);
      }) as typeof fetch,
    });
  }
  private async json(prompt: string): Promise<unknown> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: "You are a precise code reviewer. Reply with JSON only." }, { role: "user", content: prompt }],
    });
    return JSON.parse(res.choices[0]?.message?.content ?? "{}");
  }
  async reviewFile(lane: Lane, file: SourceFile): Promise<Finding[]> {
    const out = await this.json(
      `Lane: ${lane}. Review this file and return {"findings":[{"line":number,"title":string,"detail":string,"severity":"critical|high|medium|low"}]}. Only report real defects in this lane.\n\nFILE ${file.path}\n${file.content.slice(0, 20000)}`,
    );
    const parsed = LlmFindingsSchema.safeParse(out);
    return parsed.success ? parsed.data.findings.map((f) => normalizeLlmFinding(lane, file.path, f)) : [];
  }
  async explain(f: Finding): Promise<string> {
    const out = (await this.json(`Explain in 2 sentences, return {"text": string}: ${JSON.stringify({ title: f.title, detail: f.detail, file: f.file, line: f.line })}`)) as { text?: string };
    return out.text ?? f.detail;
  }
}

/** Heuristic unless OpenAI is explicitly requested (ASSAY_LLM=openai) AND OPENAI_API_KEY is set. Never logs the key. */
export function createLlm(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env.ASSAY_LLM === "openai" && env.OPENAI_API_KEY) return new OpenAiLlmClient(env.OPENAI_API_KEY, env.ASSAY_MODEL || "gpt-4.1-mini");
  return new HeuristicLlmClient();
}
