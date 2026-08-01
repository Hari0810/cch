# Judging Criteria & Rubric — Cursor Cybersecurity London Hackathon

**Date:** Saturday 1 August · Halkin Offices, 1–2 Paris Garden, London
**Project:** Cordyceps — contextual authorisation agent

> **Status of this document.** §1–§3 are the **explicit** rubric: the seven criteria exactly as the organisers published them, treated as **flat and equally weighted**, because no weighting was published. §4 onward is the **implicit** layer — the unstated factors (sponsor tooling, judge backgrounds, track fit, format) that actually separate projects sitting at the same explicit score. Weights appear *only* in the implicit layer, and they are our inference, not organiser policy.

---

## 1. Explicit criteria (as published — unweighted)

Projects will be judged on:

1. Technical execution
2. Security impact
3. Product thinking
4. AI autonomy
5. UX clarity
6. Real-world applicability
7. Safety and responsible AI design

**Treat these as equally weighted.** No weighting was published, and inventing one risks optimising against a rubric the judges aren't using. Practical consequence: **a zero anywhere costs as much as a zero anywhere else.** With a flat rubric the winning move is not to spike one dimension — it is to have no weak dimension. Fix your lowest score before improving your highest.

**Format constraints that shape scoring:**

- Code freeze **15:45**, submissions + *initial judging* immediately after.
- Top 5 by score present live, **3 minutes each**, at 16:35.
- Final placings (1st–3rd) decided from the live demos at 16:55.

This is a **two-gate process**. The submission artefact alone gets you into the Top 5 — most judges will never run your code, they will read the README and skim what you submit. The 3-minute live demo decides the podium. Optimise the two gates differently:

| Gate | Decided by | What wins it |
| --- | --- | --- |
| Gate 1 — Top 5 (≈15:45–16:35) | Skimmed submission, ~2–4 min of attention per project | Legible one-liner, obvious security relevance, a screenshot/clip proving it runs, sponsor tech named |
| Gate 2 — Podium (16:35–16:55) | Live 3-min demo + Q&A | One scenario shown end-to-end, the AI visibly reasoning, human-in-the-loop moment, crisp answer to the hardest question |

---

## 2. Scoring anchors

Score each of the seven 0–5. Flat average out of 5 — no multipliers.

| Score | Meaning |
| --- | --- |
| 0 | Absent |
| 1 | Claimed in the pitch, not visible in the product |
| 2 | Present but trivial / hardcoded / demo-only |
| 3 | Working, credible, unremarkable |
| 4 | Working and *deliberate* — a design choice a judge would defend |
| 5 | Working, deliberate, and teaches the judge something they hadn't considered |

Realistic reading: **a flat 3 across all seven makes the Top 5 cut and loses the podium.** Podium projects clear 4 on every dimension and hit 5 on two or three. The gap between "Top 5" and "1st" is closed in the implicit layer (§4), not by squeezing another half-point out of the explicit one.

---

## 3. Per-criterion detail

### 3.1 Technical execution

| Score | Evidence |
| --- | --- |
| 1–2 | Slideware, or a single LLM call wrapped in a UI |
| 3 | Runs live, one integration real |
| 4 | Multi-layer architecture where each layer is justified; graph/data model is real; runs under Q&A pressure |
| 5 | Above, plus a non-obvious engineering decision explained in one sentence |

**Cordyceps hook:** the hybrid pipeline — deterministic policy checks → context retrieval → graph attack-path analysis → LLM risk assessment → decision → human approval. The single most credible line available: *"the deterministic layer enforces hard constraints, the model only handles ambiguity — we never let an LLM be the sole authority on an access decision."* That sentence scores on technical execution, AI autonomy and safety at once.

### 3.2 Security impact

| Score | Evidence |
| --- | --- |
| 1–2 | Generic "AI for security"; threat model unstated |
| 3 | Names a real threat class and plausibly addresses it |
| 4 | Threat model is explicit; shows a concrete attack it stops and one it doesn't |
| 5 | Addresses a gap existing tooling genuinely leaves open, and the judge recognises the gap from their own work |

