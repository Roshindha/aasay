// @vitest-environment jsdom
import "./ui-setup";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabelBadge, SeverityBadge, StatusPill } from "@/app/components/badges";
import { CopyButton } from "@/app/components/copy-button";
import { CodeBlock } from "@/app/components/code-block";
import { EmptyState, ErrorState, LoadingState, redactSecrets } from "@/app/components/states";
import { StatTile } from "@/app/components/stat-tile";
import { Inline } from "@/app/components/inline";

describe("LabelBadge / SeverityBadge / StatusPill", () => {
  it.each([["confirmed", "Confirmed"], ["likely", "Likely"], ["speculative", "Speculative"]] as const)("%s shows text and an icon, not just colour", (label, text) => {
    render(<LabelBadge label={label} />);
    const b = screen.getByTestId("label-badge");
    expect(b).toHaveTextContent(text);
    expect(b).toHaveAttribute("data-label", label);
    expect(b.querySelector("svg")).not.toBeNull();
  });
  it("severity shows its name and a meter", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByTestId("severity-badge")).toHaveTextContent("Critical");
    expect(screen.getByTestId("severity-badge").querySelectorAll("rect")).toHaveLength(4);
  });
  it("status pill pairs PASS/FAIL text with an icon", () => {
    const { rerender } = render(<StatusPill status="pass">PASS</StatusPill>);
    expect(screen.getByTestId("status-pill")).toHaveTextContent("PASS");
    expect(screen.getByTestId("status-pill").querySelector("svg")).not.toBeNull();
    rerender(<StatusPill status="fail">FAIL</StatusPill>);
    expect(screen.getByTestId("status-pill")).toHaveAttribute("data-status", "fail");
  });
});

describe("StatTile", () => {
  it("renders the eval numbers with tabular figures", () => {
    render(<dl><StatTile label="Recall" value="91%" hint="10/11" /><StatTile label="Gate" value={<StatusPill status="pass">PASS</StatusPill>} tone="pass" /></dl>);
    const tiles = screen.getAllByTestId("stat-tile");
    expect(within(tiles[0]!).getByText("Recall")).toBeInTheDocument();
    const v = within(tiles[0]!).getByText("91%");
    expect(v).toHaveClass("num");
    expect(tiles[0]).toHaveTextContent("10/11");
    expect(tiles[1]).toHaveTextContent("PASS");
  });
});

describe("states", () => {
  it("loading state is a polite busy status with an accessible label", () => {
    render(<LoadingState label="Loading verdicts" />);
    const s = screen.getByRole("status");
    expect(s).toHaveAttribute("aria-busy", "true");
    expect(s).toHaveTextContent("Loading verdicts");
  });
  it("empty state explains what to do", () => {
    render(<EmptyState title="No live scan yet">Enter a GitHub URL.</EmptyState>);
    expect(screen.getByTestId("empty-state")).toHaveTextContent("No live scan yet");
    expect(screen.getByTestId("empty-state")).toHaveTextContent("Enter a GitHub URL.");
  });
  it("error state is an alert, offers retry, and never shows token-like strings", async () => {
    const retry = vi.fn();
    render(<ErrorState message="GitHub API 401 with Bearer ghp_abcdefghijklmnopqrstuv and ?access_token=zzzzzzzz1234 sk-abcdefgh12345" onRetry={retry} />);
    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent("ghp_abcdefghijklmnopqrstuv");
    expect(alert).not.toHaveTextContent("zzzzzzzz1234");
    expect(alert).not.toHaveTextContent("sk-abcdefgh12345");
    expect(alert).toHaveTextContent("[redacted]");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("redactSecrets leaves ordinary messages alone", () => {
    expect(redactSecrets("GitHub API 404 for /repos/o/r")).toBe("GitHub API 404 for /repos/o/r");
  });
});

describe("Inline", () => {
  it("turns backticks into <code>", () => {
    const { container } = render(<p><Inline text="`json.parse` does not exist" /></p>);
    expect(container.querySelector("code")).toHaveTextContent("json.parse");
    expect(container).not.toHaveTextContent("`");
  });
});

describe("CodeBlock", () => {
  it("scrolls horizontally, is keyboard focusable, and tags diff lines", () => {
    render(<CodeBlock title="Patch diff" diff code={"--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n"} />);
    const pre = screen.getByLabelText("Patch diff");
    expect(pre).toHaveAttribute("tabindex", "0");
    expect(pre.className).toContain("overflow-auto");
    expect(pre.querySelector('[data-diff="add"]')).toHaveTextContent("+new");
    expect(pre.querySelector('[data-diff="del"]')).toHaveTextContent("-old");
    expect(screen.getByRole("button", { name: "Copy Patch diff" })).toBeInTheDocument();
  });
});

describe("CopyButton", () => {
  let written: string[];
  beforeEach(() => {
    written = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async (t: string) => { written.push(t); }) } });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("copies the text and confirms with 'Copied', then resets", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CopyButton text="hello handoff" label="Copy handoff" />);
    const btn = screen.getByRole("button", { name: "Copy handoff" });
    await act(async () => { btn.click(); });
    expect(written).toEqual(["hello handoff"]);
    expect(screen.getByRole("button")).toHaveTextContent("Copied");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    await act(async () => { vi.advanceTimersByTime(2100); });
    expect(screen.getByRole("button")).toHaveTextContent("Copy handoff");
  });

  it("icon-only buttons keep an aria-label", () => {
    render(<CopyButton text="x" iconOnly ariaLabel="Copy cache key" />);
    expect(screen.getByRole("button", { name: "Copy cache key" })).toBeInTheDocument();
  });

  it("reports failure when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    document.execCommand = vi.fn(() => false);
    render(<CopyButton text="x" />);
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByRole("button")).toHaveTextContent("Copy failed");
  });
});
