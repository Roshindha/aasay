"use client";
import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_VIEW, isViewId, type ViewId } from "./views";

const read = (): ViewId => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return isViewId(h) ? h : DEFAULT_VIEW;
};
const subscribe = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };

/** Hash-routed view (#/verdicts), so every view is deep-linkable and back/forward work. */
export function useView(): [ViewId, (v: ViewId) => void] {
  const view = useSyncExternalStore(subscribe, read, () => DEFAULT_VIEW);
  const go = useCallback((v: ViewId) => { window.location.hash = `/${v}`; }, []);
  return [view, go];
}
