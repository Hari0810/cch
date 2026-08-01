"use client";

/**
 * Rung 3b, Tier 1 — the access graph (docs/attack-graph.md).
 *
 * A re-layout of data the app already has: `decision.permission_path` is the
 * spine, `context_summary` supplies the project boundary. `GET /api/graph` is
 * strictly enrichment — if it 404s the picture is complete without it.
 *
 * Hand-laid out (absolutely positioned nodes over one SVG edge layer) rather
 * than React Flow: the load-bearing element is a *broken* edge with a gap and a
 * ✗ in it, which is a custom edge renderer either way, and this version has no
 * interaction surface to accidentally leave enabled — nothing here is
 * draggable, connectable or editable because there is no such code.
 */

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Folder,
  FolderKanban,
  Key,
  KeyRound,
  User,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AccessDecision, AccessGraph, Sensitivity } from "@/lib/types";

import {
  curvePath,
  layoutGraph,
  orthoPath,
  type GEdge,
  type GNode,
  type GNodeKind,
} from "./graph-model";

// ------------------------------------------------------------------ tokens

const NODE_ICON: Record<GNodeKind, typeof User> = {
  identity: User,
  oauth_app: Key,
  group: Users,
  folder: Folder,
  resource: FileText,
  project: FolderKanban,
};

const KIND_LABEL: Record<GNodeKind, string> = {
  identity: "identity",
  oauth_app: "oauth app",
  group: "group",
  folder: "folder",
  resource: "object",
  project: "project",
};

/** Severity ramp, same tokens as the decision card. */
function sensitivityTone(s: Sensitivity): string {
  if (s === "restricted") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (s === "confidential") return "border-alert/40 bg-alert/10 text-alert";
  return "border-border bg-muted/60 text-muted-foreground";
}

/** Stroke colours live as CSS vars so the SVG grades with everything else. */
function edgeStroke(kind: GEdge["kind"]): string {
  if (kind === "absent") return "var(--destructive)";
  if (kind === "member") return "var(--success)";
  if (kind === "acts_for") return "var(--alert)";
  return "var(--muted-foreground)";
}

// ------------------------------------------------------------------ node

function NodeBox({ node }: { node: GNode }) {
  const Icon = NODE_ICON[node.kind];
  const notMember = node.state === "not-member";
  const badges = node.focus || node.sensitivity !== null;

  return (
    <div
      className={cn(
        "absolute flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-sm transition-colors",
        node.kind === "oauth_app" && "border-alert/40 bg-alert/10",
        node.kind === "project" &&
          (notMember
            ? "border-dashed border-destructive/45 bg-destructive/5"
            : "border-dashed border-success/40 bg-success/5"),
        node.focus && "border-foreground/30 bg-accent ring-1 ring-foreground/10",
        node.kind !== "oauth_app" &&
          node.kind !== "project" &&
          !node.focus &&
          "border-border bg-card",
      )}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          node.kind === "oauth_app"
            ? "text-alert"
            : node.kind === "project"
              ? notMember
                ? "text-destructive"
                : "text-success"
              : "text-muted-foreground",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs leading-tight font-medium">
          {node.label}
        </span>
        {badges ? (
          <span className="flex items-center gap-1">
            {node.focus && (
              <span className="rounded border border-foreground/30 bg-background px-1.5 py-0.5 text-[9px] leading-none tracking-wide uppercase">
                requested
              </span>
            )}
            {node.sensitivity && (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[9px] leading-none tracking-wide uppercase",
                  sensitivityTone(node.sensitivity),
                )}
              >
                {node.sensitivity}
              </span>
            )}
          </span>
        ) : (
          <span className="truncate text-[10px] leading-tight text-muted-foreground">
            {(node.meta ?? KIND_LABEL[node.kind])
              .split(" · ")
              .map((part, i) => (
                <span key={part}>
                  {i > 0 && " · "}
                  <span
                    className={cn(
                      /never reviewed/i.test(part) && "font-medium text-alert",
                    )}
                  >
                    {part}
                  </span>
                </span>
              ))}
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ edges

/**
 * The absent edge gets a literal hole punched in it: two dashed segments and a
 * ✗ in the gap. It must read as a relationship that is *missing*, not as one
 * more line on the diagram.
 */
function EdgeLine({ edge }: { edge: GEdge }) {
  const stroke = edgeStroke(edge.kind);
  const d = edge.shape === "curve" ? curvePath(edge.points) : orthoPath(edge.points);

  if (!edge.broken) {
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={edge.kind === "member" ? 1.75 : 1.5}
        strokeOpacity={edge.kind === "contains" || edge.kind === "owns" ? 0.4 : 0.55}
        markerEnd={`url(#cordyceps-arrow-${edge.kind})`}
      />
    );
  }

  const [[x1, y1]] = edge.points;
  const [x2, y2] = edge.points[edge.points.length - 1];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const gap = 15;
  const ux = (x2 - x1) / Math.hypot(x2 - x1, y2 - y1);
  const uy = (y2 - y1) / Math.hypot(x2 - x1, y2 - y1);

  return (
    <g>
      <path
        d={`M ${x1} ${y1} L ${mx - ux * gap} ${my - uy * gap}`}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="7 6"
        strokeOpacity={0.85}
      />
      <path
        d={`M ${mx + ux * gap} ${my + uy * gap} L ${x2} ${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="7 6"
        strokeOpacity={0.85}
        markerEnd="url(#cordyceps-arrow-absent)"
      />
      <circle
        cx={mx}
        cy={my}
        r={11}
        fill="var(--background)"
        stroke={stroke}
        strokeWidth={1.5}
        strokeOpacity={0.9}
      />
      <path
        d={`M ${mx - 4.5} ${my - 4.5} L ${mx + 4.5} ${my + 4.5} M ${mx + 4.5} ${my - 4.5} L ${mx - 4.5} ${my + 4.5}`}
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  );
}

function EdgeLabel({ edge }: { edge: GEdge }) {
  if (!edge.label || !edge.caption) return null;

  return (
    <div
      className={cn(
        "absolute flex flex-col gap-0.5",
        edge.label.center ? "items-center text-center" : "items-start",
      )}
      style={{ left: edge.label.left, top: edge.label.top, width: edge.label.width }}
    >
      <span
        className={cn(
          "text-[11px] leading-tight",
          edge.kind === "absent"
            ? "font-semibold text-destructive"
            : edge.kind === "member"
              ? "font-medium text-success"
              : "font-medium text-foreground/80",
        )}
      >
        {edge.caption}
      </span>
      {edge.notes.map((note) => (
        <span
          key={note}
          className={cn(
            "text-[10px] leading-tight",
            /never reviewed/i.test(note)
              ? "font-medium text-alert"
              : "text-muted-foreground",
          )}
        >
          {note}
        </span>
      ))}
    </div>
  );
}

function ArrowDefs() {
  const kinds: Array<GEdge["kind"]> = [
    "acts_for",
    "member_of",
    "grant",
    "contains",
    "owns",
    "member",
    "absent",
  ];
  return (
    <defs>
      {kinds.map((kind) => (
        <marker
          key={kind}
          id={`cordyceps-arrow-${kind}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={edgeStroke(kind)}
            fillOpacity={kind === "absent" || kind === "member" ? 0.9 : 0.55}
          />
        </marker>
      ))}
    </defs>
  );
}

