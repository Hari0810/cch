"""
Cordyceps behavioural baselining — Modal app.

Computes one `behaviour_profile` per employee from seeded `access_event`
history. Runs at SEED TIME only (invoked from POST /api/reset after seeding),
never in the request path: a cold start inside a live access decision is the
single most likely way the demo dies. See docs/plan.md ground rule 3.

What it buys: scenario C's "Alice does not normally access finance resources"
and "first-ever Nova access" become computed facts derived from history rather
than seeded strings.

Data transfer: the caller POSTs the events. This function holds NO credentials
and never talks to Supabase — no Modal secret to create, nothing to leak, and
the TypeScript fallback in src/lib/baseline.ts can be byte-for-byte identical
because both sides consume the same payload.

Image is deliberately light: numpy + fastapi. No models, no downloads.
"""

from __future__ import annotations

import modal

image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "numpy==2.2.1",
    "fastapi[standard]==0.115.6",
)

app = modal.App("cordyceps-baseline", image=image)

# Bucket keys for rows whose resource carries no project / no category.
NO_PROJECT = "company-wide"
NO_CATEGORY = "uncategorised"

# Rolling window for the files-per-hour velocity percentile.
WINDOW_SECONDS = 3600


def _parse_iso(ts: str) -> float:
    """ISO 8601 -> POSIX seconds. Tolerates a trailing Z."""
    from datetime import datetime, timezone

    s = ts.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _percentile(values: list[float], q: float) -> float:
    """numpy linear-interpolation percentile. q in [0, 100]."""
    if not values:
        return 0.0
    try:
        import numpy as np
    except ImportError:
        # Only hit by the local smoke test; identical linear interpolation.
        s = sorted(values)
        pos = (len(s) - 1) * (q / 100.0)
        lo = int(pos)
        hi = min(lo + 1, len(s) - 1)
        return s[lo] + (s[hi] - s[lo]) * (pos - lo)
    return float(np.percentile(np.asarray(values, dtype=float), q))


def _fmt_time(hours: float) -> str:
    """Fractional local hour -> 'HH:MM:SS' for a postgres `time` column."""
    total = int(round(hours * 3600))
    total = max(0, min(total, 24 * 3600 - 1))
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _fractions(counts: dict[str, int], total: int) -> dict[str, float]:
    if total <= 0:
        return {}
    return {
        k: round(v / total, 4)
        for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    }


def compute_profiles(payload: dict) -> list[dict]:
    """
    payload = {
      events:   [{identity_id, resource_id, action, occurred_at}],
      resources:[{id, project_id, category}],
      employees:["alice", ...]         # or [{id: "alice"}, ...]
      projects: ["atlas", "nova", ...] # or [{id: "atlas"}, ...]
      tz_offset_minutes: 60            # frame the hour-of-day is measured in
      computed_at: "2026-08-01T..."    # optional; caller's clock wins
    }
    Returns one BehaviourProfile dict per employee.
    """
    from datetime import datetime, timezone

    def ids(rows) -> list[str]:
        out = []
        for r in rows or []:
            out.append(r if isinstance(r, str) else str(r.get("id")))
        return out

    events = payload.get("events") or []
    resources = {r["id"]: r for r in (payload.get("resources") or [])}
    employee_ids = ids(payload.get("employees"))
    project_ids = ids(payload.get("projects"))
    tz_offset = float(payload.get("tz_offset_minutes") or 0) * 60.0
    computed_at = payload.get("computed_at") or datetime.now(
        timezone.utc
    ).isoformat()

    by_identity: dict[str, list[dict]] = {e: [] for e in employee_ids}
    for ev in events:
        by_identity.setdefault(ev["identity_id"], []).append(ev)

    profiles: list[dict] = []
    for employee_id in by_identity:
        rows = sorted(
            by_identity[employee_id], key=lambda e: _parse_iso(e["occurred_at"])
        )

        if not rows:
            profiles.append(
                {
                    "employee_id": employee_id,
                    "typical_start": None,
                    "typical_end": None,
                    "project_mix": {},
                    "category_mix": {},
                    "files_per_hour_p95": 0,
                    "download_ratio": 0,
                    "projects_never_touched": sorted(project_ids),
                    "computed_at": computed_at,
                    "computed_by": "modal",
                }
            )
            continue

        hours: list[float] = []
        stamps: list[float] = []
        project_counts: dict[str, int] = {}
        category_counts: dict[str, int] = {}
        touched_projects: set[str] = set()
        downloads = 0

        for ev in rows:
            t = _parse_iso(ev["occurred_at"])
            stamps.append(t)
            # Hour-of-day in the caller's local frame, matching the frame the
            # seed wrote its work-hours in.
            local = (t + tz_offset) % 86400.0
            hours.append(local / 3600.0)

            res = resources.get(ev["resource_id"], {})
            project = res.get("project_id") or NO_PROJECT
            category = res.get("category") or NO_CATEGORY
            project_counts[project] = project_counts.get(project, 0) + 1
            category_counts[category] = category_counts.get(category, 0) + 1
            if res.get("project_id"):
                touched_projects.add(res["project_id"])
            if ev.get("action") == "download":
                downloads += 1

        # Distinct resources touched in each forward-rolling one-hour window.
        window_counts: list[float] = []
        for i, start in enumerate(stamps):
            seen = set()
            for j in range(i, len(stamps)):
                if stamps[j] - start >= WINDOW_SECONDS:
                    break
                seen.add(rows[j]["resource_id"])
            window_counts.append(float(len(seen)))

        n = len(rows)
        profiles.append(
            {
                "employee_id": employee_id,
                "typical_start": _fmt_time(_percentile(hours, 10)),
                "typical_end": _fmt_time(_percentile(hours, 90)),
                "project_mix": _fractions(project_counts, n),
                "category_mix": _fractions(category_counts, n),
                "files_per_hour_p95": round(_percentile(window_counts, 95), 2),
                "download_ratio": round(downloads / n, 4),
                "projects_never_touched": sorted(
                    p for p in project_ids if p not in touched_projects
                ),
                "computed_at": computed_at,
                "computed_by": "modal",
            }
        )

    profiles.sort(key=lambda p: p["employee_id"])
    return profiles


@app.function(image=image, timeout=120)
@modal.fastapi_endpoint(method="POST", docs=False)
def baselines(payload: dict) -> dict:
    """POST the seeded history, get one behaviour profile per employee back."""
    profiles = compute_profiles(payload)
    return {"profiles": profiles, "count": len(profiles), "computed_by": "modal"}


@app.local_entrypoint()
def main(path: str = ""):
    """`modal run modal/baseline.py --path payload.json` — smoke test."""
    import json
    import sys

    raw = open(path).read() if path else sys.stdin.read()
    print(json.dumps(compute_profiles(json.loads(raw)), indent=2))
