import { NextResponse } from "next/server";
import { z } from "zod";
import { createLimiter } from "@/core/rate-limit";
import { scanGithub, scanView } from "@/core/service";

export const dynamic = "force-dynamic";
const Body = z.object({ url: z.string().url().max(300) });
/** Protects the server's GitHub token on a public deployment: scans per visitor per hour (ASSAY_LIVE_LIMIT, default 10). */
const limit = createLimiter(Number(process.env.ASSAY_LIVE_LIMIT) || 10, 60 * 60 * 1000);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const gate = limit(ip);
  if (!gate.ok) return NextResponse.json({ error: `Too many live scans from your address. Try again in ${Math.ceil(gate.retryAfterSec / 60)} minutes.` }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a GitHub repo or PR URL." }, { status: 400 });
  try {
    return NextResponse.json(scanView(await scanGithub(parsed.data.url)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
