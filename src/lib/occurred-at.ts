/**
 * The one place `occurred_at` is constructed.
 *
 * It lives in its own module because it was duplicated once and the two copies
 * disagreed. `scripts/verify-demo.ts` built its timestamps with
 * `Date.toISOString()`, which normalises to UTC — so under British Summer Time
 * the acceptance script sent `09:15Z` where the UI sent `10:15+01:00`. The
 * engine reads the hour out of the string's own offset (see `localMinutes` in
 * src/lib/engine/context.ts), so the script was evaluating Alice's access an
 * hour earlier than the demo does, landing it outside her 10:04 baseline start.
 *
 * That produced a defect we spent time misattributing: the model was reported as
 * "editorialising" when it called Scenario A out-of-hours. It was not. It was
 * faithfully describing the 09:15 the script had given it. The acceptance script
 * was the thing that was wrong, and because it was the thing we checked
 * correctness *with*, it took a while to suspect.
 *
 * So: one function, imported by both. A verifier that does not exercise the same
 * input as the demo is not a verifier.
 */

/**
 * `hhmm` as a *local* time on `base`'s date, serialised with an explicit
 * numeric offset — never `Z`, never normalised.
 *
 * AGENTS.md rule 1: request time is explicit and the wall clock never enters
 * scoring. We demo at ~16:35 while replaying a 23:40 event, so a timestamp that
 * silently shifts is a signal that silently disappears.
 */
export function occurredAt(hhmm: string, base: Date = new Date()): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h ?? 0, m ?? 0, 0, 0);

  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";

  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}
