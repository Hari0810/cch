/**
 * Turns an `AccessDecision` (plus the optional `/api/graph` enrichment) into a
 * laid-out picture. Pure — no React, no fetching, no DOM.
 *
 * THE GRAPH EXPLAINS; IT DOES NOT DETECT (docs/attack-graph.md §5). Every node
 * and edge produced here is either a hop the engine already computed or a
 * deterministic fact off `context_summary` / `blast_radius`. Nothing is derived,
 * scored, inferred or predicted. Delete this file and every decision is
 * byte-identical.
 */

import type { AccessDecision, AccessGraph, PermissionHop, Sensitivity } from "@/lib/types";

// ------------------------------------------------------------------ geometry

const TOP = 30;
const NODE_W = 264;
const NODE_H = 60;
const SPINE_CX = 270;
const ROW_GAP = 120;

const FAN_W = 232;
const FAN_GAP = 22;
const FAN_LEFT = 52;

const PROJECT_W = 262;
const PROJECT_CX = 800;

/** Fan wider than this and the picture stops being readable on a projector. */
const MAX_SIBLINGS = 3;

// ------------------------------------------------------------------ types

export type GNodeKind =
  | "identity"
  | "oauth_app"
  | "group"
  | "folder"
  | "resource"
  | "project";

export type GEdgeKind =
  | "acts_for"
  | "member_of"
  | "grant"
  | "contains"
  | "owns"
  | "member"
  | "absent";

