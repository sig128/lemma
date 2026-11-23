import { NextResponse } from "next/server";
import { authorized, getPool, requestCancel, setPaused } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!getPool()) return NextResponse.json({ error: "Engine not configured" }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ error: "Owner token required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; scope?: string; task?: string };
  try {
    if (b.action === "pause" || b.action === "resume") await setPaused(b.scope ?? "global", b.action === "pause", "owner");
    else if (b.action === "cancel" && b.task) await requestCancel(b.task, "owner");
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