// ------------------------------------------------------------------ chrome

function Legend({ blast }: { blast: AccessGraph["blast_radius"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3">
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <svg width="34" height="8" aria-hidden>
          <line
            x1="1"
            y1="4"
            x2="33"
            y2="4"
            stroke="var(--muted-foreground)"
            strokeWidth="1.5"
            strokeOpacity="0.6"
          />
        </svg>
        a permission that exists
      </span>
      <span className="flex items-center gap-2 text-[11px] text-destructive">
        <svg width="34" height="12" aria-hidden>
          <line
            x1="1"
            y1="6"
            x2="10"
            y2="6"
            stroke="var(--destructive)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <line
            x1="24"
            y1="6"
            x2="33"
            y2="6"
            stroke="var(--destructive)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <path
            d="M 14 2 L 20 10 M 20 2 L 14 10"
            stroke="var(--destructive)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
        a relationship that does not exist
      </span>
      {/* A direct grant on a single file reaches nothing else — saying "0
          objects" would be technically true and rhetorically backwards. */}
      {blast && blast.reaches.length > 1 && (
        <span className="text-[11px] text-muted-foreground">
          One grant on{" "}
          <span className="font-medium text-foreground">{blast.granted_on}</span>
          {blast.last_reviewed_at === null && (
            <span className="font-medium text-alert"> · never reviewed</span>
          )}{" "}
          · reaches{" "}
          <span className="font-medium text-foreground">
            {blast.reaches.length} object
            {blast.reaches.length === 1 ? "" : "s"}
          </span>
          , {blast.restricted_count} restricted
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground">
        The graph explains; it does not decide. Every node and edge here is a
        fact this decision already computed.
      </span>
    </div>
  );
}

function Divergence({ divergence }: { divergence: NonNullable<AccessGraph["divergence"]> }) {
  return (
    <div className="mx-5 mb-5 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Where {divergence.group_name} and Project {divergence.project_name} have
        diverged
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <p className="text-[11px] leading-snug">
          <span className="text-muted-foreground">In the group, not on the project: </span>
          <span className="font-medium text-destructive">
            {divergence.in_group_not_project.join(", ") || "—"}
          </span>
        </p>
        <p className="text-[11px] leading-snug">
          <span className="text-muted-foreground">On the project, not in the group: </span>
          <span className="font-medium text-foreground">
            {divergence.in_project_not_group.join(", ") || "—"}
          </span>
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-8 text-center text-card-foreground">
        <div className="max-w-xl space-y-3">
          <h2 className="text-sm font-medium">No access evaluated yet</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Fire a scenario on the Dashboard and this tab draws that same
            decision as a graph: the delegation, group and folder hops the
            permission travelled through, everything else that grant reaches,
            and — the reason this is a graph rather than a chain — the edge that{" "}
            <em>isn&apos;t</em> there, from the identity to the project it is
            not a member of.
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Nothing here is scored or predicted. It is the permission that let
            the access through, laid out so the missing relationship is visible.
          </p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ view

/** Never shrink past legibility — below this the canvas scrolls instead. */
const MIN_SCALE = 0.62;

export function AccessGraphView({ decision }: { decision: AccessDecision | null }) {
  // Keyed by event id rather than cleared on change, so a stale enrichment can
  // never paint over the decision that replaced it.
  const [enrichment, setEnrichment] = useState<{
    eventId: string;
    graph: AccessGraph;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const hostRef = useRef<HTMLDivElement>(null);

  /**
   * `GET /api/graph` is built in parallel and may not exist. It is enrichment
   * and nothing else: it is never awaited before first paint, every failure is
   * swallowed, and the graph renders complete from `decision` alone.
   *
   * Retried twice because the event row can land a beat after the decision
   * returns — a first 404 is not evidence the endpoint is missing, and the
   * blast radius is worth one more ask. Still silent either way.
   */
  useEffect(() => {
    if (!decision) return;
    const eventId = decision.access_event_id;

    let cancelled = false;
    (async () => {
      for (const wait of [0, 700, 1600]) {
        if (cancelled) return;
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          const res = await fetch(
            `/api/graph?event=${encodeURIComponent(eventId)}`,
          );
          if (!res.ok) continue;
          const body: unknown = await res.json();
          if (cancelled || !body || typeof body !== "object") return;
          setEnrichment({ eventId, graph: body as AccessGraph });
          return;
        } catch {
          /* optional enrichment — the picture is complete without it */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [decision]);

  const graph =
    enrichment && enrichment.eventId === decision?.access_event_id
      ? enrichment.graph
      : null;
  const blast =
    graph?.blast_radius && Array.isArray(graph.blast_radius.reaches)
      ? graph.blast_radius
      : null;
  const layout = decision
    ? layoutGraph(
        decision,
        graph ? ({ ...graph, blast_radius: blast } as AccessGraph) : null,
      )
    : null;
  const width = layout?.width ?? 1;
  const height = layout?.height ?? 1;

  /**
   * The picture is laid out at a fixed size and then fitted to whatever screen
   * the demo actually runs on — a projector at 1280×800 must not clip the top
   * of the graph, and this is one line of transform rather than a responsive
   * re-layout.
   */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const fit = () => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      setScale(
        Math.max(
          MIN_SCALE,
          Math.min(1, (box.width - 8) / width, (box.height - 8) / height),
        ),
      );
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);

  if (!decision || !layout) return <EmptyState />;

  const ctx = decision.context_summary;
  const { nodes, edges } = layout;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground">
        <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">Access graph</h2>
          <p className="text-xs text-muted-foreground">
            How this access is reachable — and the boundary it crossed.
          </p>
          <p className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="size-3" />
            <span className="font-medium text-foreground">
              {ctx.via_oauth_app ? `${ctx.via_oauth_app} → ` : ""}
              {ctx.identity_name}
            </span>
            <span>→</span>
            <span className="font-medium text-foreground">{ctx.resource_name}</span>
            <span className="font-mono tabular-nums">
              {decision.occurred_at.slice(11, 16)}
            </span>
          </p>
        </header>

        <div
          ref={hostRef}
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto"
        >
          <div
            className="relative shrink-0"
            style={{ width: width * scale, height: height * scale }}
          >
            <div
              className="absolute top-0 left-0"
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <svg
                className="absolute inset-0 overflow-visible"
                width={width}
                height={height}
                aria-hidden
              >
                <ArrowDefs />
                {edges.map((edge) => (
                  <EdgeLine key={edge.id} edge={edge} />
                ))}
              </svg>

              {edges.map((edge) => (
                <EdgeLabel key={`label-${edge.id}`} edge={edge} />
              ))}
              {nodes.map((node) => (
                <NodeBox key={`${node.id}-${node.x}-${node.y}`} node={node} />
              ))}
            </div>
          </div>
        </div>

        {graph?.divergence && <Divergence divergence={graph.divergence} />}
        <Legend blast={blast} />
      </section>
    </div>
  );
}
