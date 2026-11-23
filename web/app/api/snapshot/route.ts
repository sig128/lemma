import { NextResponse } from "next/server";
import { snapshot } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const s = await snapshot();
    if (!s) return NextResponse.json({ error: "Engine not configured: the app is in demonstration mode." }, { status: 404 });
    return NextResponse.json(s, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `Database unavailable: ${(e as Error).message}` }, { status: 503 });
  }
}
