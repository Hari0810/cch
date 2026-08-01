"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = ["Dashboard", "Employees", "Attack"] as const;

type Tab = (typeof TABS)[number];

export default function Home() {
  const [active, setActive] = useState<Tab>("Dashboard");

  return (
    <div className="flex flex-1">
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

      <main className="flex flex-1 flex-col">
        <header className="border-b px-8 py-5">
          <h1 className="text-lg font-semibold tracking-tight">{active}</h1>
        </header>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">Coming soon</p>
        </div>
      </main>
    </div>
  );
}
