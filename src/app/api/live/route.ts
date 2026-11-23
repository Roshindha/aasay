import { NextResponse } from "next/server";
import { z } from "zod";
import { scanGithub, scanView } from "@/core/service";

export const dynamic = "force-dynamic";
const Body = z.object({ url: z.string().url().max(300) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a GitHub repo or PR URL." }, { status: 400 });
  try {
    return NextResponse.json(scanView(await scanGithub(parsed.data.url)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
