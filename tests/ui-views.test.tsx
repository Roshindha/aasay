// @vitest-environment jsdom
import "./ui-setup";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/app/dashboard";
import { EnvStatus } from "@/app/shell";
import { scanSeeded, scanView, tournamentFor, type ScanView } from "@/core/service";

let seededView: ScanView;
let tournaments: Record<string, unknown> = {};

beforeAll(async () => {
  seededView = JSON.parse(JSON.stringify(scanView(await scanSeeded())));
  for (const f of seededView.findings.slice(0, 3)) {
    const t = await tournamentFor(seededView.id, f.id);
    tournaments[f.id] = JSON.parse(JSON.stringify({ scanId: t.scanId, ranked: t.ranked, winner: t.winner, handoff: t.handoff }));
  }
}, 60000);

type Handler = (url: string, body: Record<string, unknown> | null) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>;
function mockFetch(handler: Handler) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const r = await handler(url, init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }));
}
const okSeeded: Handler = (url, body) => {
  if (url === "/api/seeded") return { status: 200, json: seededView };
  if (url === "/api/tournament") { const t = tournaments[String(body?.findingId)]; return t ? { status: 200, json: t } : { status: 404, json: { error: "no fixture" } }; }
  return { status: 404, json: { error: "unexpected " + url } };
};
const go = (view: string) => { window.location.hash = `/${view}`; };

