"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "./icons";

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

interface Props { text: string; label?: string; copiedLabel?: string; ariaLabel?: string; iconOnly?: boolean; className?: string }

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", ariaLabel, iconOnly = false, className = "" }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onClick() {
    const ok = await writeClipboard(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }
  const shown = state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : label;
  return (
    <>
      <button type="button" onClick={onClick} aria-label={iconOnly ? (ariaLabel ?? label) : ariaLabel}
        className={`inline-flex h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-xs font-medium text-fg hover:bg-surface-2 ${className}`}>
        {state === "copied" ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
        {!iconOnly && <span>{shown}</span>}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : ""}</span>
    </>
  );
}
