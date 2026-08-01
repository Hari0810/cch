"use client";

/**
 * The employee workspace — Cordyceps from the other side of the glass.
 *
 * Everything else we have built shows the *security system's* view of an
 * access: a request, a score, an approver's inbox. This screen shows the
 * employee's. You browse a folder, you open a file, and the file either opens
 * or it does not. That is the only version of the concept that reads to
 * someone who does not already believe it.
 *
 * SERVED ON PORT 3001, DELIBERATELY.
 *   NEXT_DIST_DIR=.next-workspace pnpm exec next dev -p 3001
 * The rehearsed demo lives on 3000 and nothing here is linked from it. If this
 * screen breaks, the submission does not — see docs/handoff.md §10.
 *
 * NOTHING HERE IS MOCKED except the word "mockup" in the brief. The folder tree
 * is `resource` rows from `GET /api/org`; opening a file is a real
 * `POST /api/content`, which runs the same engine, the same withhold set and
 * the same single-use release as the dashboard. There is no branch in this file
 * on which identity or which file is involved — if there were, the screen would
 * be a slideshow and the product argument would collapse with it (AGENTS.md
 * ground rule 3).
 *
 * The bytes are the point. A withheld file arrives as a 200 with **no
 * `content` key at all** — this component cannot render what it was not sent,
 * which is exactly the property a judge with a network tab open is checking
 * for.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Table2,
  KeyRound,
  LayoutDashboard,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { occurredAt } from "@/lib/occurred-at";
import { cn } from "@/lib/utils";
import type { OrgResource, OrgSnapshot } from "@/components/organisation/types";
import type { Action, Decision, Sensitivity } from "@/lib/types";

// --------------------------------------------------------------- scenarios

type Scenario = {
  key: "A" | "N" | "C";
  identityId: string;
  /** Whose account the workspace chrome says you are in. */
  who: string;
  /** Second line — the delegation, where there is one. */
  actingFor: string | null;
  role: string;
  /** Wall-clock the *request* asserts. AGENTS.md rule 1 — never `now()`. */
  time: string;
  action: Action;
  /** The folder the tab lands you in, and the file the story is about. */
  openFolderId: string;
  targetResourceId: string;
  /** One line of framing, from the employee's point of view, not the system's. */
  premise: string;
};

/**
 * The same three scenarios as `SCENARIOS` in components/request-panel.tsx and
 * docs/demo-scenario.md §8, told from the employee's seat. Ids must match the
 * seed; a rename in the seed is a one-line fix here.
 */
const SCENARIOS: Scenario[] = [
  {
    key: "A",
    identityId: "alice",
    who: "Alice Morgan",
    actingFor: null,
    role: "Senior Engineer · Atlas",
    time: "10:15",
    action: "view",
    openFolderId: "res-atlas-folder",
    targetResourceId: "res-customer-export-schema",
    premise:
      "Tuesday morning. Alice opens a schema on the project she is assigned to. Nothing should get in her way.",
  },
  {
    key: "N",
    identityId: "daniel",
    who: "Daniel Kim",
    actingFor: null,
    role: "Finance Analyst · Nova",
    time: "23:20",
    action: "download",
    openFolderId: "res-finance-folder",
    targetResourceId: "res-acquisition-valuation-xlsx",
    premise:
      "Twenty past eleven at night. Daniel downloads a restricted valuation model — because the model is due tomorrow and it is his task.",
  },
  {
    key: "C",
    identityId: "provenance-ai",
    who: "Provenance AI",
    actingFor: "Alice Morgan",
    role: "Connected app · holds Alice's access",
    time: "23:40",
    action: "download",
    openFolderId: "res-finance-folder",
    targetResourceId: "res-acquisition-valuation-xlsx",
    premise:
      "Twenty minutes later. The same file, reached by an AI assistant connected to Alice's account eight months ago. Every permission checks out.",
  },
];

/**
 * Ids only — mirrors the keys of `CONTENT` in src/lib/content.ts, which is
 * server-only and must never be imported here. Importing it would ship every
 * file body to the browser and quietly undo the entire enforcement feature.
 * This list is used for nothing but greying out a row we know has no preview
 * authored, so a stale entry costs a 404 and nothing else.
 */
