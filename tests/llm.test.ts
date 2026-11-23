import { describe, expect, it } from "vitest";
import { createLlm, HeuristicLlmClient } from "@/core/llm";
import type { Finding } from "@/core/types";

const finding: Finding = { id: "x", lane: "hallucination", severity: "high", label: "likely", file: "a.ts", line: 3, title: "t", detail: "d", evidence: [], lanes: ["hallucination"] };

describe("LlmClient", () => {
  it("the heuristic client is the only client, whatever the environment says", () => {
    const prev = { ...process.env };
    process.env.OPENAI_API_KEY = "sk-should-be-ignored"; process.env.ASSAY_LLM = "openai";
    try { expect(createLlm()).toBeInstanceOf(HeuristicLlmClient); expect(createLlm().name).toBe("heuristic"); }
    finally { process.env = prev; }
  });
  it("raises no model findings and explains deterministically without any network", async () => {
    const c = new HeuristicLlmClient();
    expect(await c.reviewFile()).toEqual([]);
    expect(await c.explain(finding)).toContain("a.ts:3");
  });
});
