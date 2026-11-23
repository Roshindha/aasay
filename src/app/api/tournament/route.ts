import { NextResponse } from "next/server";
import { z } from "zod";
import { tournamentFor } from "@/core/service";

export const dynamic = "force-dynamic";
const Body = z.object({ scanId: z.string(), findingId: z.string() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "scanId and findingId required" }, { status: 400 });
  try {
    const t = await tournamentFor(parsed.data.scanId, parsed.data.findingId);
    return NextResponse.json({ scanId: t.scanId, ranked: t.ranked, winner: t.winner, handoff: t.handoff });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
