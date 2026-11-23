import { NextResponse } from "next/server";
import { authorized, createTask, getPool } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!getPool()) return NextResponse.json({ error: "Engine not configured" }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ error: "Owner token required" }, { status: 401 });
  try {
    const id = await createTask((await req.json()) as Record<string, unknown>, "owner");
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
