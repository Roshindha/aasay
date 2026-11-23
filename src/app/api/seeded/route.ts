import { NextResponse } from "next/server";
import { scanSeeded, scanView } from "@/core/service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(scanView(await scanSeeded()));
}
