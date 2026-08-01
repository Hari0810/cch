"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  Folder,
  Inbox,
  Key,
  KeyRound,
  ShieldQuestion,
  User,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AccessDecision, PermissionHop, PolicyOutcome } from "@/lib/types";

// ------------------------------------------------------------------ severity

/**
 * The severity ramp. Tokens are defined in globals.css (`--success`,
 * `--warning`, `--alert`) alongside the stock `--destructive`, so the grading
 * survives dark mode instead of being four hard-coded palette classes.
 */
const SEVERITY: Record<
  PolicyOutcome,
  { label: string; tone: string; bar: string; dot: string; Icon: typeof User }
> = {
  /**
   * Not a risk band. An ordinary RBAC refusal — no permission reaches the
   * resource, so there was nothing to reason about and there is nobody to ask.
   * Styled neutrally on purpose: this is the boring outcome, and conflating it
   * with a high-risk verdict would suggest an approver could release it.
   */
  DENY: {
    label: "Denied by policy",
    tone: "border-border bg-muted text-muted-foreground",
    bar: "bg-muted-foreground",
    dot: "text-muted-foreground",
    Icon: ShieldQuestion,
  },
  ALLOW: {
    label: "Allow",
    tone: "border-success/30 bg-success/10 text-success",
    bar: "bg-success",
    dot: "text-success",
    Icon: CircleCheck,
  },
  ALLOW_AND_FLAG: {
    label: "Allow and flag",
    tone: "border-warning/30 bg-warning/10 text-warning",
    bar: "bg-warning",
    dot: "text-warning",
    Icon: CircleAlert,
  },
  STEP_UP: {
    label: "Step up",
    tone: "border-alert/30 bg-alert/10 text-alert",
    bar: "bg-alert",
    dot: "text-alert",
    Icon: ShieldQuestion,
  },
  REQUIRE_APPROVAL: {
    label: "Require approval",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
    dot: "text-destructive",
    Icon: AlertTriangle,
  },
};

/**
 * Seeded facts about the connected third-party app. `context_summary` only
 * carries the app's *name* (see types.ts), so the expandable detail is looked
 * up here rather than invented per-render. Falls back to a generic line.
 */
const OAUTH_DETAIL: Record<string, string[]> = {
  "Provenance AI": [
    "Third-party document assistant",
    "Scope: drive.readonly (read all files)",
    "Connected 14 months ago by Alice Morgan",
    "Never reviewed · dormant for 4 months",
  ],
};

// ------------------------------------------------------------------ pieces

function hopIcon(kind: PermissionHop["kind"]) {
  if (kind === "group") return Users;
  if (kind === "folder") return Folder;
  return KeyRound;
}

/**
 * The 1:35 beat. Alice -> Engineering Leads -> finance/ -> the file, with each
 * hop's `label` on the connector — that is where "granted for cost attribution,
 * never reviewed" lands. Deliberately typeset, not a debug dump.
 */
function PermissionChain({ path }: { path: PermissionHop[] }) {
  if (path.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No permission path — access is not granted by any rule.
      </p>
    );
  }

  const nodes = [
    { name: path[0].from, Icon: User },
    ...path.map((hop, i) => ({
      name: hop.to,
      Icon: i === path.length - 1 ? FileText : hopIcon(hop.kind),
    })),
  ];

  return (
    <div className="flex items-stretch overflow-x-auto pb-1">
      {nodes.map((node, i) => (
        <div key={i} className="flex shrink-0 items-stretch">
          {i > 0 && (
            <div className="flex w-auto min-w-14 flex-col items-center justify-center px-1.5">
              <span className="max-w-32 truncate text-center text-[10px] leading-tight text-muted-foreground">
                {path[i - 1].label}
              </span>
              <span className="mt-0.5 flex w-full items-center">
                <span className="h-px flex-1 bg-border" />
                <ChevronRight className="-ml-1 size-3 shrink-0 text-border" />
              </span>
            </div>
          )}
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2",
              i === nodes.length - 1
                ? "border-foreground/20 bg-accent"
                : "border-border bg-background",
            )}
          >
            <node.Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-44 truncate text-xs font-medium">
              {node.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({
  on,
  label,
  tone = "neutral",
}: {
  on: boolean;
  label: string;
  tone?: "neutral" | "risky";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-none",
        on && tone === "risky"
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : on
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-muted/50 text-muted-foreground",
      )}
    >
      <span className="font-semibold">{on ? "yes" : "no"}</span>
      {label}
    </span>
  );
}

function ContextChips({ ctx }: { ctx: AccessDecision["context_summary"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip on={ctx.is_project_member} label="project member" />
      <Chip
        on={ctx.matching_task_count > 0}
        label={`matching task${ctx.matching_task_count === 1 ? "" : "s"} (${ctx.matching_task_count})`}
      />
      <Chip on={ctx.outside_working_hours} label="outside hours" tone="risky" />
      <Chip
        on={ctx.first_access_to_project}
        label="first access to project"
        tone="risky"
      />
      <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] leading-none text-muted-foreground">
        <span className="font-semibold text-foreground">
          {ctx.resource_sensitivity}
        </span>
        sensitivity
      </span>
      {ctx.project_name && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] leading-none text-muted-foreground">
          project
          <span className="font-semibold text-foreground">
            {ctx.project_name}
          </span>
        </span>
      )}
    </div>
  );
}

