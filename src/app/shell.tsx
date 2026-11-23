"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { Logo, Wifi, WifiOff } from "./components/icons";
import { ThemeToggle } from "./components/theme-toggle";
import { useApp, type Source } from "./state";
import { VIEWS, type ViewId } from "./views";

const subscribeOnline = (cb: () => void) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; };
const useBrowserOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/** Offline/online status derived from what the UI knows: seeded runs always use recorded fixtures; live scans use the registries. */
export function EnvStatus({ source, liveLoaded, browserOnline }: { source: Source; liveLoaded: boolean; browserOnline: boolean }) {
  const offline = !browserOnline || source === "seeded";
  const text = !browserOnline ? "Browser offline" : source === "seeded" ? "Offline · recorded fixtures" : liveLoaded ? "Online · GitHub, npm, PyPI" : "Online";
  return (
    <span data-testid="env-status" data-mode={offline ? "offline" : "online"} className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-surface px-2 text-xs font-medium">
      {offline ? <WifiOff width={14} height={14} /> : <Wifi width={14} height={14} />}
      <span>{text}</span>
    </span>
  );
}

function SourceSwitch() {
  const { source, setSource, live } = useApp();
  return (
    <div role="group" aria-label="Active scan source" className="inline-flex h-8 overflow-hidden rounded border border-line text-xs font-medium">
      {(["seeded", "live"] as const).map((s) => {
        const disabled = s === "live" && !live.data;
        return (
          <button key={s} type="button" aria-pressed={source === s} disabled={disabled} onClick={() => setSource(s)}
            title={disabled ? "Run a live scan first" : undefined}
            className={`px-3 ${source === s ? "bg-fg text-bg" : "bg-surface text-fg hover:bg-surface-2"} disabled:cursor-not-allowed disabled:text-muted`}>
            {s === "seeded" ? "Seeded" : "Live"}
          </button>
        );
      })}
    </div>
  );
}

export function Shell({ view, onNavigate, children }: { view: ViewId; onNavigate: (v: ViewId) => void; children: ReactNode }) {
  const { source, live } = useApp();
  const browserOnline = useBrowserOnline();
  const meta = VIEWS.find((v) => v.id === view)!;
  const groups = ["Run", "Analyze", "Fix"] as const;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-fg focus:px-3 focus:py-2 focus:text-bg">Skip to content</a>

      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex h-14 items-center gap-2 px-4 md:border-b md:border-line">
          <Logo /><span className="text-base font-semibold tracking-tight">Assay</span>
          <span className="ml-auto md:hidden"><ThemeToggle /></span>
        </div>
        <nav aria-label="Views" className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-4 md:overflow-visible md:p-3">
          {groups.map((g) => (
            <div key={g} className="flex shrink-0 gap-1 md:block">
              <div className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted md:block">{g}</div>
              {VIEWS.filter((v) => v.group === g).map((v) => (
                <a key={v.id} href={`#/${v.id}`} aria-current={v.id === view ? "page" : undefined} onClick={(e) => { e.preventDefault(); onNavigate(v.id); }}
                  className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded px-2 text-sm md:w-full ${v.id === view ? "bg-surface-2 font-semibold text-fg md:shadow-[inset_2px_0_0_var(--text)]" : "text-muted hover:bg-surface-2 hover:text-fg"}`}>
                  {v.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 md:px-6">
          <div className="min-w-0">
            <p className="text-xs text-muted">Assay <span aria-hidden>/</span> {meta.group}</p>
            <h1 className="truncate text-xl font-semibold leading-6">{meta.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <EnvStatus source={source} liveLoaded={!!live.data} browserOnline={browserOnline} />
            <SourceSwitch />
            <span className="hidden md:inline"><ThemeToggle /></span>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
