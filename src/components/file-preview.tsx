"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Lock,
  ShieldQuestion,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccessDecision } from "@/lib/types";

/**
 * The file itself — and the point at which "suspended" stops being a UI state.
 *
 * Everything rendered below the fold of this dialog came out of the response
 * body of `POST /api/content`. When the access is withheld, that body contains
 * no file text at all: there is nothing here to reveal, hide, blur or unblur.
 * Open the network tab during the demo and the paused state is the same claim
 * from the other side of the wire.
 *
 * The live transition is the beat. While suspended this polls every two seconds
 * with `poll: true`, which checks for a redeemable release and returns — it
 * never reaches the scorer, so a dialog left open is a cheap select every 2s
 * rather than thirty Runware calls a minute on conference wifi. Eva approves in
 * the inbox on the same screen, the next poll redeems the capability, and the
 * bytes arrive without a reload.
 */

const POLL_MS = 2000;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "released";
      name: string;
      content: string;
      flagged: boolean;
      releasedBy: string | null;
    }
  | {
      kind: "withheld";
      name: string;
      reason: "awaiting_approval" | "step_up" | "denied";
      terminal: boolean;
      approver: { id: string; name: string } | null;
      message: string;
      riskScore: number | null;
    }
  | { kind: "error"; message: string };

/** Only ever the shape the server actually sends. No content is ever synthesised here. */
interface ContentResponse {
  released?: boolean;
  awaiting_release?: boolean;
  content?: string;
  resource_name?: string;
  flagged?: boolean;
  released_by?: string | null;
  decision?: string;
  withhold_reason?: "awaiting_approval" | "step_up" | "denied";
  terminal?: boolean;
  approver?: { id: string; name: string } | null;
  message?: string;
  risk_score?: number | null;
  error?: string;
}

export function FilePreview({
  decision,
  className,
}: {
  decision: AccessDecision;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  const fileName = decision.context_summary.resource_name;
  const eventId = decision.access_event_id;

  // Once the bytes are in hand they stay in hand for as long as the dialog is
  // mounted. Refetching would spend a single-use release that has already been
  // spent, and the file would vanish on reopen.
  const releasedRef = useRef(false);

  const request = useCallback(
    async (poll: boolean) => {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          access_event_id: eventId,
          // Rule 1: the request's own timestamp, echoed byte-for-byte.
          occurred_at: decision.occurred_at,
          poll,
        }),
      });
      const body = (await res.json()) as ContentResponse;

      if (!res.ok) {
        setState({
          kind: "error",
          message: body.error ?? `Request failed (${res.status})`,
        });
        return;
      }

      if (body.released && typeof body.content === "string") {
        releasedRef.current = true;
        setState({
          kind: "released",
          name: body.resource_name ?? fileName,
          content: body.content,
          flagged: body.flagged === true || body.decision === "ALLOW_AND_FLAG",
          releasedBy: body.released_by ?? null,
        });
        return;
      }

      // A poll that came back empty carries no verdict — it only says "not yet".
      // Keep whatever the cold request already told us rather than overwriting
      // the approver's name with nothing.
      if (body.awaiting_release) return;

      setState({
        kind: "withheld",
        name: body.resource_name ?? fileName,
        reason: body.withhold_reason ?? "awaiting_approval",
        terminal: body.terminal === true,
        approver: body.approver ?? null,
        message: body.message ?? "The server is withholding this file.",
        riskScore: body.risk_score ?? null,
      });
    },
    [decision.occurred_at, eventId, fileName],
  );

  // Cold request, once, on open.
  useEffect(() => {
    if (!open || releasedRef.current) return;
    let cancelled = false;
    setState({ kind: "loading" });
    request(false).catch((e: unknown) => {
      if (!cancelled) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Could not reach the file server",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, request]);

  // The poll. Runs only while suspended and only while the dialog is open. A
  // DENY is terminal — nobody can release it, so there is nothing to wait for
  // and polling it would be theatre.
  const waiting =
    open && state.kind === "withheld" && !state.terminal && state.reason !== "denied";

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      request(true).catch(() => {
        /* transient; the next tick retries */
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [waiting, request]);

  if (!eventId) return null;

  return (
    /**
     * NOT modal, deliberately. The release has to happen with this pane open —
     * Eva clicks Approve in the inbox that is already on the same screen and the
     * content arrives in place. A modal dialog renders an overlay that swallows
     * those clicks, which would force an alt-tab in the middle of the one beat
     * this feature exists for. Radix drops the overlay entirely when
     * `modal={false}`, so the inbox stays live behind it.
     */
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("shrink-0", className)}>
          <FileText />
          Open {fileName}
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-h-[80vh] gap-3 shadow-2xl shadow-black/50 sm:max-w-2xl"
        // Approving is an interaction outside this pane. Closing on it would
        // shut the preview at the exact moment the bytes become available.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
          <DialogDescription>
            {state.kind === "released"
              ? "Sent by the server. This is the response body of POST /api/content."
              : "The file server decides here, before the bytes move."}
          </DialogDescription>
        </DialogHeader>

        <Body state={state} />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- states

function Body({ state }: { state: State }) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2.5 rounded-lg border border-border bg-muted/30 p-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Evaluating the request before assembling the file…
        </span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <TriangleAlert className="size-4 text-destructive" />
        <p className="text-xs font-medium">Could not reach the file server</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {state.message}
        </p>
      </div>
    );
  }

  if (state.kind === "released") {
    return (
      <div className="flex min-h-0 flex-col gap-2.5">
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2",
            state.flagged
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-success/30 bg-success/10 text-success",
          )}
        >
          <ShieldCheck className="size-4 shrink-0" />
          <span className="text-[11px] leading-snug font-medium">
            {state.releasedBy
              ? `${state.releasedBy}. Flagged permanently — an access a human had to release never reads as an ordinary open afterwards.`
              : state.flagged
                ? "Allowed and flagged. The bytes were sent, and the access is on the record as unusual."
                : "Allowed. The bytes were sent."}
          </span>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre">
          {state.content}
        </pre>
      </div>
    );
  }

  // ---- withheld ----------------------------------------------------------

  const denied = state.reason === "denied" || state.terminal;
  const Icon = denied ? Lock : state.reason === "step_up" ? ShieldQuestion : Lock;

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn(
          "flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center",
          denied
            ? "border-border bg-muted/40"
            : "border-destructive/40 bg-destructive/5",
        )}
      >
        <Icon
          className={cn(
            "size-6",
            denied ? "text-muted-foreground" : "text-destructive",
          )}
        />
        <p className="text-sm font-medium">
          {denied
            ? "Refused. This file was never assembled."
            : state.reason === "step_up"
              ? "Held pending a stronger authentication factor."
              : state.approver
                ? `Held — awaiting ${state.approver.name}`
                : "Held. The bytes have not moved."}
        </p>
        <p className="max-w-md text-xs leading-relaxed text-balance text-muted-foreground">
          {state.message}
        </p>

        {denied ? (
          <p className="max-w-md text-[11px] leading-snug text-balance text-muted-foreground">
            There is no approver here and no queue to join. Cordyceps narrows
            access; it is never a way to widen it.
          </p>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Watching for a release — this pane updates itself
          </span>
        )}
      </div>

      <p className="shrink-0 text-center text-[11px] leading-snug text-muted-foreground">
        This is not a blurred preview. The response body that produced this pane
        contains no file text
        {state.riskScore != null ? ` · risk ${state.riskScore}` : ""}.
      </p>
    </div>
  );
}