**Cordyceps hook:** insider threat / over-permissioned access is the canonical gap RBAC leaves open. Name the adjacent categories out loud — UEBA, ABAC, JIT access, purpose-based access control — so security judges know you know the landscape, then state the differentiator: *live organisational context is the missing input*.

### 3.3 Product thinking

| Score | Evidence |
| --- | --- |
| 1–2 | Feature, not product; no user named |
| 3 | Clear user and job-to-be-done |
| 4 | Sharp scope, explicit non-goals, obvious wedge |
| 5 | Above, plus a believable expansion path from wedge to platform |

**Wedge → platform arc:** start where context already exists and stakes are high (engineering orgs, source code + customer data), expand to finance/HR data, then to the full permission graph. Say the non-goal aloud: *"we are not rebuilding IAM, we sit in front of it."*

### 3.4 AI autonomy

| Score | Evidence |
| --- | --- |
| 1–2 | LLM used for text generation only |
| 3 | Agent makes a classification the system acts on |
| 4 | Agent gathers its own context, makes a graded decision (allow / challenge / block / escalate), and explains it |
| 5 | Above, with a clear, *defended* boundary on what the agent may decide alone |

Note the trap: judges reward autonomy **and** reward restraint. Resolve it by making the boundary explicit rather than maximising autonomy.

### 3.5 UX clarity

| Score | Evidence |
| --- | --- |
| 1–2 | Judge cannot follow what happened |
| 3 | Screens are readable |
| 4 | The decision and its reasoning are legible in a single screen |
| 5 | A judge could explain your product to another judge after 3 minutes |

Design target: one screen where **the request, the risk score, the plain-English reasons, and the approval action are visible together.** Do not make judges scroll during a 3-minute demo. On a flat rubric this is worth exactly as much as security impact — and it silently caps the other six if judges can't follow what happened.

### 3.6 Real-world applicability

| Score | Evidence |
| --- | --- |
| 1–2 | Requires the world to change to adopt it |
| 3 | Plausible for a startup with no legacy |
| 4 | Integration story is concrete — named systems, named data sources |
| 5 | Above, plus a credible answer on deployment friction, false positives, and who owns it internally |

**Cordyceps hook:** do not pitch "a new ERP employees must maintain". Pitch a **context layer that reads from Jira, Linear, GitHub, Slack, Notion, SAP**. The internal task board is the *demo substrate*, not the product. Say this before a judge says it to you.

### 3.7 Safety & responsible AI design

| Score | Evidence |
| --- | --- |
| 1–2 | Not mentioned |
| 3 | Mentions human-in-the-loop |
| 4 | Failure modes named; false-positive cost acknowledged; decisions auditable |
| 5 | Above, plus surveillance/privacy posture addressed unprompted, and reversibility designed in |

**Cordyceps hook — the cheapest 5 on the board,** because most teams will treat this as a footnote. Three things to say unprompted:

1. **Suspend, don't deny.** Access is held pending second-party approval, never silently killed. Failure mode is *delay*, not *lockout*.
2. **Auditability.** Every decision writes policy reasons, risk score, approver and outcome. Explanations are in plain English, aimed at the person affected.
3. **Anti-surveillance posture.** The system scores *access events against work context* — it is not a productivity monitor and does not rank employees. Say this before anyone asks; daily-task reporting reads as surveillance if you let it.

---

## 4. The implicit layer — where weighting applies

Everything above is flat by design. But projects tied on the explicit rubric are not tied in the room. **Who** is scoring, **what** you built on, and **which** track you claim all move outcomes without appearing in any published criterion.

Model the implicit layer as a 100-point differentiation budget *(inferred — this is our allocation, not organiser policy)*:

