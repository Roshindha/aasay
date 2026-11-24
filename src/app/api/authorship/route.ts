import { NextResponse } from "next/server";
import { assertRequestAllowed, authorshipCase, authorshipOverview } from "@/authorship/service";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    assertRequestAllowed(url.searchParams.get("request") ?? undefined);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, refused: true }, { status: 422 });
  }
  const id = url.searchParams.get("case");
  try {
    return NextResponse.json(id ? authorshipCase(id) : authorshipOverview());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
