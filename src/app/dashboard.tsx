"use client";
import { AppProvider } from "./state";
import { Shell } from "./shell";
import { useView } from "./use-view";
import { VIEW_COMPONENTS } from "./views/index";

function Inner() {
  const [view, go] = useView();
  const View = VIEW_COMPONENTS[view];
  return <Shell view={view} onNavigate={go}><View /></Shell>;
}

export function Dashboard() {
  return <AppProvider><Inner /></AppProvider>;
}
