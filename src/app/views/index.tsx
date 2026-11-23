"use client";
import type { ComponentType } from "react";
import type { ViewId } from "../views";
import { GraphView } from "./graph";
import { HandoffsView } from "./handoffs";
import { TournamentView } from "./tournament";
import { BudgetView } from "./budget";
import { DepsView } from "./deps";
import { LiveView } from "./live";
import { SeededView } from "./seeded";
import { VerdictsView } from "./verdicts";

export const VIEW_COMPONENTS: Record<ViewId, ComponentType> = {
  seeded: SeededView, live: LiveView, verdicts: VerdictsView, graph: GraphView, deps: DepsView, budget: BudgetView, tournament: TournamentView, handoffs: HandoffsView,
};
