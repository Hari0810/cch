/**
 * Approve or reject a suspended access.
 *
 * The enforcement contract this implements is documented on
 * `ApprovalDecisionRequest` in src/lib/types.ts. The load-bearing property is
 * what approval does NOT do: it releases one action on one resource once. It is
 * not a session elevation and it cannot reach anything the original permission
 * check did not already reach.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { decideApproval } from "@/lib/engine/approval";

export const dynamic = "force-dynamic";

const Schema = z.object({
  approval_request_id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  /** DEMO ONLY — production takes this from the IdP session, never the body. */
  approver_id: z.string().min(1),
  justification: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await decideApproval(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, current_status: result.current ?? null },
      { status: result.status },
    );
  }
  return NextResponse.json(result.outcome);
}
