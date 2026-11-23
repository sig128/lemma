import { eventsAfter, getPool } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Server-sent events. Each event carries its sequence number as the SSE id, so a
 * reconnecting EventSource sends Last-Event-ID and receives everything it missed.
 * The stream closes after ~50 s (serverless limits); the browser reconnects. */
export async function GET(req: Request) {
  if (!getPool()) return new Response("Engine not configured", { status: 404 });
  const u = new URL(req.url);
  let last = Number(req.headers.get("last-event-id") ?? u.searchParams.get("after") ?? 0) || 0;
  const problem = u.searchParams.get("problem");
  const enc = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(`retry: 3000\n\n`));
      let lastBeat = Date.now();
      while (Date.now() - started < 50_000) {
        try {
          const evs = (await eventsAfter(last, problem, 200)) ?? [];
          for (const ev of evs) {
            controller.enqueue(enc.encode(`id: ${ev.seq}\nevent: research\ndata: ${JSON.stringify(ev)}\n\n`));
            last = ev.seq;
          }
          if (Date.now() - lastBeat > 15_000) { controller.enqueue(enc.encode(`: keep-alive\n\n`)); lastBeat = Date.now(); }
        } catch {
          controller.enqueue(enc.encode(`event: engine-error\ndata: {"error":"database unavailable"}\n\n`));
        }
        await new Promise((r) => setTimeout(r, 1500));
        if (req.signal.aborted) break;
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
}