beforeEach(() => { go("seeded"); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("Seeded view", () => {
  it("shows eval numbers as stat tiles with the gate status", async () => {
    mockFetch(okSeeded);
    render(<Dashboard />);
    const tiles = await screen.findAllByTestId("stat-tile");
    const text = tiles.map((t) => t.textContent ?? "").join(" | ");
    expect(tiles).toHaveLength(5);
    expect(text).toContain("PASS");
    expect(text).toMatch(/Recall.*100%/);
    expect(text).toMatch(/Precision.*100%/);
    expect(text).toMatch(/Critical recall.*100%/);
    expect(text).toContain("11/11");
    expect(screen.getByTestId("env-status")).toHaveTextContent("Offline");
  });

  it("shows a loading state first", () => {
    mockFetch(() => new Promise(() => {}) as never);
    render(<Dashboard />);
    expect(screen.getAllByRole("status").some((s) => s.getAttribute("aria-busy") === "true")).toBe(true);
  });

  it("shows an error state with retry when the run fails", async () => {
    let fail = true;
    mockFetch((u, b) => (fail ? { status: 500, json: { error: "boom" } } : okSeeded(u, b)));
    render(<Dashboard />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Seeded run failed");
    expect(alert).toHaveTextContent("boom");
    fail = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getAllByTestId("stat-tile")).toHaveLength(5));
  });

  it("marks the current nav item with aria-current and navigates by link", async () => {
    mockFetch(okSeeded);
    render(<Dashboard />);
    await screen.findAllByTestId("stat-tile");
    expect(screen.getByRole("link", { name: "Seeded runs" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("link", { name: "Verdicts" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Verdicts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verdicts" })).toHaveAttribute("aria-current", "page");
  });
});

describe("Live scan view", () => {
  it("explains what to enter when empty and validates the URL", async () => {
    mockFetch(okSeeded);
    go("live");
    render(<Dashboard />);
    expect(await screen.findByTestId("empty-state")).toHaveTextContent("No live scan yet");
    const scan = screen.getByRole("button", { name: "Scan" });
    expect(scan).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/GitHub repository or pull request URL/), "not-a-url");
    expect(scan).toBeDisabled();
    expect(screen.getByText(/Enter a URL like/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/GitHub repository/));
    await userEvent.type(screen.getByLabelText(/GitHub repository/), "https://github.com/o/r");
    expect(scan).toBeEnabled();
  });

  it("shows the failure reason without leaking tokens", async () => {
    mockFetch((u, b) => (u === "/api/live" ? { status: 502, json: { error: "GitHub API 401 for /repos/o/r (Bearer ghp_abcdefghijklmnopqrstuv)" } } : okSeeded(u, b)));
    go("live");
    render(<Dashboard />);
    await userEvent.type(await screen.findByLabelText(/GitHub repository/), "https://github.com/o/r");
    await userEvent.click(screen.getByRole("button", { name: "Scan" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("GitHub API 401");
    expect(alert.textContent).not.toContain("ghp_abcdefghijklmnopqrstuv");
  });

  it("renders a live result as counts only (no recall/precision)", async () => {
    mockFetch((u, b) => (u === "/api/live" ? { status: 200, json: { ...seededView, id: "github-1", source: "github", label: "https://github.com/o/r", eval: null, offline: false, notes: ["3 files fetched"] } } : okSeeded(u, b)));
    go("live");
    render(<Dashboard />);
    await userEvent.type(await screen.findByLabelText(/GitHub repository/), "https://github.com/o/r");
    await userEvent.click(screen.getByRole("button", { name: "Scan" }));
    const result = await screen.findByRole("region", { name: "Live scan result" });
    expect(result).toHaveTextContent("11");
    expect(result).not.toHaveTextContent(/recall|precision/i);
    expect(screen.getByTestId("env-status")).toHaveAttribute("data-mode", "online");
    expect(screen.getByTestId("env-status")).toHaveTextContent("Online");
  });

  it("badge follows the API's offline field for live scans, not a guess", async () => {
    mockFetch((u, b) => (u === "/api/live" ? { status: 200, json: { ...seededView, id: "github-2", source: "github", label: "https://github.com/o/r", eval: null, offline: true, notes: [] } } : okSeeded(u, b)));
    go("live");
    render(<Dashboard />);
    await userEvent.type(await screen.findByLabelText(/GitHub repository/), "https://github.com/o/r");
    await userEvent.click(screen.getByRole("button", { name: "Scan" }));
    await screen.findByRole("region", { name: "Live scan result" });
    expect(screen.getByTestId("env-status")).toHaveAttribute("data-mode", "offline");
    expect(screen.getByTestId("env-status")).toHaveTextContent("Offline · registry from fixtures/cache");
  });
});

describe("EnvStatus", () => {
  it.each([
    { browserOnline: true, offline: true, source: "seeded", mode: "offline", text: "Offline · recorded fixtures" },
    { browserOnline: true, offline: true, source: "live", mode: "offline", text: "Offline · registry from fixtures/cache" },
    { browserOnline: true, offline: false, source: "live", mode: "online", text: "Online · registry lookups live" },
    { browserOnline: true, offline: null, source: "seeded", mode: "unknown", text: "Checking…" },
    { browserOnline: false, offline: false, source: "live", mode: "offline", text: "Browser offline" },
  ] as const)("$source offline=$offline browserOnline=$browserOnline -> $text", ({ browserOnline, offline, source, mode, text }) => {
    render(<EnvStatus source={source} offline={offline} browserOnline={browserOnline} />);
    expect(screen.getByTestId("env-status")).toHaveAttribute("data-mode", mode);
    expect(screen.getByTestId("env-status")).toHaveTextContent(text);
  });
});

describe("Verdicts view", () => {
  it("shows label, severity, file:line and evidence for every finding, and filters", async () => {
    mockFetch(okSeeded);
    go("verdicts");
    render(<Dashboard />);
    const cards = await screen.findAllByTestId("finding");
    expect(cards).toHaveLength(11);
    for (const c of cards) {
      expect(within(c).getByTestId("label-badge")).toBeInTheDocument();
      expect(within(c).getByTestId("severity-badge")).toBeInTheDocument();
      expect(within(c).getByTestId("finding-location").textContent).toMatch(/:\d+$/);
      expect(within(c).getByText("Evidence")).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("button", { name: /^Likely/ }));
    expect(screen.getAllByTestId("finding")).toHaveLength(4);
    await userEvent.type(screen.getByRole("searchbox"), "zzz-no-match");
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No findings match");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByTestId("finding")).toHaveLength(11);
  });
});

describe("Evidence graph view", () => {
  it("has a legend, labelled nodes, and click/keyboard inspect", async () => {
    mockFetch(okSeeded);
    go("graph");
    render(<Dashboard />);
    const nodes = await screen.findAllByTestId("graph-node");
    expect(nodes.length).toBeGreaterThan(10);
    expect(screen.getByRole("list", { name: "Legend" })).toHaveTextContent("missing from");
    expect(screen.getByTestId("graph-inspector")).toHaveTextContent("Select a node");
    const dep = nodes.find((n) => n.getAttribute("aria-label")?.startsWith("DEPENDENCY express-validator-pro"))!;
    await userEvent.click(dep);
    const inspector = screen.getByTestId("graph-inspector");
    expect(inspector).toHaveTextContent("Dependency");
    expect(inspector).toHaveTextContent("missing from");
    expect(inspector).toHaveTextContent("package.json");
    const file = nodes.find((n) => n.getAttribute("aria-label")?.startsWith("FILE app/billing.py"))!;
    file.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("graph-inspector")).toHaveTextContent("app/billing.py");
  });

  it("also renders a list fallback with every node reachable as a button", async () => {
    mockFetch(okSeeded);
    go("graph");
    render(<Dashboard />);
    await screen.findAllByTestId("graph-node");
    const list = screen.getByTestId("graph-list");
    expect(within(list).getAllByRole("button").length).toBe(seededView.graph.nodes.length);
  });
});

describe("Dependencies view", () => {
  it("renders one card per issue with status as text plus icon, alongside the desktop table", async () => {
    mockFetch(okSeeded);
    go("deps");
    render(<Dashboard />);
    const cards = await screen.findAllByTestId("dep-card");
    expect(cards).toHaveLength(seededView.dependencies.issues.length);
    expect(cards).toHaveLength(2);
    const phantom = cards.find((c) => c.textContent?.includes("express-validator-pro"))!;
    expect(within(phantom).getByText("Not found")).toBeInTheDocument();
    expect(within(phantom).getByText("✗")).toHaveAttribute("aria-hidden", "true");
    expect(within(phantom).getByText("npm")).toBeInTheDocument();
    expect(within(phantom).getByTestId("label-badge")).toHaveTextContent("Confirmed");
    expect(within(phantom).getByText("src/server.ts:3")).toBeInTheDocument();
    // desktop table is still present (CSS shows exactly one of the two per breakpoint)
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByTestId("dep-cards").className).toContain("md:hidden");
    const wrap = screen.getByRole("table").closest("div")!;
    expect(wrap).toHaveClass("hidden", "md:block");
  });
});

describe("Handoffs view", () => {
  it("copies the handoff with one click and confirms", async () => {
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async (t: string) => { writes.push(t); }) } });
    mockFetch(okSeeded);
    go("handoffs");
    render(<Dashboard />);
    const copy = await screen.findByRole("button", { name: "Copy Handoff brief (markdown)" }, { timeout: 5000 });
    await act(async () => { copy.click(); });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("# Fix handoff");
    expect(copy).toHaveTextContent("Copied");
  });

  it("shows a tournament error state when scoring fails", async () => {
    mockFetch((u, b) => (u === "/api/tournament" ? { status: 404, json: { error: "Unknown findingId" } } : okSeeded(u, b)));
    go("tournament");
    render(<Dashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown findingId");
  });
});

describe("Tournament view", () => {
  it("marks the winner as recommended and shows gate checks and diff", async () => {
    mockFetch(okSeeded);
    go("tournament");
    render(<Dashboard />);
    const cands = await screen.findAllByTestId("candidate", {}, { timeout: 5000 });
    expect(cands.length).toBeGreaterThan(0);
    expect(within(cands[0]!).getByText("Recommended")).toBeInTheDocument();
    expect(within(cands[0]!).getByRole("list", { name: "Gate checks" })).toBeInTheDocument();
    expect(within(cands[0]!).getByLabelText(/^Patch diff/)).toBeInTheDocument();
  });
});