| Implicit factor | Weight | Rationale |
| --- | --- | --- |
| **Judge-background resonance** (§4.1) | **40** | Nine judges score from their own professional lens. Hitting the lens is worth more than any single explicit criterion. |
| **Tech partner tooling depth** (§4.2) | **30** | Sponsor tools are both a parallel prize pool and a credibility signal — three judges *work at* partner companies and can audit your integration in one question. |
| **Track fit & positioning** (§4.3) | **15** | Claiming the right track puts you against the right comparison set; claiming the wrong one makes a good project look mediocre. |
| **Two-gate format execution** (§4.4) | **15** | The submission artefact and the 3-minute demo are separate skills. Strong builds die at Gate 1 through an unreadable README. |

---

### 4.1 Judge-background resonance — 40 points

Nine judges, three blocs. No single judge dominates, so the winning pitch must land on all three axes within three minutes. Points below are that bloc's share of the 40.

#### Practitioners & enterprise vendors — 18 pts (4 of 9 judges)

| Judge | Role | Lens they score through | Likely question |
| --- | --- | --- | --- |
| **Paul Price** | Founder, CodeWall | Does it actually work; false-positive burden; developer UX | "What's your false-positive rate, and who eats the pager for it?" |
| **Tyler Edwards** | Founder & CEO, Overmind | Graph/dependency modelling, blast-radius reasoning | "How do you build and keep the graph current?" |
| **Hani Momeninia** | AI Security, SAP | Enterprise AI security, data governance, integration realism | "Where does this sit relative to existing IAM and SoD controls?" |
| **Rares-Teodor Ciucur** | Cyber Security Consultant, IBM | SOC fit, compliance mapping, operational maturity | "How does this map to what a SOC already runs?" |

**Largest and most sceptical bloc.** Concessions land better than claims — name the false-positive cost, name what you'd need to deploy for real, and use vocabulary they already own (least privilege, separation of duties, JIT elevation, blast radius, MITRE ATT&CK lateral movement / T1078 valid accounts).

**Tyler Edwards is a special case:** the attack-path graph is his company's core thesis. Two outcomes — a shallow graph gets dismantled by the one person who knows it best, or a genuinely reasoned graph earns you the panel's most credible advocate. Either invest properly or keep it explicitly secondary and framed as future work. Do not bluff it.

#### Capital side — 13 pts (3 of 9 judges)

| Judge | Role | Lens they score through | Likely question |
| --- | --- | --- | --- |
| **Umberto Belluzzo** | Investor, Earlybird Ventures | Market, wedge, adoption path | "Who buys this, and what do they rip out to make room for it?" |
| **Jai Taylor** | Principal, Blue Wire Capital | Defensibility, competitive framing | "What stops Okta or CrowdStrike shipping this as a feature?" |
| **Naol Basaye** | Entrepreneur First, Spring 2026 | Sharpness of the insight; is this a company | "What's the one thing you believe that most security people don't?" |

**How to serve them:** lead with the insight, not the architecture. *"Permissions answer whether you can. Nothing in production answers whether you should, right now."* Have a one-sentence moat answer ready — the moat is the **context graph**, not the model.

#### Public sector / responsible AI — 9 pts (2 of 9 judges)

| Judge | Role | Lens they score through | Likely question |
| --- | --- | --- | --- |
| **David Gelberg** | AI Innovation Fellow, 10 Downing Street | Responsible AI, critical-infrastructure relevance, policy legibility | "What happens when the model is wrong about a legitimate access?" |
| **Ehsan Ashouri** | Principal Engineer, Justice AI Unit | Engineering rigour *and* accountability of automated decisions | "Can an affected employee contest this decision, and on what record?" |

**Smallest bloc, highest conviction.** Automated decisions about people, with a due-process story, is precisely their professional terrain — they will notice its absence when nobody else does. The audit trail and *suspend-not-deny* design are the answers; lead with them rather than being drawn to them.

---

### 4.2 Tech partner tooling — 30 points

