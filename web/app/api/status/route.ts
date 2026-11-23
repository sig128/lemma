import { NextResponse } from "next/server";
import { engineStatus } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await engineStatus(), { headers: { "Cache-Control": "no-store" } });
}
