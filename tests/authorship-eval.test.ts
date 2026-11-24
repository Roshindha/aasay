import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateAuthorship, listAuthorshipCases, loadAuthorshipKey, reportForCase } from "@/authorship/eval";
import { fixturesDir } from "@/deps/popular";

describe("authorship fixtures and eval", () => {
  const ev = evaluateAuthorship();

  it("covers the required scenarios (at least 6 repos, 2+ human false-positive-style cases)", () => {
    const cases = listAuthorshipCases();
    expect(cases.length).toBeGreaterThanOrEqual(6);
    const key = loadAuthorshipKey();
    expect(new Set(key.cases.map((c) => c.expectedStatus))).toEqual(new Set(["disclosed", "undisclosed", "mismatch", "none-found"]));
    const fpStyle = key.cases.filter((c) => c.humanWritten && c.expectedSpeculative.length > 0);
    expect(fpStyle.length).toBeGreaterThanOrEqual(2);
    expect(cases.some((c) => c.id === "mixed")).toBe(true);
    expect(cases.some((c) => c.id === "claims-handwritten-has-claude")).toBe(true);
  });

  it("reports precision, recall and the false-positive rate on human-written fixtures", () => {
    expect(ev.precision).toBeGreaterThanOrEqual(0.9);
    expect(ev.recall).toBeGreaterThanOrEqual(0.9);
    expect(ev.humanFixtures).toBeGreaterThanOrEqual(4);
    expect(ev.falsePositiveRate).toBe(0);
    expect(ev.statusAccuracy).toBe(1);
    expect(ev.gate).toBe("pass");
  });

  it("false-positive style fixtures do produce speculative signals, and they never change the result", () => {
    for (const id of ["human-fp-comments", "human-fp-history", "human-fp-names"]) {
      const c = ev.cases.find((x) => x.id === id)!;
      expect(c.speculative.length, id).toBeGreaterThan(0);
      expect(c.speculativeMissing, id).toEqual([]);
      expect(c.status).toBe("none-found");
      expect(c.overall).toBe("clear");
    }
  });

  it("every reported signal on every fixture carries an explanation and evidence; speculative and history ones carry a caveat", () => {
    for (const c of listAuthorshipCases()) {
      for (const s of reportForCase(c).signals) {
        expect(s.explanation.length).toBeGreaterThan(20);
        expect(s.evidence.length).toBeGreaterThan(0);
        if (s.strength === "speculative" || s.kind === "history-pattern") expect(s.caveat).toBeTruthy();
      }
    }
  });

  it("the eval can fail: a strong signal planted in a human fixture raises the false-positive rate and fails the gate", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assay-auth-"));
    try {
      const src = path.join(fixturesDir(), "authorship"), dst = path.join(tmp, "authorship");
      fs.mkdirSync(dst);
      for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      const p = path.join(dst, "human-clean.json");
      const c = JSON.parse(fs.readFileSync(p, "utf8")); c.paths.push("CLAUDE.md");
      fs.writeFileSync(p, JSON.stringify(c));
      const bad = evaluateAuthorship(tmp);
      expect(bad.falsePositives).toEqual(["human-clean"]);
      expect(bad.falsePositiveRate).toBe(0.25);
      expect(bad.gate).toBe("fail");
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});
