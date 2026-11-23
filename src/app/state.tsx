"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ScanView } from "@/core/service";
import type { ScoredPatch } from "@/core/types";

export interface Async<T> { status: "idle" | "loading" | "ok" | "error"; data: T | null; error: string | null }
export interface Tourney { scanId: string; ranked: ScoredPatch[]; winner: ScoredPatch | null; handoff: string }
export type Source = "seeded" | "live";

const idle = <T,>(): Async<T> => ({ status: "idle", data: null, error: null });

interface AppState {
  source: Source;
  setSource: (s: Source) => void;
  seeded: Async<ScanView>;
  live: Async<ScanView>;
  /** The scan the analysis views (verdicts, graph, …) currently show */
  scan: Async<ScanView>;
  loadSeeded: () => void;
  runLive: (url: string) => Promise<void>;
  selectedId: string | null;
  selectFinding: (id: string) => void;
  tournament: Async<Tourney>;
  loadTournament: (findingId: string) => void;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error("useApp outside AppProvider"); return c; };

async function readJson(res: Response): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, body };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<Source>("seeded");
  const [seeded, setSeeded] = useState<Async<ScanView>>({ status: "loading", data: null, error: null });
  const [live, setLive] = useState<Async<ScanView>>(idle());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tourneys, setTourneys] = useState<Record<string, Async<Tourney>>>({});
  const started = useRef(false);

  const loadSeeded = useCallback(() => {
    setSeeded((s) => ({ ...s, status: "loading", error: null }));
    fetch("/api/seeded")
      .then(readJson)
      .then(({ ok, body }) => {
        if (!ok) throw new Error(String(body.error ?? "Seeded run failed"));
        setSeeded({ status: "ok", data: body as unknown as ScanView, error: null });
      })
      .catch((e: Error) => setSeeded({ status: "error", data: null, error: e.message }));
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    loadSeeded();
  }, [loadSeeded]);

  const runLive = useCallback(async (url: string) => {
    setLive((s) => ({ ...s, status: "loading", error: null }));
    try {
      const { ok, body } = await readJson(await fetch("/api/live", { method: "POST", body: JSON.stringify({ url }), headers: { "content-type": "application/json" } }));
      if (!ok) throw new Error(String(body.error ?? "Scan failed"));
      setLive({ status: "ok", data: body as unknown as ScanView, error: null });
      setSource("live");
      setSelectedId(null);
    } catch (e) {
      setLive((s) => ({ status: "error", data: s.data, error: (e as Error).message }));
    }
  }, []);

  const scan = source === "live" ? live : seeded;
  const scanId = scan.data?.id ?? "";
  const key = selectedId ? `${scanId}:${selectedId}` : "";

  const loadTournament = useCallback((findingId: string) => {
    if (!scanId) return;
    const k = `${scanId}:${findingId}`;
    setTourneys((t) => ({ ...t, [k]: { status: "loading", data: null, error: null } }));
    fetch("/api/tournament", { method: "POST", body: JSON.stringify({ scanId, findingId }), headers: { "content-type": "application/json" } })
      .then(readJson)
      .then(({ ok, body }) => {
        if (!ok) throw new Error(String(body.error ?? "Tournament failed"));
        setTourneys((t) => ({ ...t, [k]: { status: "ok", data: body as unknown as Tourney, error: null } }));
      })
      .catch((e: Error) => setTourneys((t) => ({ ...t, [k]: { status: "error", data: null, error: e.message } })));
  }, [scanId]);

  const selectFinding = useCallback((id: string) => setSelectedId(id), []);
  const tournament = (key && tourneys[key]) || idle<Tourney>();

  const value = useMemo<AppState>(() => ({
    source, setSource, seeded, live, scan, loadSeeded, runLive, selectedId, selectFinding, tournament, loadTournament,
  }), [source, seeded, live, scan, loadSeeded, runLive, selectedId, selectFinding, tournament, loadTournament]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
