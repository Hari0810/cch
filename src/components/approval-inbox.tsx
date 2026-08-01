"use client";

/**
 * The approver's side of the screen — the second half of the demo's argument.
 *
 * The requester's pane says "suspended, awaiting Eva Patel". This pane is Eva's
 * desk. Both are visible at once on purpose: the point of "suspend, don't deny"
 * is that the failure mode has a named human attached, and you can only see that
 * if you can see the human.
 *
 * Polled, not realtime — see the note in src/app/api/approvals/route.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Inbox, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApprovalOutcome, PendingApproval } from "@/lib/types";

const POLL_MS = 2000;

function minutesLeft(expiresAt: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000),
  );
}

const STATUS_TONE: Record<PendingApproval["status"], string> = {
  pending: "border-destructive/30 bg-destructive/10 text-destructive",
  approved: "border-success/30 bg-success/10 text-success",
  rejected: "border-border bg-muted text-muted-foreground",
  expired: "border-alert/30 bg-alert/10 text-alert",
};

function Row({
  item,
  onDecide,
  busy,
}: {
  item: PendingApproval;
  onDecide: (item: PendingApproval, d: "approve" | "reject") => void;
  busy: boolean;
}) {
  const left = minutesLeft(item.expires_at);
  const settled = item.status !== "pending";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
            STATUS_TONE[item.status],
          )}
        >
          {item.status}
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
          {item.risk_score}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="text-xs leading-snug font-medium">
          {item.requester_name}
          {item.via_oauth_app && (
            <span className="font-normal text-alert"> via {item.via_oauth_app}</span>
          )}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          wants to <span className="font-medium text-foreground">{item.action}</span>{" "}
          <span className="font-medium text-foreground">{item.resource_name}</span>
          {item.project_name && <> · {item.project_name}</>}
        </p>
        <p className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground tabular-nums">
          <Clock className="size-3" />
          {item.occurred_at.slice(11, 16)} · {item.resource_sensitivity}
        </p>
      </div>

      {item.policy_reasons.length > 0 && (
        <ul className="space-y-0.5 border-l-2 border-border pl-2">
          {item.policy_reasons.slice(0, 3).map((reason, i) => (
            <li key={i} className="text-[11px] leading-snug text-muted-foreground">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {settled ? (
        <p className="text-[11px] text-muted-foreground">
          {item.status === "expired"
            ? `Not answered in time — escalated to ${item.approver_name}'s manager.`
            : `${item.status === "approved" ? "Released once" : "Refused"} · ${item.approver_name}`}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onDecide(item.approval_request_id, item.approver_name, "approve")
              }
              className="h-7 flex-1 text-xs"
            >
              <CheckCircle2 className="size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                onDecide(item.approval_request_id, item.approver_name, "reject")
              }
              className="h-7 flex-1 text-xs"
            >
              <XCircle className="size-3.5" />
              Reject
            </Button>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            {item.approver_name} · expires in{" "}
            <span className="font-mono tabular-nums">{left}</span> min, then
            escalates
          </p>
        </>
      )}
    </li>
  );
}

export function ApprovalInbox({ className }: { className?: string }) {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { approvals?: PendingApproval[] };
      setItems(body.approvals ?? []);
    } catch {
      // A dropped poll is not worth surfacing — the next tick recovers.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function decide(
    id: string,
    approverName: string,
    decision: "approve" | "reject",
  ) {
    setBusy(id);
    setNote(null);
    try {
      const item = items.find((i) => i.approval_request_id === id);
      const res = await fetch("/api/approvals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_request_id: id,
          decision,
          // DEMO ONLY. Production reads the approver from the IdP session; here
          // we send back the id the request was addressed to, which is a routing
          // check and not an authentication one. Called out in the UI below.
          approver_id: await approverIdFor(id),
          justification:
            decision === "approve"
              ? `Released by ${approverName} from the approver inbox`
              : `Refused by ${approverName} from the approver inbox`,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNote(
          body?.error ??
            `Could not record the decision (${res.status}). ${item?.resource_name ?? ""}`,
        );
      } else {
        const outcome = body as ApprovalOutcome;
        setNote(
          outcome.access_released
            ? `Released once: ${outcome.capability?.action} on this resource only. A second read needs a second decision.`
            : "Refused. The access stays suspended — the requester must make a fresh request.",
        );
      }
    } catch {
      setNote("Network error recording the decision.");
    } finally {
      setBusy(null);
      void load();
    }
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Inbox className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">Approver inbox</h2>
        {pendingCount > 0 && (
          <span className="ml-auto rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            {pendingCount} pending
          </span>
        )}
      </header>

      {note && (
        <p className="shrink-0 border-b bg-muted/40 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
          {note}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            Empty. A suspended access lands here with a named approver — nothing
            is denied outright.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <Row
                key={item.approval_request_id}
                item={item}
                onDecide={decide}
                busy={busy === item.approval_request_id}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-start gap-1.5 border-t px-4 py-2.5">
        <ShieldAlert className="mt-px size-3 shrink-0 text-muted-foreground" />
        <p className="text-[10px] leading-snug text-muted-foreground">
          The approver is <strong>not authenticated</strong> here. Production
          inherits their identity from the IdP; this pane trusts the browser.
        </p>
      </footer>
    </section>
  );
}

/**
 * The approval row already knows who it is addressed to, and the API rejects a
 * mismatch — so the client simply echoes it back. This exists as a named
 * function rather than inline so the seam where a real session would be read is
 * obvious to anyone auditing the file.
 */
async function approverIdFor(approvalRequestId: string): Promise<string> {
  const res = await fetch("/api/approvals", { cache: "no-store" });
  const body = (await res.json()) as { approvals?: Array<PendingApproval> };
  const match = body.approvals?.find(
    (a) => a.approval_request_id === approvalRequestId,
  );
  return match?.approver_id ?? "";
}
