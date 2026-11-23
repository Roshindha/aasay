import { describe, expect, it } from "vitest";
import { createLlm, HeuristicLlmClient, normalizeLlmFinding, OpenAiLlmClient } from "@/core/llm";

describe("LlmClient", () => {
  it("defaults to the offline heuristic client, even when a key is present", () => {
    expect(createLlm({}).name).toBe("heuristic");
    expect(createLlm({ OPENAI_API_KEY: "sk-x" }).name).toBe("heuristic");
  });
  it("uses OpenAI only when explicitly enabled and never exposes the key in its name", () => {
    const c = createLlm({ ASSAY_LLM: "openai", OPENAI_API_KEY: "sk-secret", ASSAY_MODEL: "m1" });
    expect(c).toBeInstanceOf(OpenAiLlmClient);
    expect(c.name).toBe("openai:m1");
    expect(c.name).not.toContain("sk-secret");
  });
  it("model-proposed findings are always speculative", () => {
    const f = normalizeLlmFinding("hallucination", "a.ts", { line: 3, title: "t", detail: "d", severity: "critical" });
    expect(f.label).toBe("speculative");
  });
  it("heuristic client raises no findings", async () => {
    expect(await new HeuristicLlmClient().reviewFile()).toEqual([]);
  });
});