const PREVIEWABLE = new Set([
  "res-acquisition-valuation-xlsx",
  "res-customer-export-schema",
  "res-target-company-contracts",
  "res-board-valuation-deck",
  "res-engineering-handbook",
]);

// ----------------------------------------------------------------- outcome

/** The shape POST /api/content returns. Withheld responses carry no `content`. */
type ContentResponse = {
  released: boolean;
  via: "release" | "poll" | "decision" | "policy";
  decision?: Decision | "DENY";
  withhold_reason?: "denied" | "awaiting_approval" | "step_up";
  terminal?: boolean;
  awaiting_release?: boolean;
  resource_id: string;
  resource_name: string;
  content?: string;
  risk_score?: number;
  reasoning?: string;
  policy_reasons?: string[];
  scored_by?: string;
  approver?: { id: string; name: string } | null;
  expires_in_minutes?: number | null;
  single_use?: boolean;
  released_by?: string | null;
  message?: string;
  occurred_at: string;
};

const POLL_MS = 2000;

// -------------------------------------------------------------------- page

export default function WorkspacePage() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [folderId, setFolderId] = useState<string>(SCENARIOS[0].openFolderId);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [result, setResult] = useState<ContentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/org", { cache: "no-store" });
        const body = (await res.json()) as OrgSnapshot | { error?: string };
        if (!live) return;
        if (!res.ok || !("counts" in body)) {
          setOrgError(
            ("error" in body && body.error) || `${res.status} ${res.statusText}`,
          );
          return;
        }
        setOrg(body);
      } catch (e) {
        if (live) setOrgError(e instanceof Error ? e.message : "Network error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Switching seats clears the desk. Nothing carries across identities. */
  function selectScenario(s: Scenario) {
    setScenario(s);
    setFolderId(s.openFolderId);
    setOpenedId(null);
    setResult(null);
    setError(null);
  }

  const open = useCallback(
    async (resource: OrgResource, poll = false) => {
      if (!poll) {
        setBusy(true);
        setError(null);
        setOpenedId(resource.id);
        setResult(null);
      }
      try {
        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity_id: scenario.identityId,
            resource_id: resource.id,
            action: scenario.action,
            // Never `new Date()` inline — see src/lib/occurred-at.ts.
            occurred_at: occurredAt(scenario.time),
            poll,
          }),
        });
        const body = (await res.json()) as ContentResponse & { error?: string };
        if (!res.ok) {
          // A poll that fails is not worth surfacing; the next tick recovers.
          if (!poll) setError(body.error ?? `${res.status} ${res.statusText}`);
          return;
        }
        // A poll that has nothing to report must not wipe the pane it is
        // polling underneath.
        if (poll && !body.released) return;
        setResult(body);
      } catch (e) {
        if (!poll) setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!poll) setBusy(false);
      }
    },
    [scenario],
  );

  // While an access is suspended, ask one cheap question every two seconds:
  // has an approver released it yet? `poll: true` never reaches the scorer.
  const openedRef = useRef<OrgResource | null>(null);
  const suspended =
    result !== null && !result.released && result.terminal === false;

  useEffect(() => {
    if (!suspended || !openedRef.current) return;
    const target = openedRef.current;
    const t = setInterval(() => void open(target, true), POLL_MS);
    return () => clearInterval(t);
  }, [suspended, open]);

  // Memoised because `?? []` is a fresh array every render, which would make
  // every derived list below recompute on each keystroke of state.
  const resources = useMemo(() => org?.resources ?? [], [org]);
  const folders = useMemo(
    () => resources.filter((r) => r.type === "folder"),
    [resources],
  );
  /** Everything with no folder above it — dashboards, tables, keys. */
  const loose = useMemo(
    () => resources.filter((r) => r.type !== "folder" && !r.parent),
    [resources],
  );
  const currentFolder = folders.find((f) => f.id === folderId) ?? null;
  const listing = currentFolder
    ? resources.filter((r) => r.parent?.id === currentFolder.id)
    : loose;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ScenarioRail
        active={scenario}
        onSelect={selectScenario}
        onOpenTarget={() => {
          const target = resources.find(
            (r) => r.id === scenario.targetResourceId,
          );
          if (target) {
            openedRef.current = target;
            void open(target);
          }
        }}
        canOpen={resources.length > 0 && !busy}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader scenario={scenario} folder={currentFolder} />

        <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)]">
          <FolderRail
            folders={folders}
            looseCount={loose.length}
            activeId={folderId}
            onSelect={(id) => setFolderId(id)}
          />

          <div className="grid min-h-0 grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <FileList
              listing={listing}
              loading={!org && !orgError}
              error={orgError}
              openedId={openedId}
              targetId={scenario.targetResourceId}
              busy={busy}
              onOpen={(r) => {
                openedRef.current = r;
                void open(r);
              }}
              action={scenario.action}
            />
            <OutcomePane
              scenario={scenario}
              result={result}
              busy={busy}
              error={error}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------- left: tabs