Partners: **Supabase, Modal, Overmind, Ossprey, IBM, SAP**, hosted by **Cursor**, alongside Night Office. Tracks include **Bonus Sponsor Challenges** — a *second, parallel prize pool*, with "more tracks and sponsor prize buckets to be announced".

**Rule: a coherent two-partner implementation beats six superficial logos.** Judges from IBM, SAP and Overmind can tell within one question whether an integration is real — and a fake one costs more than the logo earns.

Points below are that partner's share of the 30, scored as *return per hour of build time for this specific project*.

| Partner | Pts | Fit for Cordyceps | Verdict |
| --- | --- | --- | --- |
| **Supabase** | **9** | Auth, org/project/task data, resource metadata, access logs, realtime approval notifications | **Core.** Realtime is the demo-maker — the approval request appearing live on the owner's second screen is the single most persuasive beat in the run. Highest certainty of payoff. |
| **Modal** | **7** | Embeddings, behavioural baselining, graph/attack-path computation | **Core.** Gives the AI layer real substance instead of one prompt over a log. Keep the call path fast enough to run live under demo conditions. |
| **Overmind** | **6** | Infrastructure dependency + blast-radius context feeding the attack graph | **High-leverage, high-risk.** Direct thesis overlap with judge Tyler Edwards. Biggest upside per hour *if* real; the worst possible place to fake depth. Decide early — this is not a 16:00 decision. |
| **Cursor** | **4** | Host; build velocity is the implicit meta-criterion of the whole event | **Required, near-zero cost.** Cursor credits are a prize. "Built today in Cursor, here's the shape of it" is free support for technical execution. |
| **SAP** | **3** | Enterprise integration framing — a contextual security layer over organisational data | **Framing over integration.** Judge Hani Momeninia works here. Even with no live integration, framing Cordyceps as sitting *beside* an ERP rather than replacing one serves both the judge and the applicability score. Costs one sentence. |
| **IBM** | **1** | Enterprise SOC / consulting lens | **Framing only.** Judge Rares-Teodor Ciucur. Serve via SOC-fit and compliance vocabulary, not an integration. |
| **Ossprey** | **0** | Supply-chain / dependency security | **Skip unless free.** No natural seam with contextual authorisation; forcing it dilutes the story and costs build hours you need elsewhere. |

**Community partners** — Night Office (Oli Kingshot), TryHackMe (Nodir Umurkulov), Security Builder Club (Zizou Brahmi) — shape the room and audience, not the scoring. Co-hosts Nodir, Zizou and Francisco run the day.

**Implication:** Supabase + Modal is the committed spine (16 of 30 pts for work you need anyway). Overmind is the one genuine strategic call. SAP and IBM are paid for in sentences, not commits.

---

### 4.3 Track fit & positioning — 15 points

Tracks: **Incident Response · Offensive Security · AI Security · Bonus Sponsor Challenges.**

**Cordyceps' primary track is AI Security** — an autonomous agent making security decisions with a human in the loop is the event's own stated thesis, and it is the track where the hybrid-pipeline architecture reads as the point rather than as overhead.

Secondary claim on **Incident Response** via the escalation and second-party approval workflow. **No claim on Offensive Security** — the attack-path graph is defensive reasoning, not offence; stretching for it invites comparison against real red-team tooling you will lose.

Ask at the briefing whether bonus sponsor buckets are judged separately from the main track; if so, they are additive and worth claiming, not a distraction.

---

### 4.4 Two-gate format execution — 15 points

Gate 1 and Gate 2 reward different artefacts (see §1). Budget for both before code freeze:

- **Reserve 30 minutes before 15:45** for the submission artefact. A working build with an illegible README loses to a weaker build that reads clearly in ninety seconds.
- **Rehearse the 3 minutes at least twice.** Unrehearsed demos overrun and lose the closing integration line — which is the line that carries real-world applicability.
- **Have a recorded fallback clip** of the core scenario. Live-demo failure at 16:35 is the most common way a Top 5 project leaves without a placing.