export interface GNode {
  id: string;
  kind: GNodeKind;
  label: string;
  meta: string | null;
  sensitivity: Sensitivity | null;
  /** The object this request actually targeted. Exactly one, or none. */
  focus: boolean;
  /** Project nodes only — whether the identity is inside that boundary. */
  state?: "member" | "not-member";
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GEdge {
  id: string;
  kind: GEdgeKind;
  shape: "ortho" | "curve";
  points: Array<[number, number]>;
  caption: string | null;
  /** Provenance clauses off the hop label — "granted 6 months ago…", "never reviewed". */
  notes: string[];
  /** Drawn with a gap and a ✗ at the midpoint. Only the absent edge sets this. */
  broken: boolean;
  label: { left: number; top: number; width: number; center: boolean } | null;
}

export interface GLayout {
  width: number;
  height: number;
  nodes: GNode[];
  edges: GEdge[];
}

// ------------------------------------------------------------------ parsing

/**
 * `PermissionHop.from`/`.to` are database ids (`res-finance-folder`); the
 * display names live inside `label`, which the engine builds from fixed
 * templates in src/lib/engine/policy.ts:
 *
 *   "<app> acts for <human> (<scope>)"
 *   "<human> is a member of <group>"
 *   "<subject> holds <action> on <resource> · <provenance…>"
 *   "<folder> contains <child>"
 *
 * Parsed here rather than re-queried, so the graph can never disagree with the
 * chain the decision card renders. Every branch falls back to a prettified id,
 * so a template change degrades to "Res Finance Folder" instead of throwing.
 */
interface ParsedHop {
  kind: GEdgeKind;
  fromName: string;
  toName: string;
  caption: string;
  notes: string[];
}

/** Greedy, so a nested scope — "Alice (drive.readonly (read all files))" — goes too. */
function stripParenthetical(s: string): string {
  return s.replace(/\s*\(.*\)\s*$/, "").trim();
}

function prettifyId(id: string): string {
  return id
    .replace(/^res-/, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseHop(hop: PermissionHop): ParsedHop {
  const [head = "", ...notes] = hop.label.split(" · ");
  const cleanNotes = notes.map((n) => stripParenthetical(n)).filter(Boolean);

  const fallback = (kind: GEdgeKind, caption: string): ParsedHop => ({
    kind,
    fromName: prettifyId(hop.from),
    toName: prettifyId(hop.to),
    caption,
    notes: cleanNotes,
  });

  const actsFor = head.indexOf(" acts for ");
  if (actsFor !== -1) {
    return {
      kind: "acts_for",
      fromName: head.slice(0, actsFor).trim(),
      toName: stripParenthetical(head.slice(actsFor + 10)),
      caption: "acts for",
      notes: cleanNotes,
    };
  }

  const memberOf = head.indexOf(" is a member of ");
  if (memberOf !== -1) {
    return {
      kind: "member_of",
      fromName: head.slice(0, memberOf).trim(),
      toName: stripParenthetical(head.slice(memberOf + 16)),
      caption: "member of",
      notes: cleanNotes,
    };
  }

  // The action can be compound — "holds view + download on finance/".
  const holds = head.match(/^(.*?) holds (.+?) on (.+)$/);
  if (holds) {
    return {
      kind: "grant",
      fromName: holds[1].trim(),
      toName: stripParenthetical(holds[3]),
      caption: `holds ${holds[2]}`,
      notes: cleanNotes,
    };
  }

  const contains = head.indexOf(" contains ");
  if (contains !== -1) {
    return {
      kind: "contains",
      fromName: head.slice(0, contains).trim(),
      toName: stripParenthetical(head.slice(contains + 10)),
      caption: "contains",
      notes: cleanNotes,
    };
  }

  if (hop.kind === "group") return fallback("member_of", "member of");
  if (hop.kind === "folder") return fallback("contains", "contains");
  return fallback("grant", "grants");
}

// ------------------------------------------------------------------ chain

interface ChainNode {
  id: string;
  kind: GNodeKind;
  label: string;
  meta: string | null;
  sensitivity?: Sensitivity | null;
}

/** The vertical spine: node 0 is whoever asked, the last node is what they got. */
function buildChain(decision: AccessDecision): {
  chain: ChainNode[];
  hops: ParsedHop[];
  identityIndex: number;
} {
  const ctx = decision.context_summary;
  const path = decision.permission_path;

  // No permission reaches the resource (a plain RBAC refusal). There is still a
  // picture worth drawing: who asked, what they wanted, and the missing edge in
  // between.
  if (path.length === 0) {
    const asker: ChainNode = ctx.via_oauth_app
      ? {
          id: "asker",
          kind: "oauth_app",
          label: ctx.via_oauth_app,
          meta: ctx.oauth_detail?.scope ?? `acting for ${ctx.identity_name}`,
        }
      : { id: "asker", kind: "identity", label: ctx.identity_name, meta: null };

    return {
      chain: [
        asker,
        {
          id: "target",
          kind: "resource",
          label: ctx.resource_name,
          meta: null,
        },
      ],
      hops: [
        {
          kind: "absent",
          fromName: asker.label,
          toName: ctx.resource_name,
          caption: "no permission reaches this",
          notes: [],
        },
      ],
      identityIndex: 0,
    };
  }

  const hops = path.map(parseHop);
  const chain: ChainNode[] = [];

  const firstIsDelegation = hops[0].kind === "acts_for";
  chain.push({
    id: path[0].from,
    kind: firstIsDelegation ? "oauth_app" : "identity",
    label: hops[0].fromName,
    meta:
      firstIsDelegation && ctx.oauth_detail?.scope ? ctx.oauth_detail.scope : null,
  });

  path.forEach((hop, i) => {
    const parsed = hops[i];
    const last = i === path.length - 1;

    let kind: GNodeKind;
    if (parsed.kind === "acts_for") kind = "identity";
    else if (parsed.kind === "member_of") kind = "group";
    else kind = last ? "resource" : "folder";

    chain.push({
      id: hop.to,
      kind,
      label: parsed.toName,
      meta: null,
    });
  });

  // The human the permission actually belongs to — the anchor for the absent
  // edge, since it is the person who is not on the project, not the token.
  const identityIndex = chain.findIndex((n) => n.kind === "identity");

  return { chain, hops, identityIndex: identityIndex === -1 ? 0 : identityIndex };
}

// ------------------------------------------------------------------ layout

export function layoutGraph(
  decision: AccessDecision,
  graph: AccessGraph | null,
): GLayout {
  const ctx = decision.context_summary;
  const { chain, hops, identityIndex } = buildChain(decision);

  /**
   * When the enrichment endpoint is up it carries better copy for the same
   * nodes — a group's member list, the app's scope, the principal's role — keyed
   * by the same ids `permission_path` uses. Purely additive: every node already
   * has a label and a kind before this runs.
   */
  const enrich = new Map(graph?.nodes?.map((n) => [n.id, n]) ?? []);
  chain.forEach((node) => {
    const extra = enrich.get(node.id);
    if (!extra) return;
    if (extra.label) node.label = extra.label;
    // Folders and files keep "folder"/"object": their second line is the
    // sensitivity badge, and a category word there would displace it.
    if (extra.sublabel && node.kind !== "folder" && node.kind !== "resource") {
      node.meta = extra.sublabel;
    }
    if (extra.sensitivity) node.sensitivity = extra.sensitivity;
  });

  const focusId = chain[chain.length - 1].id;
  const focusLabel = ctx.resource_name || chain[chain.length - 1].label;

  // ------------------------------------------------------- blast radius fan
  // Siblings the same grant reaches. Enrichment only — absent when /api/graph
  // is not deployed, and the picture is complete without it.
  const reaches = graph?.blast_radius?.reaches ?? [];
  const siblings = reaches
    .filter((r) => r.id !== focusId && r.name !== focusLabel)
    .slice(0, MAX_SIBLINGS);
  const fanned = siblings.length > 0 && chain.length >= 2;

  const spine = fanned ? chain.slice(0, -1) : chain;
  const spineHops = fanned ? hops.slice(0, -1) : hops;

  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  spine.forEach((node, i) => {
    nodes.push({
      id: node.id,
      kind: node.kind,
      label: node.label,
      meta: node.meta,
      sensitivity:
        node.sensitivity ??
        (node.kind === "resource" && !fanned ? ctx.resource_sensitivity : null),
      focus: !fanned && i === spine.length - 1,
      x: SPINE_CX - NODE_W / 2,
      y: TOP + i * ROW_GAP,
      w: NODE_W,
      h: NODE_H,
    });
  });

  spineHops.forEach((hop, i) => {
    const y1 = TOP + i * ROW_GAP + NODE_H;
    const y2 = TOP + (i + 1) * ROW_GAP;
    edges.push({
      id: `hop-${i}`,
      kind: hop.kind,
      shape: "ortho",
      points: [
        [SPINE_CX, y1],
        [SPINE_CX, y2],
      ],
      caption: hop.caption,
      notes: hop.notes,
      broken: hop.kind === "absent",
      label: {
        left: SPINE_CX + 26,
        top: y1 + 6,
        width: 320,
        center: false,
      },
    });
  });

  // ------------------------------------------------------------- the fan row
  const fanY = TOP + spine.length * ROW_GAP;
  let fanRight = SPINE_CX + NODE_W / 2;

  if (fanned) {
    const row = [
      { id: focusId, name: focusLabel, sensitivity: ctx.resource_sensitivity, focus: true },
      ...siblings.map((s) => ({
        id: s.id,
        name: s.name,
        sensitivity: s.sensitivity,
        focus: false,
      })),
    ];

    const parentBottom = TOP + (spine.length - 1) * ROW_GAP + NODE_H;

    row.forEach((r, i) => {
      const x = FAN_LEFT + i * (FAN_W + FAN_GAP);
      nodes.push({
        id: r.id,
        kind: "resource",
        label: r.name,
        meta: null,
        sensitivity: r.sensitivity,
        focus: r.focus,
        x,
        y: fanY,
        w: FAN_W,
        h: NODE_H,
      });
      fanRight = Math.max(fanRight, x + FAN_W);

      edges.push({
        id: `fan-${i}`,
        kind: "contains",
        shape: "curve",
        points: [
          [SPINE_CX, parentBottom],
          [x + FAN_W / 2, fanY],
        ],
        caption: null,
        notes: [],
        broken: false,
        label: null,
      });
    });
  }

  const focusNode = nodes.find((n) => n.focus) ?? nodes[nodes.length - 1];
  const contentBottom = (fanned ? fanY : TOP + (spine.length - 1) * ROW_GAP) + NODE_H;

  // -------------------------------------------------------- the project node
  //
  // THE POINT OF THE WHOLE SCREEN. `is_project_member === false` draws an edge
  // that is not there: the permission path exists, the purpose path does not.
  // A horizontal chain can only render the relationships that exist.
  let width = 960;
  let height = contentBottom + 44;

  if (ctx.project_name) {
    const projY = TOP + identityIndex * ROW_GAP;
    const projectExtra = graph?.nodes?.find((n) => n.kind === "project");
    nodes.push({
      id: "__project",
      kind: "project",
      label: `Project ${ctx.project_name}`,
      meta:
        projectExtra?.sublabel ??
        (ctx.is_project_member
          ? `${ctx.identity_name} is a member`
          : `${ctx.identity_name} is not a member`),
      sensitivity: null,
      focus: false,
      state: ctx.is_project_member ? "member" : "not-member",
      x: PROJECT_CX - PROJECT_W / 2,
      y: projY,
      w: PROJECT_W,
      h: NODE_H,
    });

    const identityNode = nodes[identityIndex];
    const y = projY + NODE_H / 2;
    const x1 = identityNode.x + identityNode.w;
    const x2 = PROJECT_CX - PROJECT_W / 2;

    const membershipNotes = ctx.is_project_member
      ? []
      : ["the permission reaches it; the purpose does not"];

    edges.push({
      id: "membership",
      kind: ctx.is_project_member ? "member" : "absent",
      shape: "ortho",
      points: [
        [x1, y],
        [x2, y],
      ],
      caption: ctx.is_project_member ? "member of" : "not a member",
      notes: membershipNotes,
      broken: !ctx.is_project_member,
      label: {
        left: (x1 + x2) / 2 - 120,
        // Sits just above the line whether or not it carries a second line.
        top: y - 20 - (membershipNotes.length + 1) * 14,
        width: 240,
        center: true,
      },
    });

    // "owns" routed around the outside, so it never crosses the spine or fan.
    const lane = contentBottom + 34;
    const ownsX = Math.max(PROJECT_CX, fanRight + 36);
    const points: Array<[number, number]> = [
      [PROJECT_CX, projY + NODE_H],
      ...(ownsX === PROJECT_CX
        ? []
        : ([
            [PROJECT_CX, projY + NODE_H + 26],
            [ownsX, projY + NODE_H + 26],
          ] as Array<[number, number]>)),
      [ownsX, lane],
      [focusNode.x + focusNode.w / 2, lane],
      [focusNode.x + focusNode.w / 2, focusNode.y + focusNode.h],
    ];

    edges.push({
      id: "owns",
      kind: "owns",
      shape: "ortho",
      points,
      caption: "owns",
      notes: [],
      broken: false,
      label: {
        left: ownsX + 12,
        top: projY + NODE_H + (ownsX === PROJECT_CX ? 14 : 40),
        width: 96,
        center: false,
      },
    });

    width = Math.max(width, ownsX + 40, fanRight + 24);
    height = lane + 40;
  }

  return { width, height, nodes, edges };
}

// ------------------------------------------------------------------ path

/** Orthogonal polyline with rounded corners. */
export function orthoPath(points: Array<[number, number]>, r = 14): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];

    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const radius = Math.min(r, inLen / 2, outLen / 2);

    const iux = inLen === 0 ? 0 : (cx - px) / inLen;
    const iuy = inLen === 0 ? 0 : (cy - py) / inLen;
    const oux = outLen === 0 ? 0 : (nx - cx) / outLen;
    const ouy = outLen === 0 ? 0 : (ny - cy) / outLen;

    d += ` L ${cx - iux * radius} ${cy - iuy * radius}`;
    d += ` Q ${cx} ${cy} ${cx + oux * radius} ${cy + ouy * radius}`;
  }

  const end = points[points.length - 1];
  return `${d} L ${end[0]} ${end[1]}`;
}

/** Fan edges bow outward so three siblings don't read as one thick line. */
export function curvePath(points: Array<[number, number]>): string {
  const [[x1, y1], [x2, y2]] = points;
  const dy = Math.max(34, Math.abs(y2 - y1) * 0.55);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`;
}
