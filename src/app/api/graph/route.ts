/**
 * GET /api/graph?event=<access_event_id>  →  AccessGraph
 *
 * Read-only, and deliberately its own endpoint rather than a field on
 * `AccessDecision`. Adding to the decision contract would mean re-verifying
 * every scenario; a separate read cannot move a single score. That distinction
 * is the entire reason this was safe to build before the freeze —
 * see docs/attack-graph.md §3 (Tier 2) and §5.
 *
 * Nothing here writes. Nothing here is consulted by /api/access.
 */

import { NextResponse } from "next/server";
import { buildAccessGraph } from "@/lib/engine/graph";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const eventId = new URL(req.url).searchParams.get("event");
  if (!eventId) {
    return NextResponse.json(
      { error: "missing required query parameter: event" },
      { status: 400 },
    );
  }

  try {
    const graph = await buildAccessGraph(eventId);
    if (!graph) {
      // Unknown event ids are ordinary, not exceptional: the UI polls this
      // with whatever id it is holding. A 404 body, never a throw.
      return NextResponse.json(
        { error: "unknown access event", event: eventId },
        { status: 404 },
      );
    }
    return NextResponse.json(graph);
  } catch (error) {
    // The graph is an explanation, never a gate. If it cannot be assembled the
    // decision it describes still stands — say so and let the tab degrade.
    return NextResponse.json(
      {
        error: "graph unavailable",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
