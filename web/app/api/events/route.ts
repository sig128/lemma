import { NextResponse } from "next/server";
import { eventsAfter } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const after = Math.max(0, Number(u.searchParams.get("after") ?? 0) || 0);
  const problem = u.searchParams.get("problem");
  try {
    const evs = await eventsAfter(after, problem, 500);
    if (evs === null) return NextResponse.json({ error: "Engine not configured: demonstration mode serves recorded runs from /data/runs." }, { status: 404 });
    return NextResponse.json({ events: evs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
