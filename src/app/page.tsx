"use client";

import { useState } from "react";

import { ApprovalInbox } from "@/components/approval-inbox";
import { DecisionCard } from "@/components/decision-card";
import { RequestPanel } from "@/components/request-panel";
import { cn } from "@/lib/utils";
import type { AccessDecision, AccessRequest } from "@/lib/types";

const TABS = ["Dashboard", "Employees", "Attack"] as const;

type Tab = (typeof TABS)[number];

export default function Home() {
  const [active, setActive] = useState<Tab>("Dashboard");

  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  /**
   * The route is built in parallel and may not exist yet, may 500, or may
   * return HTML on an error page — every one of those has to land as a legible
   * card rather than an unhandled rejection on stage.
   */
  async function submit(request: AccessRequest, label: string) {
    setPending(true);
    setError(null);
    setActiveKey(label);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const body = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* not JSON — handled below */
      }

      if (!res.ok) {
        const message =
          parsed &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof (parsed as { error: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : `${res.status} ${res.statusText}`;
        setError(message);
        setDecision(null);
        return;
      }

      if (!parsed || typeof parsed !== "object" || !("decision" in parsed)) {
        setError("Response was not an AccessDecision");
        setDecision(null);
        return;
      }

      setDecision(parsed as AccessDecision);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setDecision(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r p-4">
        <div className="px-3 pb-4 text-sm font-semibold tracking-tight">
          Cordyceps
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={cn(
                "rounded-md px-3 py-2 text-left text-sm transition-colors",
                active === tab
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-baseline gap-3 border-b px-6 py-3">
          <h1 className="text-lg font-semibold tracking-tight">{active}</h1>
          {active === "Dashboard" && (
            <p className="text-xs text-muted-foreground">
              Not whether you <em>can</em> access this — whether you{" "}
              <em>should</em>, right now.
            </p>
          )}
        </header>

        {active === "Dashboard" ? (
          /* Three panes, all visible at once: what was asked, what was decided,
             and whose desk it landed on. The approver's pane is not a separate
             screen because "suspend, don't deny" only reads as a design rather
             than an excuse when you can see the named human waiting. */
          <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr_19rem] gap-4 p-4">
            <RequestPanel
              onSubmit={submit}
              pending={pending}
              activeKey={activeKey}
              className="overflow-y-auto"
            />
            <DecisionCard
              decision={decision}
              pending={pending}
              error={error}
              className="min-w-0"
            />
            <ApprovalInbox className="min-w-0" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Coming soon</p>
          </div>
        )}
      </main>
    </div>
  );
}
