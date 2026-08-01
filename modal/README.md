# Modal — behavioural baselining

`baseline.py` computes one `behaviour_profile` per employee from seeded
`access_event` history. Runs at seed time only, never in the request path.

**Auth** (browser flow, one-off): `.venv/bin/modal token new` — writes
`~/.modal.toml`.

**Deploy**: `.venv/bin/modal deploy modal/baseline.py` → prints the web URL of
the `baselines` endpoint.

**Env vars**: put that URL in `.env.local` as `MODAL_SCORING_ENDPOINT`. That is
the only variable this needs. The function holds **no** credentials — the app
POSTs the events, so there is no Modal secret and no service-role key here.
If `MODAL_SCORING_ENDPOINT` is empty or the call fails, `src/lib/baseline.ts`
falls back to an identical local computation and logs which path it took.

**Smoke test without deploying**: `.venv/bin/modal run modal/baseline.py --path payload.json`
(or pipe the payload on stdin) prints the profiles.
