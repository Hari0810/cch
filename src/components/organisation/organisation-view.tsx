"use client";

/**
 * Organisation — the system of record Cordyceps reasons over.
 *
 * The claim this screen has to survive is "is that a real dataset or three
 * if-statements?". So it is deliberately built as an *inspection* surface and
 * not as a dashboard: rows, ids, timestamps and provenance, in the shape the
 * database holds them.
 *
 * **It displays; it never decides.** No risk scores, no verdicts, no
 * "suspicious", nothing that implies this screen evaluated anything. The one
 * place colour is loud is a null `last_reviewed_at`, and the label says exactly
 * that — a missing review row, not an opinion. Same discipline as
 * docs/attack-graph.md §5.
 *
 * There is no company mission statement in the schema, so none is shown.
 */

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  Field,
  ReviewCell,
  RowId,
  SectionHeader,
  SensitivityBadge,
  formatDate,
  formatTime,
} from "./primitives";
import type { OrgSnapshot } from "./types";

// ---------------------------------------------------------------------- shell

export function OrganisationView({ className }: { className?: string }) {
  const [org, setOrg] = useState<OrgSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    // One fetch, one payload. This is a reference screen, not a live one.
    (async () => {
      try {
        const res = await fetch("/api/org");
        const body = await res.text();

        let parsed: unknown = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          /* an HTML error page — handled below */
        }

        if (!live) return;

        if (!res.ok) {
          const message =
            parsed &&
            typeof parsed === "object" &&
            "error" in parsed &&
            typeof (parsed as { error: unknown }).error === "string"
              ? (parsed as { error: string }).error
              : `${res.status} ${res.statusText}`;
          setError(message);
          return;
        }

        if (!parsed || typeof parsed !== "object" || !("counts" in parsed)) {
          setError("Response was not an organisation snapshot");
          return;
        }

        setOrg(parsed as OrgSnapshot);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Network error");
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col p-4", className)}>
        <Card className="border-destructive/40">
          <CardContent className="space-y-1 py-6">
            <p className="text-sm font-medium text-destructive">
              Could not read the organisation
            </p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="pt-2 text-xs text-muted-foreground">
              This surface is a reference view. Nothing in the decision path
              depends on it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!org) {
    return (
      <div className={cn("flex min-h-0 flex-1 flex-col gap-4 p-4", className)}>
        <Skeleton className="h-9 w-full max-w-2xl" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading the organisation</span>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <Tabs
        defaultValue="software"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 space-y-3 border-b px-4 pt-4 pb-3">
          <p className="text-xs text-muted-foreground">
            Read-only view of the rows Cordyceps joins against. Nothing here is
            evaluated, scored or ranked.
          </p>
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="software" className={TRIGGER}>
              Third-party software
              <Count n={org.counts.oauth_apps} />
            </TabsTrigger>
            <TabsTrigger value="projects" className={TRIGGER}>
              Projects
              <Count n={org.counts.projects} />
            </TabsTrigger>
            <TabsTrigger value="people" className={TRIGGER}>
              People
              <Count n={org.counts.people} />
            </TabsTrigger>
            <TabsTrigger value="groups" className={TRIGGER}>
              Groups &amp; grants
              <Count n={org.counts.grants} />
            </TabsTrigger>
            <TabsTrigger value="resources" className={TRIGGER}>
              Resources
              <Count n={org.counts.resources} />
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="software" className="mt-0">
            <SoftwareSection org={org} />
          </TabsContent>
          <TabsContent value="projects" className="mt-0">
            <ProjectsSection org={org} />
          </TabsContent>
          <TabsContent value="people" className="mt-0">
            <PeopleSection org={org} />
          </TabsContent>
          <TabsContent value="groups" className="mt-0">
            <GroupsSection org={org} />
          </TabsContent>
          <TabsContent value="resources" className="mt-0">
            <ResourcesSection org={org} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * The shared TabsTrigger drives its underline off a `data-active` attribute
 * Radix does not emit here, so the indicator can stick to whichever tab
 * rendered first. Pinned to `data-state` locally rather than edited in
 * components/ui/tabs.tsx, which the attack graph and the request panel share.
 */
const TRIGGER =
  "after:transition-none data-[state=active]:after:opacity-100! data-[state=inactive]:after:opacity-0!";

function Count({ n }: { n: number }) {
  return (
    <span className="ml-1.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
      {n}
    </span>
  );
}

// ------------------------------------------- 1. authorised third-party software

function SoftwareSection({ org }: { org: OrgSnapshot }) {
  const unreviewed = org.oauth_apps.filter(
    (a) => a.last_reviewed_at === null,
  ).length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Authorised third-party software"
        note="Non-human identities that hold an OAuth grant against a person's access. Rows from employee where identity_type = 'oauth_app'."
      />

      {org.oauth_apps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unreviewed} of {org.oauth_apps.length}{" "}
          {org.oauth_apps.length === 1 ? "grant has" : "grants have"} no access
          review on record.
        </p>
      )}

      {org.oauth_apps.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No third-party applications are connected.
        </p>
      )}

      {org.oauth_apps.map((app) => {
        const neverReviewed = app.last_reviewed_at === null;
        return (
          <Card
            key={app.id}
            className={cn(
              "gap-0 overflow-hidden py-0",
              neverReviewed && "border-alert/40",
            )}
          >
            <CardHeader className="gap-1 border-b px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-semibold tracking-tight">
                  {app.name}
                </span>
                <Badge variant="outline" className="text-muted-foreground">
                  oauth_app
                </Badge>
                <RowId id={app.id} />
              </div>
              <p className="text-xs text-muted-foreground">{app.role}</p>
            </CardHeader>

            <CardContent className="space-y-4 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Acts for">
                  {app.acts_for ? (
                    <span>
                      {app.acts_for.name}
                      <span className="text-muted-foreground">
                        {" "}
                        — requests carry this person&apos;s access
                      </span>
                    </span>
                  ) : null}
                </Field>
                <Field label="Scope">
                  {app.scope ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {app.scope}
                    </code>
                  ) : null}
                </Field>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Connected">{formatDate(app.connected_at)}</Field>
                <Field label="Last used">{formatDate(app.last_used_at)}</Field>
                <Field label="Last reviewed">
                  <ReviewCell value={app.last_reviewed_at} />
                </Field>
              </div>

              {neverReviewed && (
                <div className="rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert">
                  <span className="font-semibold">last_reviewed_at is null</span>{" "}
                  — no access review has ever been recorded for this grant. It
                  has held {app.scope ?? "its scope"} since{" "}
                  {formatDate(app.connected_at) ?? "it was connected"}.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------- 2. projects

function ProjectsSection({ org }: { org: OrgSnapshot }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Projects"
        note="Rows from project, with members from project_membership. Project membership is what the engine joins a request against — it is separate from permission."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {org.projects.map((p) => (
          <Card key={p.id} className="gap-0 overflow-hidden py-0">
            <CardHeader className="gap-2 border-b px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-semibold tracking-tight">
                  {p.name}
                </span>
                <Badge variant="outline" className="capitalize">
                  {p.status}
                </Badge>
                <SensitivityBadge value={p.sensitivity} />
                <RowId id={p.id} />
              </div>
              {p.purpose && (
                <p className="text-xs text-muted-foreground">{p.purpose}</p>
              )}
            </CardHeader>

            <CardContent className="space-y-4 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Owner">{p.owner?.name}</Field>
                <Field label="Started">{formatDate(p.started_at)}</Field>
                <Field label="Ends">{formatDate(p.ended_at) ?? "Open"}</Field>
              </div>

              <div className="space-y-2">
                <div className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
                  Members ({p.member_count})
                </div>
                <ul className="space-y-1">
                  {p.members.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="truncate">{m.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {m.role_on_project ?? "—"}
                      </span>
                    </li>
                  ))}
                  {p.members.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No members.
                    </li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- 3. people

function PeopleSection({ org }: { org: OrgSnapshot }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="People"
        note="Rows from employee, with project_membership and group_membership resolved. Directory facts only — no metrics and no ranking."
      />

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Working hours</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Groups</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.people.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="align-top font-medium whitespace-nowrap">
                  <div>{person.name}</div>
                  <RowId id={person.id} />
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  {person.role}
                  {person.identity_type !== "human" && (
                    <Badge
                      variant="outline"
                      className="ml-2 font-mono text-[0.625rem]"
                    >
                      {person.identity_type}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  {person.department ?? "—"}
                </TableCell>
                <TableCell className="align-top text-muted-foreground">
                  {person.manager?.name ?? "—"}
                </TableCell>
                <TableCell className="align-top font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {person.work_hours_start && person.work_hours_end
                    ? `${formatTime(person.work_hours_start)}–${formatTime(person.work_hours_end)}`
                    : "—"}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1">
                    {person.projects.map((p) => (
                      <Badge
                        key={p.id}
                        variant="outline"
                        title={p.role_on_project ?? undefined}
                      >
                        {p.name}
                        {p.role_on_project && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {p.role_on_project}
                          </span>
                        )}
                      </Badge>
                    ))}
                    {person.projects.length === 0 && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1">
                    {person.groups.map((g) => (
                      <Badge key={g.id} variant="secondary">
                        {g.name}
                      </Badge>
                    ))}
                    {person.groups.length === 0 && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ------------------------------------------------------ 4. groups and grants

function GroupsSection({ org }: { org: OrgSnapshot }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Groups and what they grant"
        note="Rows from user_group, group_membership and permission. Membership of a group and membership of a project are different tables — that is why a grant can outlive the work it was issued for."
      />

      {org.groups.map((group) => (
        <Card key={group.id} className="gap-0 overflow-hidden py-0">
          <CardHeader className="gap-2 border-b px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-base font-semibold tracking-tight">
                {group.name}
              </span>
              <RowId id={group.id} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">
                Members:
              </span>
              {group.members.map((m) => (
                <Badge key={m.id} variant="secondary">
                  {m.name}
                </Badge>
              ))}
              {group.members.length === 0 && (
                <span className="text-xs text-muted-foreground">none</span>
              )}
            </div>
          </CardHeader>

          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Granted for</TableHead>
                  <TableHead>Last reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.grants.map((grant) => {
                  const neverReviewed = grant.last_reviewed_at === null;
                  const outside = grant.members_outside_resource_project;
                  return (
                    <TableRow
                      key={grant.id}
                      className={cn(
                        neverReviewed && "bg-alert/10 hover:bg-alert/15",
                      )}
                    >
                      <TableCell
                        className={cn(
                          "align-top",
                          neverReviewed && "border-l-2 border-l-alert",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {grant.resource.name}
                          </span>
                          <SensitivityBadge value={grant.resource.sensitivity} />
                          <Badge
                            variant="outline"
                            className="font-mono text-[0.625rem] text-muted-foreground"
                          >
                            {grant.resource.type}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {grant.resource_project
                            ? `Belongs to project ${grant.resource_project.name}`
                            : "Company-wide — no project"}
                        </div>
                        {outside.length > 0 && grant.resource_project && (
                          <div
                            className="mt-1.5 text-xs"
                            title="group_membership minus project_membership"
                          >
                            <span className="text-muted-foreground">
                              In this group, not in{" "}
                              {grant.resource_project.name}:
                            </span>{" "}
                            <span className="font-medium">
                              {outside.map((m) => m.name).join(", ")}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top font-mono text-xs">
                        {grant.action}
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(grant.granted_at) ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[16rem] align-top text-sm text-muted-foreground">
                        {grant.granted_reason ?? "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <ReviewCell value={grant.last_reviewed_at} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {group.grants.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-sm text-muted-foreground"
                    >
                      This group holds no permissions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- 5. resources

function ResourcesSection({ org }: { org: OrgSnapshot }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Resources"
        note="Rows from resource. parent_id is what makes a grant on a folder resolve down to the files inside it."
      />

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Inside</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {org.resources.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div>{r.name}</div>
                  <RowId id={r.id} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.type}
                </TableCell>
                <TableCell>
                  <SensitivityBadge value={r.sensitivity} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.project?.name ?? "Company-wide"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.parent?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.owner?.name ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
