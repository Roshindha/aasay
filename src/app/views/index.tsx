"use client";
import type { ComponentType } from "react";
import { EmptyState } from "../components/states";
import type { ViewId } from "../views";
import { LiveView } from "./live";
import { SeededView } from "./seeded";
import { VerdictsView } from "./verdicts";

const Pending = () => <EmptyState title="This view is being rebuilt">It returns in a following commit.</EmptyState>;

export const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  seeded: SeededView, live: LiveView, verdicts: VerdictsView, graph: Pending, deps: Pending, budget: Pending, tournament: Pending, handoffs: Pending,
};