function ScenarioRail({
  active,
  onSelect,
  onOpenTarget,
  canOpen,
}: {
  active: Scenario;
  onSelect: (s: Scenario) => void;
  onOpenTarget: () => void;
  canOpen: boolean;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold tracking-tight">
          Nimbus Drive
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            workspace
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          The employee&apos;s side of the glass. Cordyceps sits in front of every
          open.
        </p>
      </div>

      <nav aria-label="Demo scenarios" className="flex flex-col gap-1 p-3">
        {SCENARIOS.map((s) => {
          const on = s.key === active.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(s)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left transition-colors",
                on
                  ? "border-border bg-accent text-accent-foreground"
                  : "border-transparent hover:bg-accent/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold",
                    on
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.key}
                </span>
                <span
                  className={cn(
                    "truncate text-sm",
                    on ? "font-semibold" : "font-medium text-muted-foreground",
                  )}
                >
                  {s.who}
                </span>
              </div>
              {s.actingFor && (
                <p className="mt-0.5 pl-7 text-[11px] text-alert">
                  acting for {s.actingFor}
                </p>
              )}
              <p className="mt-1 pl-7 font-mono text-[11px] text-muted-foreground tabular-nums">
                {s.time} · {s.action}
              </p>
              {on && (
                <p className="mt-2 pl-7 text-[11px] leading-snug text-muted-foreground">
                  {s.premise}
                </p>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 border-t p-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!canOpen}
          onClick={onOpenTarget}
        >
          <ChevronRight className="size-3.5" />
          Open the file in this scenario
        </Button>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Or click any file. Every open is a real request against the same
          engine — nothing on this screen is scripted.
        </p>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------ chrome + rail

function WorkspaceHeader({
  scenario,
  folder,
}: {
  scenario: Scenario;
  folder: OrgResource | null;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Folder className="size-3.5" />
        Files
        <ChevronRight className="size-3 opacity-50" />
        <span className="font-medium text-foreground">
          {folder?.name ?? "Not in a folder"}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular-nums">
          <Clock className="size-3.5" />
          {scenario.time}
        </span>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-xs">
          <span className="text-muted-foreground">Signed in as </span>
          <span className="font-medium">{scenario.who}</span>
          {scenario.actingFor && (
            <span className="text-alert"> for {scenario.actingFor}</span>
          )}
          <span className="text-muted-foreground"> · {scenario.role}</span>
        </span>
      </div>
    </header>
  );
}

function FolderRail({
  folders,
  looseCount,
  activeId,
  onSelect,
}: {
  folders: OrgResource[];
  looseCount: number;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const rows = [
    ...folders.map((f) => ({
      id: f.id,
      name: f.name,
      note: f.project?.name ?? "Company-wide",
      sensitivity: f.sensitivity,
    })),
    ...(looseCount > 0
      ? [
          {
            id: "__loose__",
            name: "Not in a folder",
            note: `${looseCount} items`,
            sensitivity: null as Sensitivity | null,
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Folders"
      className="flex flex-col gap-0.5 overflow-y-auto border-r p-2"
    >
      {rows.map((row) => {
        const on = row.id === activeId;
        return (
          <button
            key={row.id}
            type="button"
            aria-current={on ? "true" : undefined}
            onClick={() => onSelect(row.id)}
            className={cn(
              "flex items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
              on ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
          >
            {on ? (
              <FolderOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-sm",
                  on ? "font-semibold" : "font-medium",
                )}
              >
                {row.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.note}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ------------------------------------------------------------- file listing

const TYPE_ICON = {
  folder: Folder,
  file: FileText,
  db_table: Table2,
  dashboard: LayoutDashboard,
  secret: KeyRound,
} as const;

function FileList({
  listing,
  loading,
  error,
  openedId,
  targetId,
  busy,
  onOpen,
  action,
}: {
  listing: OrgResource[];
  loading: boolean;
  error: string | null;
  openedId: string | null;
  targetId: string;
  busy: boolean;
  onOpen: (r: OrgResource) => void;
  action: Action;
}) {
  if (error) {
    return (
      <div className="border-r p-4">
        <p className="text-sm font-medium text-destructive">
          Could not list the drive
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 border-r p-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <span className="sr-only">Loading the drive</span>
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto border-r p-2">
      <div className="px-2 pt-1 pb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {listing.length} {listing.length === 1 ? "item" : "items"} ·{" "}
        {action === "download" ? "click to download" : "click to open"}
      </div>

      <ul className="flex flex-col gap-0.5">
        {listing.map((r) => {
          const Icon = TYPE_ICON[r.type as keyof typeof TYPE_ICON] ?? FileText;
          const on = r.id === openedId;
          const isTarget = r.id === targetId;
          const noPreview = !PREVIEWABLE.has(r.id) && r.type !== "folder";

          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpen(r)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors disabled:opacity-60",
                  on ? "bg-accent" : "hover:bg-accent/50",
                  isTarget && !on && "ring-1 ring-border ring-inset",
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {r.name}
                    </span>
                    <SensitivityDot value={r.sensitivity} />
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {r.project?.name ?? "Company-wide"} · {r.type}
                    {noPreview && " · no preview authored"}
                  </span>
                </span>
                {busy && on && (
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
              </button>
            </li>
          );
        })}
        {listing.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-muted-foreground">
            This folder is empty.
          </li>
        )}
      </ul>
    </div>
  );
}

const SENSITIVITY_TONE: Record<Sensitivity, string> = {
  public: "text-muted-foreground",
  internal: "text-muted-foreground",
  confidential: "text-alert",
  restricted: "text-destructive",
};

function SensitivityDot({ value }: { value: Sensitivity }) {
  if (value === "public" || value === "internal") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 px-1.5 py-0 text-[9px] tracking-wide uppercase",
        SENSITIVITY_TONE[value],
      )}
    >
      {value}
    </Badge>
  );
}

// ------------------------------------------------------------- the outcome

function OutcomePane({
  scenario,
  result,
  busy,
  error,
}: {
  scenario: Scenario;
  result: ContentResponse | null;
  busy: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <Pane>
        <p className="text-sm font-medium text-destructive">
          The request did not complete
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </Pane>
    );
  }

  if (busy && !result) {
    return (
      <Pane>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking this access…
        </div>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          Permission is resolved first and is cheap. If it holds, the context —
          project membership, open tasks, this identity&apos;s own history — goes
          to the model, and a threshold table turns the score into an outcome.
        </p>
      </Pane>
    );
  }

  if (!result) {
    return (
      <Pane>
        <p className="text-sm font-medium">{scenario.who}&apos;s drive</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          {scenario.premise}
        </p>
        <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">
          Open something. Every file listed here is one this identity can reach
          under ordinary permissions — that is the whole problem, and it is why
          the answer cannot be a permission check.
        </p>
      </Pane>
    );
  }

  if (result.released) return <ReleasedPane result={result} />;
  if (result.withhold_reason === "denied") return <DeniedPane result={result} />;
  return <SuspendedPane result={result} />;
}

function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 overflow-y-auto p-5">
      <div className="flex min-h-full flex-col">{children}</div>
    </div>
  );
}

function ReleasedPane({ result }: { result: ContentResponse }) {
  const viaRelease = result.via === "release";

  return (
    <Pane>
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2.5",
          viaRelease
            ? "border-success/30 bg-success/10"
            : "border-border bg-muted/40",
        )}
      >
        <ShieldCheck
          className={cn(
            "mt-0.5 size-4 shrink-0",
            viaRelease ? "text-success" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-medium text-foreground">
            {viaRelease
              ? "Released. The file was sent once."
              : `Opened · ${result.decision}`}
            {typeof result.risk_score === "number" && (
              <span className="ml-2 font-mono text-muted-foreground tabular-nums">
                risk {result.risk_score}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {viaRelease
              ? `${result.released_by ?? "An approver released this access"}. The capability is now spent — a second download needs a second decision.`
              : "Cordyceps did not interfere. This is what the system doing nothing looks like, and it is most of what it does."}
          </p>
        </div>
      </div>

      {result.policy_reasons && result.policy_reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {result.policy_reasons.slice(0, 4).map((r, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs leading-snug text-muted-foreground"
            >
              <span className="text-success">✓</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-2">
        <FileText className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{result.resource_name}</span>
        {result.single_use && (
          <Badge variant="outline" className="text-[10px]">
            single use
          </Badge>
        )}
      </div>

      <pre className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30 p-4 font-mono text-[11px] leading-relaxed whitespace-pre">
        {result.content}
      </pre>
    </Pane>
  );
}

function SuspendedPane({ result }: { result: ContentResponse }) {
  const stepUp = result.withhold_reason === "step_up";

  return (
    <Pane>
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
        <Lock className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-medium text-destructive">
            {stepUp
              ? "Held pending a stronger authentication factor"
              : "This file did not open"}
            {typeof result.risk_score === "number" && (
              <span className="ml-2 font-mono tabular-nums">
                risk {result.risk_score}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-muted-foreground">{result.message}</p>
        </div>
      </div>

      {result.policy_reasons && result.policy_reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {result.policy_reasons.slice(0, 5).map((r, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs leading-snug text-muted-foreground"
            >
              <ShieldAlert className="mt-px size-3 shrink-0 text-destructive" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {result.reasoning && (
        <p className="mt-3 border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {result.reasoning}
        </p>
      )}

      {/* The empty frame is the argument. There is no file underneath this —
          the response carried no `content` field at all. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-lg border border-dashed">
        <div className="flex items-center gap-2 border-b border-dashed px-4 py-2.5">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{result.resource_name}</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            withheld
          </Badge>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <Lock className="size-6 text-muted-foreground/60" />
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            The server has this file and is not sending it. Nothing is hidden in
            this page — the response contained{" "}
            <span className="font-mono">no content field</span>. Open the network
            tab and check.
          </p>
          {result.approver && (
            <p className="mt-2 max-w-sm text-xs leading-relaxed">
              <span className="text-muted-foreground">Waiting on </span>
              <span className="font-medium">{result.approver.name}</span>
              {result.expires_in_minutes != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · expires in {result.expires_in_minutes} min, then escalates up
                  the org chart
                </span>
              )}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Watching for a release — this page will open the file the moment one
            is granted.
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Suspended, not denied. The approver decides in the Cordyceps inbox; this
        screen is the employee&apos;s side and never learns anything except
        whether the bytes arrived.
      </p>
    </Pane>
  );
}

function DeniedPane({ result }: { result: ContentResponse }) {
  return (
    <Pane>
      <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 text-xs leading-relaxed">
          <p className="font-medium">Refused — no permission reaches this file</p>
          <p className="mt-0.5 text-muted-foreground">{result.message}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
        <Download className="size-6 text-muted-foreground/50" />
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          This is ordinary access control, and it is deliberately a dead end.
          There is no approver on this outcome: Cordyceps narrows access and must
          never widen it, so a second party can never grant reach that IAM never
          granted.
        </p>
      </div>
    </Pane>
  );
}