function ViaOAuthChip({ app }: { app: string }) {
  const [open, setOpen] = useState(false);
  const detail = OAUTH_DETAIL[app] ?? [
    "Connected third-party application acting on the principal's behalf.",
  ];

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-alert/30 bg-alert/10 px-2 py-1 text-[11px] leading-none text-alert transition-colors hover:bg-alert/20"
      >
        <Key className="size-3" />
        via {app}
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {detail.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ shell

function Shell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Reserved for rung 2. Marked so it reads as "next", not as missing. */
function ReservedRow({ decision }: { decision: AccessDecision | null }) {
  return (
    <div className="grid min-h-24 flex-1 grid-cols-2 gap-3">
      <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-3">
        <span className="text-[11px] font-semibold tracking-tight text-muted-foreground">
          Approve / reject
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {decision?.approver
            ? `Awaiting ${decision.approver.name}`
            : "Controls appear here when a decision needs a human."}
          {decision?.expires_in_minutes != null && (
            <>
              {" · expires in "}
              <span className="font-mono tabular-nums">
                {decision.expires_in_minutes}
              </span>
              {" min"}
            </>
          )}
        </span>
      </div>
      <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-3">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
          <Inbox className="size-3.5" />
          Approver inbox
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {decision?.approval_request_id
            ? "1 request pending"
            : "Empty — requests land here live."}
        </span>
      </div>
    </div>
  );
}

function RawPanel({ decision }: { decision: AccessDecision }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
        Raw response
      </button>
      {open && (
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-md border border-border bg-muted/50 p-2.5 font-mono text-[10px] leading-snug text-muted-foreground">
          {JSON.stringify(decision, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ card

export function DecisionCard({
  decision,
  pending,
  error,
  className,
}: {
  decision: AccessDecision | null;
  pending: boolean;
  error: string | null;
  className?: string;
}) {
  if (pending) {
    return (
      <Shell className={cn("gap-4 p-5", className)}>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="ml-auto h-5 w-52 rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-md" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
        <p className="text-xs text-muted-foreground">
          Joining permissions, tasks, project membership and behavioural
          baseline…
        </p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell className={cn("items-center justify-center p-8", className)}>
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle />
          <AlertTitle>Could not evaluate the request</AlertTitle>
          <AlertDescription>
            <span className="font-mono text-xs">{error}</span>
            <span>Check that POST /api/access is running, then try again.</span>
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  if (!decision) {
    return (
      <Shell
        className={cn(
          "items-center justify-center gap-2 p-8 text-center",
          className,
        )}
      >
        <p className="text-sm font-medium">No request evaluated yet</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Fire a scenario on the left. Permissions answer whether you{" "}
          <em>can</em>; this card answers whether you <em>should</em>, right
          now.
        </p>
      </Shell>
    );
  }

  const sev = SEVERITY[decision.decision] ?? SEVERITY.ALLOW;
  const ctx = decision.context_summary;
  const score = Math.max(0, Math.min(100, Math.round(decision.risk_score)));
  const time = decision.occurred_at.slice(11, 16);

  return (
    <Shell className={cn("gap-3.5 p-5", className)}>
      {/* ---------------------------------------------------- verdict strip */}
      <header className="flex shrink-0 items-center gap-4">
        <Badge
          variant="outline"
          className={cn(
            "gap-2 rounded-lg border px-3 py-2 text-sm font-semibold tracking-tight",
            sev.tone,
          )}
        >
          <sev.Icon className="size-4" />
          {sev.label.toUpperCase()}
        </Badge>

        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "font-mono text-3xl leading-none font-semibold tabular-nums",
              sev.dot,
            )}
          >
            {score}
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              risk score
            </span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", sev.bar)}
                style={{ width: `${score}%` }}
              />
            </span>
          </div>
        </div>

        <Separator orientation="vertical" className="mx-1" />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {ctx.identity_name}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="truncate text-sm font-medium">
              {ctx.resource_name}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums">
              <Clock className="size-3" />
              {time}
            </span>
          </div>
          {ctx.via_oauth_app && <ViaOAuthChip app={ctx.via_oauth_app} />}
        </div>
      </header>

      {/* -------------------------------------------------------- reasoning */}
      <p className="shrink-0 text-sm leading-relaxed text-balance">
        {decision.reasoning}
      </p>

      {/* -------------------------------------- reasons | context (flexible) */}
      <div className="grid max-h-56 shrink-0 grid-cols-[1.35fr_1fr] gap-4">
        <div className="flex min-h-0 flex-col gap-2">
          <h3 className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Why
          </h3>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {decision.policy_reasons.map((reason, i) => (
              <li key={i} className="flex gap-2 text-xs leading-snug">
                <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", sev.bar)} />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <h3 className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Context
          </h3>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ContextChips ctx={ctx} />
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- the 1:35 demo beat */}
      <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <h3 className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Permission path — how this access is granted
        </h3>
        <PermissionChain path={decision.permission_path} />
      </div>

      <ReservedRow decision={decision} />
      <RawPanel decision={decision} />
    </Shell>
  );
}
