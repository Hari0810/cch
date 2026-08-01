"use client";

import { useState } from "react";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AccessRequest, Action } from "@/lib/types";

/**
 * IDs must match the seed (supabase/seed.sql, docs/demo-scenario.md §1/§4).
 * They live in one place so a rename in the seed is a one-line fix here.
 */
export const IDENTITIES = [
  { id: "alice", name: "Alice Morgan", detail: "Senior Engineer" },
  { id: "ben", name: "Ben Carter", detail: "Engineer" },
  { id: "chloe", name: "Chloe Singh", detail: "Product Manager" },
  { id: "daniel", name: "Daniel Kim", detail: "Finance Analyst" },
  { id: "eva", name: "Eva Patel", detail: "Strategy Lead" },
  { id: "farah", name: "Farah Ahmed", detail: "Legal Counsel" },
  { id: "george", name: "George Wilson", detail: "Engineer" },
  { id: "hannah", name: "Hannah Li", detail: "Data Scientist" },
  { id: "isaac", name: "Isaac Brown", detail: "Product Manager" },
  { id: "julia", name: "Julia Evans", detail: "Engineering Director" },
  {
    id: "provenance-ai",
    name: "Provenance AI",
    detail: "OAuth app · delegating Alice",
  },
] as const;

export const RESOURCES = [
  { id: "res-customer-export-schema", name: "Customer Export Schema" },
  { id: "res-acquisition-valuation-xlsx", name: "Acquisition Valuation.xlsx" },
  { id: "res-target-company-contracts", name: "Target Company Contracts" },
  { id: "res-board-valuation-deck", name: "Board Valuation Deck" },
  { id: "res-beacon-architecture-doc", name: "Beacon Architecture Doc" },
  { id: "res-beacon-incident-dashboard", name: "Beacon Incident Dashboard" },
  { id: "res-atlas-production-dashboard", name: "Atlas Production Dashboard" },
  { id: "res-customers-table", name: "customers table" },
  { id: "res-atlas-export-service-key", name: "Atlas Export Service Key" },
  { id: "res-atlas-folder", name: "atlas/" },
  { id: "res-finance-folder", name: "finance/" },
  { id: "res-engineering-handbook", name: "Shared Engineering Handbook" },
] as const;

const ACTIONS: Action[] = ["view", "download", "edit", "delete"];

/**
 * Re-exported so existing importers keep working. The implementation moved to
 * src/lib/occurred-at.ts so `scripts/verify-demo.ts` can share it — it had its
 * own copy that normalised to UTC, and the two disagreed by an hour. Read the
 * comment there before changing anything about timestamps.
 */
import { occurredAt } from "@/lib/occurred-at";
export { occurredAt };

type Scenario = {
  key: "A" | "N" | "C";
  identityId: string;
  identity: string;
  /** Second identity line — kept present on every button so the rows align. */
  identitySub: string | null;
  resourceId: string;
  resource: string;
  time: string;
  action: Action;
};

/** docs/demo-scenario.md §8. Run order A -> N -> C. */
export const SCENARIOS: Scenario[] = [
  {
    key: "A",
    identityId: "alice",
    identity: "Alice Morgan",
    identitySub: null,
    resourceId: "res-customer-export-schema",
    resource: "Customer Export Schema",
    time: "10:15",
    action: "view",
  },
  {
    key: "N",
    identityId: "daniel",
    identity: "Daniel Kim",
    identitySub: null,
    resourceId: "res-acquisition-valuation-xlsx",
    resource: "Acquisition Valuation.xlsx",
    time: "23:20",
    action: "download",
  },
  {
    key: "C",
    identityId: "provenance-ai",
    identity: "Provenance AI",
    identitySub: "delegating Alice Morgan",
    resourceId: "res-acquisition-valuation-xlsx",
    resource: "Acquisition Valuation.xlsx",
    time: "23:40",
    action: "download",
  },
];

export function RequestPanel({
  onSubmit,
  pending,
  activeKey,
  className,
}: {
  onSubmit: (request: AccessRequest, label: string) => void;
  pending: boolean;
  activeKey: string | null;
  className?: string;
}) {
  const [identityId, setIdentityId] = useState<string>("alice");
  const [resourceId, setResourceId] = useState<string>(
    "res-acquisition-valuation-xlsx",
  );
  const [action, setAction] = useState<Action>("view");
  const [time, setTime] = useState("23:40");

  const fire = (s: Scenario) =>
    onSubmit(
      {
        identity_id: s.identityId,
        resource_id: s.resourceId,
        action: s.action,
        occurred_at: occurredAt(s.time),
      },
      s.key,
    );

  const fireCustom = () =>
    onSubmit(
      {
        identity_id: identityId,
        resource_id: resourceId,
        action,
        occurred_at: occurredAt(time),
      },
      "custom",
    );

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-xl border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="flex items-baseline justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold tracking-tight">Request</h2>
        <span className="text-xs text-muted-foreground">
          identity · resource · time
        </span>
      </header>

      <div className="flex flex-col gap-2 px-4">
        {SCENARIOS.map((s, i) => (
          <div key={s.key} className="relative">
            {/* N and C sit adjacent and differ only in who is asking. */}
            {i === 1 && (
              <div className="absolute -left-4 top-1 bottom-0 w-0.5 rounded-full bg-border" />
            )}
            {i === 2 && (
              <div className="absolute -left-4 -top-2 bottom-1 w-0.5 rounded-full bg-border" />
            )}
            <button
              type="button"
              onClick={() => fire(s)}
              disabled={pending}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                "hover:bg-accent disabled:pointer-events-none disabled:opacity-60",
                activeKey === s.key
                  ? "border-primary/40 bg-accent"
                  : "border-border bg-background",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {s.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {s.identity}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {s.time}
                  </span>
                </span>
                <span className="mt-0.5 flex items-baseline gap-1.5 text-xs text-muted-foreground">
                  {s.identitySub && (
                    <span className="truncate italic">{s.identitySub} ·</span>
                  )}
                  <span className="truncate">{s.resource}</span>
                </span>
              </span>
              {pending && activeKey === s.key ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          </div>
        ))}
        <p className="pl-1 text-[11px] leading-tight text-muted-foreground">
          <span className="font-medium text-foreground">N and C</span>: same
          file, same hour. Only the asker changes.
        </p>
      </div>

      <Separator className="my-4" />

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        <h3 className="text-xs font-semibold tracking-tight text-muted-foreground">
          Build your own
        </h3>

        <div className="grid gap-1">
          <Label htmlFor="identity" className="text-xs">
            Identity
          </Label>
          <Select value={identityId} onValueChange={setIdentityId}>
            <SelectTrigger id="identity" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDENTITIES.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="resource" className="text-xs">
            Resource
          </Label>
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger id="resource" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOURCES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="action" className="text-xs">
              Action
            </Label>
            <Select
              value={action}
              onValueChange={(v) => setAction(v as Action)}
            >
              <SelectTrigger id="action" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="time" className="text-xs">
              Time
            </Label>
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-7 py-1 text-sm"
            />
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={fireCustom}
          disabled={pending}
          className="mt-1 w-full"
        >
          {pending && activeKey === "custom" && (
            <LoaderCircle className="animate-spin" />
          )}
          Evaluate request
        </Button>
      </div>
    </section>
  );
}
