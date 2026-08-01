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
import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Inbox,
  ShieldAlert,
  XCircle,
} from "lucide-react";

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

/**
 * The wall-clock time of the access, in the reader's own timezone.
 *
 * NOT `iso.slice(11, 16)`. The decision card slices, and is right to: it echoes
 * the request string back byte-for-byte with its original `+01:00`. These rows
 * come from Postgres, which normalises `timestamptz` to UTC — so the same 23:40
 * access arrives here as `22:40:00+00:00` and slicing printed **22:40 in the
 * approver's inbox while the decision card next to it said 23:40**. Two panes,
 * one access, an hour apart.
 *
 * Parsing the instant and formatting it locally is the correct fix rather than
 * a patch: the stored value *is* an instant, and an approver should see it in
 * their own time. It also happens to agree with the card on the demo machine.
 */
function localTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BUTTON =
  "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

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
          {localTime(item.occurred_at)} · {item.resource_sensitivity}
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
              onClick={() => onDecide(item, "approve")}
              className="h-7 flex-1 text-xs"
            >
              <CheckCircle2 className="size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide(item, "reject")}
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
  /**
   * Ids present when "Clear" was pressed. A rehearsal leaves settled rows in
   * the inbox, and on stage they read as clutter above the one request the
   * audience is meant to watch arrive.
   *
   * IT HIDES; IT DOES NOT DELETE. Nothing is sent to the server and no
   * `approval_request` row is touched — this is a client-side filter over what
   * the poll already returned, and "Show all" puts them straight back. An audit
   * surface with a working delete button is not an audit surface, and a judge
   * asking "so you can erase these?" deserves the answer no.
   *
   * Snapshotting ids rather than comparing a timestamp is deliberate:
   * `occurred_at` is the scenario's asserted time (23:40 on a machine reading
   * 14:50), so a wall-clock comparison against it hides the wrong things.
   */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

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

  async function decide(item: PendingApproval, decision: "approve" | "reject") {
    setBusy(item.approval_request_id);
    setNote(null);
    try {
      const res = await fetch("/api/approvals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_request_id: item.approval_request_id,
          decision,
          // DEMO ONLY, and the one seam worth pointing at during Q&A. The row
          // already carries who it is addressed to, so the client echoes it and
          // the API checks the match. That is routing, not authentication —
          // production reads this from the IdP session and never the body.
          approver_id: item.approver_id,
          justification:
            decision === "approve"
              ? `Released by ${item.approver_name} from the approver inbox`
              : `Refused by ${item.approver_name} from the approver inbox`,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNote(
          body?.error ?? `Could not record the decision (${res.status}).`,
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

  const visible = items.filter((i) => !hiddenIds.has(i.approval_request_id));
  const hiddenCount = items.length - visible.length;
  const pendingCount = visible.filter((i) => i.status === "pending").length;

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
        {/* One control, never two competing for a 19rem header: "Clear" while
            there is something to clear, "Show all" once the view is empty and
            something is hidden behind it. */}
        {visible.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setHiddenIds(new Set(items.map((i) => i.approval_request_id)));
              setNote(null);
            }}
            title="Hides what is already here. Nothing is deleted — the rows stay in the audit table."
            className={cn(BUTTON, pendingCount > 0 ? "" : "ml-auto")}
          >
            <EyeOff className="mr-1 inline size-3" />
            Clear
          </button>
        ) : (
          hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setHiddenIds(new Set())}
              title="Nothing was deleted — bring the earlier requests back into view."
              className={cn(BUTTON, "ml-auto")}
            >
              <Eye className="mr-1 inline size-3" />
              Show all
            </button>
          )
        )}
      </header>

      {note && (
        <p className="shrink-0 border-b bg-muted/40 px-4 py-2 text-[11px] leading-snug text-muted-foreground">
          {note}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
            Empty. A suspended access lands here with a named approver — nothing
            is denied outright.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
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
