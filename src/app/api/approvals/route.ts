/**
 * The approver's inbox. Polled by the UI every 2s.
 *
 * Polling rather than Supabase realtime, deliberately: a websocket that fails to
 * connect on conference wifi fails silently and takes the demo with it. A poll
 * that misses a tick just arrives on the next one.
 */

import { NextResponse } from "next/server";
import { listApprovals } from "@/lib/engine/approval";

export const dynamic = "force-dynamic";

export async function GET() {
  const approvals = await listApprovals();
  return NextResponse.json(
    { approvals },
    { headers: { "cache-control": "no-store" } },
  );
}
