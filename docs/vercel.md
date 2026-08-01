# The Vercel April 2026 incident

> Source material for the OAuth angle in [brief-extended.md §6](brief-extended.md).
> This is the real event the seeded **Provenance AI** `oauth_app` node is modelled
> on — the seed is a fictional vendor, this is the precedent. Read it so the one
> line in the pitch is accurate, then **do not build a second product around it** —
> the scope discipline in §6 still holds: one node, one sentence.
>
> Primary source: [Vercel KB bulletin](https://vercel.com/kb/bulletin/vercel-april-2026-security-incident).
> Anything below marked *(reported)* comes from third-party coverage, not Vercel.

## 1. What happened

On **19 April 2026** Vercel disclosed unauthorised access to internal systems.
The disclosure followed a threat actor — claiming affiliation with ShinyHunters
*(reported)* — offering stolen Vercel data on an underground forum.

The outcome: **non-sensitive environment variables** belonging to a limited
subset of customer projects were enumerated and decrypted. "Non-sensitive" is
Vercel's own classification — it means variables stored in a form that decrypts
to plaintext, as opposed to their sensitive-env-var feature. Plenty of real
secrets live in that category by accident, which is why the remediation advice
was "rotate them" rather than "no action needed."

## 2. The attack chain

Every step was a technically valid, correctly-authorised use of a credential.

```
Lumma infostealer (Feb 2026, reported)
  → Context.ai employee credentials
    → Context.ai's Google Workspace OAuth app
      → Vercel employee's Google Workspace account
        → that employee's Vercel account
          → internal pivot
            → enumerate + decrypt non-sensitive env vars
```

| Link | What it was | Why nothing fired |
| --- | --- | --- |
| Context.ai OAuth app | A third-party AI tool a Vercel employee had connected to their Workspace | Consent was granted legitimately, months earlier |
| Workspace account takeover | Attacker operating as the employee | Token-based; MFA and password sit upstream of it, not in the path |
| Vercel account access | Google-backed login to Vercel | Valid session, valid identity |
| Env var decryption | Authorised platform capability | The employee's role permitted it |

Vercel published the malicious OAuth client ID as an IOC so other organisations
could check their own Workspace grants:

```
110671459871-30f1spbu0hptbs60cb4vsmv79i7bbvqj.apps.googleusercontent.com
```

The upstream root cause *(reported, not confirmed by Vercel)*: a February 2026
Lumma stealer infection of a Context.ai employee holding privileged access,
traced to downloading Roblox auto-farm scripts and executors — a well-known
Lumma delivery vector. The blast radius wasn't Vercel-specific; the same
compromised OAuth app reportedly reached hundreds of Context.ai users across
many organisations.

## 3. Timeline

All times PST, from the Vercel bulletin's own update log.

| When | Update |
| --- | --- |
| Apr 19, 11:04 | IOC published for community investigation |
| Apr 19, 18:01 | Attack origin disclosed; new recommendations issued |
| Apr 20, 10:59 | Clarified what "compromised credentials" covers |
| Apr 20, 17:32 | npm packages validated as uncompromised; product enhancements shipped |
| Apr 22, 19:58 | Investigation findings published |
| Apr 23, 09:54 | Findings further clarified |
| Apr 24, 16:22 | No further updates |

## 4. Response and remediation

Vercel's side:

- Engaged incident response experts and notified law enforcement; worked with
  Google Mandiant.
- Confirmed with GitHub, Microsoft, npm and Socket that **no npm packages
  published by Vercel were compromised** — worth noting, because the initial
  fear was a supply-chain propagation.
- Shipped environment-variable management improvements and stronger defaults.
- Flagged that some separately-identified compromises "do not appear to have
  originated on Vercel systems" — i.e. credential reuse, not this incident.

Customer recommendations, verbatim in substance:

- Enable MFA (authenticator app or passkey).
- Review and rotate non-sensitive environment variables immediately.
- Use the sensitive environment variable feature going forward.
- Review account activity logs and recent deployments for anomalies.
- Set Deployment Protection to Standard at minimum; rotate Deployment
  Protection tokens.

## 5. Why this matters for Cordyceps

The chain above is the Alice scenario with a machine identity substituted in.

- **Every credential was valid.** No password was guessed, no MFA was defeated
  at the point of access. An OAuth token is *designed* to bypass both — that's
  what it's for.
- **The permission was correct; the access was not.** A Vercel employee reading
  environment variables is unremarkable. A Vercel employee reading them at
  attacker-tempo, via a session originating from a third-party AI tool's OAuth
  grant, is a different event — and no control in the path was looking at that
  difference.
- **Nobody had looked at the grant since it was authorised.** This is the point
  the seeded node exists to make. Consent is granted once and evaluated never.
  Cordyceps' claim is that a grant should have to justify itself *per access*,
  not once at connect time.
- **Detection was downstream of sale.** Disclosure was prompted by data
  appearing on a forum *(reported: listed at $2M on BreachForums)*. That is the
  UEBA failure mode in its purest form — the file had already left.

### The one line for the demo

> "The same check applies to non-human identities. Vercel's April 2026 breach
> started with an OAuth token for a third-party AI tool that nobody had looked
> at since it was granted. Every credential in that chain was valid."

### Accuracy notes for the pitch

Two places where the brief's shorthand runs slightly ahead of the facts. Neither
is worth a rewrite, but don't embellish them on stage:

1. §6 says the token was used "to read customer data across multiple SaaS
   tenants." More precisely: the compromised OAuth app spanned many of
   *Context.ai's* customers; the Vercel intrusion was a single-tenant pivot
   through one employee. "A compromised third-party OAuth app with reach into
   many organisations" is the defensible phrasing.
2. The seed node is **Provenance AI** — a fictional vendor, invented for the
   demo, with an invented "Drive read-all" scope ([demo-scenario.md](demo-scenario.md)).
   That's the right call and it's already clean: the real grant was a Google
   Workspace OAuth app for Context.ai, and Vercel never published its scope
   list. Narrate Provenance AI as the seeded stand-in and Context.ai as the real
   precedent — don't let the two names merge, and don't attribute "Drive
   read-all" to Vercel.

Also worth keeping straight: the exposure was **environment variables on
Vercel's platform**, not customer source code and not npm artifacts.

## Sources

- [Vercel April 2026 security incident — Vercel Knowledge Base](https://vercel.com/kb/bulletin/vercel-april-2026-security-incident) (primary)
- [Vercel Breach Tied to Context AI Hack Exposes Limited Customer Credentials — The Hacker News](https://thehackernews.com/2026/04/vercel-breach-tied-to-context-ai-hack.html)
- [Vercel Breached via Context AI Supply Chain Attack — ox.security](https://www.ox.security/blog/vercel-context-ai-supply-chain-attack-breachforums/)
- [Vercel breached via compromised third-party AI tool — Help Net Security](https://www.helpnetsecurity.com/2026/04/20/vercel-breached/)
- [Unpacking the Vercel breach: Shadow AI and OAuth sprawl — Push Security](https://pushsecurity.com/blog/unpacking-the-vercel-breach)
- [The Vercel Breach: OAuth Supply Chain Attack — Trend Micro](https://www.trendmicro.com/en_us/research/26/d/vercel-breach-oauth-supply-chain.html)
- [vercel-april2026-incident-response playbook — GitHub](https://github.com/OpenSourceMalware/vercel-april2026-incident-response)
