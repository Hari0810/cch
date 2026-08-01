import { NextResponse } from "next/server";

import { seed } from "@/lib/seed";
import { computeAndStoreBaselines } from "@/lib/baseline";

// Service-role client + wall-clock anchor: never cache, never prerender.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/reset — wipe and repopulate the demo world.
 *
 * Idempotent. Run it before the demo, and again if a live decision has written
 * audit rows you would rather not have on stage.
 */
export async function POST() {
  try {
    const { anchor, counts } = await seed();
    // Baselines are computed from the history we just wrote, at seed time —
    // never in the access path, where a 4s cold start would land mid-demo.
    const baselines = await computeAndStoreBaselines();
    return NextResponse.json({
      ok: true,
      anchor,
      counts,
      baselines: { source: baselines.source, count: baselines.profiles.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
