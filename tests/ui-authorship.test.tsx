// @vitest-environment jsdom
import "./ui-setup";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/app/dashboard";
import { AuthorshipPanel } from "@/app/components/authorship-panel";
import { DisclosureBadge, OverallBadge, StrengthBadge } from "@/app/components/badges";
import { authorshipCase, authorshipOverview } from "@/authorship/service";
import { scanSeeded, scanView, type ScanView } from "@/core/service";

let seededView: ScanView;
beforeAll(async () => { seededView = JSON.parse(JSON.stringify(scanView(await scanSeeded()))); }, 60000);

type H = (url: string) => { status: number; json: unknown };
function mockFetch(h: H) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { const r = h(url); return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } }); }));
}
const ok: H = (url) => {
  if (url === "/api/seeded") return { status: 200, json: seededView };
  if (url === "/api/authorship") return { status: 200, json: JSON.parse(JSON.stringify(authorshipOverview())) };
  const m = /case=([\w-]+)/.exec(url);
  if (m) return { status: 200, json: JSON.parse(JSON.stringify(authorshipCase(m[1]!))) };
  return { status: 404, json: { error: "unexpected " + url } };
};
beforeEach(() => { window.location.hash = "/authorship"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("badge components", () => {
  it.each([["strong", "Strong"], ["moderate", "Moderate"], ["speculative", "Speculative"]] as const)("strength %s shows text and an icon", (s, text) => {
    render(<StrengthBadge strength={s} />);
    expect(screen.getByTestId("strength-badge")).toHaveTextContent(text);
    expect(screen.getByTestId("strength-badge").querySelector("svg")).not.toBeNull();
  });
  it.each([["disclosed", "Disclosed", "pass"], ["undisclosed", "Undisclosed", "fail"], ["mismatch", "Mismatch", "fail"], ["none-found", "None found", "neutral"]] as const)("status %s", (st, text, tone) => {
    render(<DisclosureBadge status={st} />);
    expect(screen.getByTestId("disclosure-status")).toHaveTextContent(text);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-status", tone);
  });
  it("overall results have text labels", () => {
    const { rerender } = render(<OverallBadge overall="needs-review" />);
    expect(screen.getByTestId("overall-result")).toHaveTextContent("Needs review");
    rerender(<OverallBadge overall="action-needed" />);
    expect(screen.getByTestId("overall-result")).toHaveTextContent("Action needed");
  });
});

describe("Authorship view", () => {
  it("shows eval metrics including the false-positive rate, and the first fixture's status", async () => {
    mockFetch(ok);
    render(<Dashboard />);
    const tiles = await screen.findAllByTestId("stat-tile", {}, { timeout: 5000 });
    const text = tiles.map((t) => t.textContent).join(" | ");
    expect(text).toMatch(/Precision.*100%/);
    expect(text).toMatch(/Recall.*100%/);
    expect(text).toMatch(/False positives.*0%.*0 of 4 human-written/);
    expect(screen.getByText(/Self-authored benchmark/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("authorship-summary")).toBeInTheDocument());
  });

  it("an undisclosed fixture shows status, overall result, strong and moderate signals with evidence", async () => {
    mockFetch(ok);
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /ai-undisclosed/ }));
    await waitFor(() => expect(within(screen.getByLabelText("Disclosure status")).getByTestId("disclosure-status")).toHaveTextContent("Undisclosed"));
    expect(within(screen.getByLabelText("Disclosure status")).getByTestId("overall-result")).toHaveTextContent("Action needed");
    const signals = screen.getAllByTestId("signal");
    expect(signals.length).toBeGreaterThanOrEqual(4);
    const cursor = signals.find((s) => s.textContent?.includes(".cursorrules"))!;
    expect(within(cursor).getByTestId("strength-badge")).toHaveTextContent("Strong");
    expect(within(cursor).getByText("Evidence")).toBeInTheDocument();
    const burst = signals.find((s) => s.textContent?.includes("large commits"))!;
    expect(within(burst).getByTestId("strength-badge")).toHaveTextContent("Moderate");
    expect(within(burst).getByTestId("signal-caveat")).toHaveTextContent(/False-positive caveat/);
  });

  it("a mismatch fixture is called out; a human false-positive fixture shows speculative signals with the caveat and stays clear", async () => {
    mockFetch(ok);
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /claims-handwritten-has-claude/ }));
    const panel = () => within(screen.getByLabelText("Disclosure status"));
    await waitFor(() => expect(panel().getByTestId("disclosure-status")).toHaveTextContent("Mismatch"));
    expect(screen.getByTestId("authorship-summary")).toHaveTextContent(/without AI/);

    await userEvent.click(screen.getByRole("button", { name: /human-fp-comments/ }));
    await waitFor(() => expect(panel().getByTestId("disclosure-status")).toHaveTextContent("None found"));
    expect(panel().getByTestId("overall-result")).toHaveTextContent("Clear");
    const sig = screen.getAllByTestId("signal");
    expect(sig.every((s) => s.getAttribute("data-strength") === "speculative")).toBe(true);
    for (const s of sig) expect(within(s).getByTestId("signal-caveat")).toHaveTextContent(/Human authors write like this too|weak evidence/);
    expect(screen.getByTestId("authorship-summary")).toHaveTextContent(/not evidence that the code was written by a person/);
  });

  it("the disclosure draft has a copy button that copies the markdown and confirms", async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async (t: string) => { writes.push(t); }) } });
    mockFetch(ok);
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /^ai-disclosed/ }));
    const copy = await screen.findByRole("button", { name: "Copy How this was built (markdown draft)" });
    await act(async () => { copy.click(); });
    expect(writes[0]).toContain("## How this was built");
    expect(writes[0]).toContain("_[Fill in");
    expect(copy).toHaveTextContent("Copied");
    expect(screen.getByText(/does not remove, hide or rewrite them/)).toBeInTheDocument();
  });

  it("has loading and error states, and the error offers retry", async () => {
    let fail = true;
    mockFetch((u) => (fail && u === "/api/authorship" ? { status: 500, json: { error: "disk on fire" } } : ok(u)));
    render(<Dashboard />);
    const alert = await screen.findByTestId("error-state");
    expect(alert).toHaveTextContent("Could not load the authorship fixtures");
    expect(alert).toHaveTextContent("disk on fire");
    fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("Authorship eval metrics");
  });

  it("shows a loading state while fixtures load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Dashboard />);
    expect(screen.getAllByTestId("loading-state").length).toBeGreaterThan(0);
  });

  it("'Current scan' shows the active scan's report, and its empty-signal text", async () => {
    mockFetch(ok);
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: "Current scan" }));
    expect(await screen.findByText(/Scan: fixtures\/seeded-demo/)).toBeInTheDocument();
    expect(screen.getByTestId("no-signals")).toHaveTextContent(/says nothing certain/);
    expect(within(screen.getByLabelText("Disclosure status")).getByTestId("disclosure-status")).toHaveTextContent("None found");
  });
});

describe("AuthorshipPanel", () => {
  it("orders signals strong -> moderate -> speculative", () => {
    const d = authorshipCase("human-fp-names");
    const mixed = authorshipCase("ai-undisclosed");
    render(<AuthorshipPanel report={{ ...mixed.report, signals: [...d.report.signals, ...mixed.report.signals] }} disclosure={mixed.disclosure} />);
    const order = screen.getAllByTestId("signal").map((s) => s.getAttribute("data-strength"));
    expect(order).toEqual([...order].sort((a, b) => ["strong", "moderate", "speculative"].indexOf(a!) - ["strong", "moderate", "speculative"].indexOf(b!)));
  });
});