---

## 5. Self-assessment — Cordyceps

Scored against the flat rubric — every row weighted the same, so the lowest row is the one to fix.

| Criterion | Target | At risk if… |
| --- | --- | --- |
| Technical execution | 4 | The hybrid pipeline is asserted in slides but only the LLM layer actually runs |
| Security impact | 5 | The insider-threat scenario isn't shown end-to-end live |
| Product thinking | 4 | Scope creeps back toward the full ERP |
| AI autonomy | 4–5 | The "AI" is a single prompt over an access log rather than context-grounded reasoning |
| UX clarity | 4 | The decision and its reasoning are split across screens |
| Real-world applicability | 4 | It looks like a new ERP employees must maintain |
| Safety & responsible AI | 5 | Surveillance framing goes unaddressed; no visible audit trail |

**Weakest link:** real-world applicability, because the origin idea was an ERP. On a flat rubric this drags the average exactly as hard as a weak security story would. Pre-empt it in the first 20 seconds of the pitch.

---

## 6. Demo checklist — mapping the 3 minutes

The Alice / Project Nova scenario, timed and mapped:

| Time | Beat | Criteria served |
| --- | --- | --- |
| 0:00–0:20 | One-line pitch + the gap RBAC leaves open | Security impact, Product thinking |
| 0:20–0:40 | Alice opens the Atlas repo → instant allow. *Establishes the system isn't just a blocker.* | UX clarity, Real-world applicability |
| 0:40–1:20 | Alice requests Nova's confidential acquisition doc → context checks fire: not assigned, no task references Nova, doc is confidential, first-ever Nova access, bulk download in progress | AI autonomy, Technical execution |
| 1:20–1:45 | Agent explains the mismatch in plain English; risk score + policy reasons on one screen | AI autonomy, UX clarity |
| 1:45–2:10 | Access **suspended**, not denied. Approval request appears live on Nova owner's screen (Supabase realtime) | Safety & responsible AI |
| 2:10–2:30 | Owner approves/rejects; decision + reasoning written to the audit trail | Safety, Real-world applicability |
| 2:30–2:50 | Attack-path graph: Alice → `finance-data-readers` → `finance/` share → Nova acquisition model, six-month-old grant reason on the edge. *Why the agent intervened at all.* **Cut with rung 3b** — see [plan.md](plan.md); if cut, one sentence instead. | Security impact, Technical execution |
| 2:50–3:00 | Integration line: reads from Jira/Linear/GitHub/Slack/SAP — not another platform to maintain | Real-world applicability, Product thinking |

Every one of the seven criteria is touched at least once — deliberate, given the flat rubric.

**Prepared answers to have loaded** (each maps to a named judge in §4.1):

- False positives (Price) → "suspend, not deny; the cost is a 15-minute delay with a named approver, not a lockout."
- Graph freshness (Edwards) → how it's built, how it's refreshed, what goes stale.
- IAM / SoD positioning (Momeninia) → "we're in front of IAM, not replacing it — this is the purpose layer nobody owns today."
- SOC fit (Ciucur) → where the alert lands and who actions it.
- Contestability (Ashouri, Gelberg) → the audit record, and that the explanation is written for the employee, not just the SOC.
- Moat (Taylor, Belluzzo) → "the context graph, not the model — it compounds with every integration."

---

## 7. Open questions to confirm on the day

Ask at the 09:15 briefing / judging overview:

- Are the seven criteria genuinely **equally weighted**? (§1–§3 assume yes. If a weighting is announced, it replaces the flat treatment — the implicit layer in §4 stands either way.)
- How is the Top 5 cut made — judge scoring of submissions, or organiser triage?
- What exactly does the submission artefact need (repo, video, deck, live URL)?
- Which sponsor bonus buckets exist, and are they judged separately from the main track?
- Is there a Q&A window after the 3-minute demo, or is it 3 minutes flat?
