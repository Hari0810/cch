# Judging Criteria & Rubric — Cursor Cybersecurity London Hackathon

**Date:** Saturday 1 August · Halkin Offices, 1–2 Paris Garden, London
**Project:** Cordyceps — contextual authorisation agent

> **Status of this document.** The organisers published the seven judging *dimensions* (see below) but **not** their weights. Everything below marked *(inferred)* is our own model, derived from the panel composition, the stated event thesis, and the demo format. Treat the dimension list as fact and the weights as a planning tool.

---

## 1. Official criteria (as published)

Projects will be judged on:

1. Technical execution
2. Security impact
3. Product thinking
4. AI autonomy
5. UX clarity
6. Real-world applicability
7. Safety and responsible AI design

**Format constraints that shape scoring:**

- Code freeze **15:45**, submissions + *initial judging* immediately after.
- Top 5 by score present live, **3 minutes each**, at 16:35.
- Final placings (1st–3rd) decided from the live demos at 16:55.

This is a **two-gate process**. The submission artefact alone gets you into the Top 5 — most judges will never run your code, they will read the README and watch/skim what you submit. The 3-minute live demo decides the podium. Optimise the two gates differently:

| Gate | Decided by | What wins it |
| --- | --- | --- |
| Gate 1 — Top 5 (≈15:45–16:35) | Skimmed submission, ~2–4 min of attention per project | Legible one-liner, obvious security relevance, a screenshot/clip proving it runs, sponsor tech named |
| Gate 2 — Podium (16:35–16:55) | Live 3-min demo + Q&A | One scenario shown end-to-end, the AI visibly reasoning, human-in-the-loop moment, crisp answer to the hardest question |

---

## 2. Weighted rubric *(inferred)*

Score each dimension 0–5, multiply by weight, total out of 100.

| # | Criterion | Weight | Why this weight |
| --- | --- | --- | --- |
| 1 | **Security impact** | **20%** | It is a *cybersecurity* hackathon with a security-heavy panel. "Does this reduce real risk?" is the load-bearing question. |
| 2 | **Technical execution** | **18%** | Four practitioner/engineer judges will probe whether it actually works. Cursor-sponsored — shipping velocity is the point. |
| 3 | **AI autonomy** | **15%** | The event thesis is literally "AI-native cybersecurity" and "autonomous security agents". A project where AI is decoration scores near zero here. |
| 4 | **Real-world applicability** | **15%** | Three investor-side judges + two enterprise vendors. "Would a CISO deploy this?" |
| 5 | **Product thinking** | **12%** | Two investors and an EF founder are grading whether this is a *company*, not a script. |
| 6 | **Safety & responsible AI** | **12%** | Unusually high for a hackathon — driven by two public-sector AI judges (Downing Street, Justice AI Unit) for whom this is the day job. Most teams will treat it as a footnote; it is cheap differentiation. |
| 7 | **UX clarity** | **8%** | Lowest weight, but it *gates* everything else in a 3-minute demo — an unreadable UI silently suppresses scores 1–6. |

**Scoring anchors** (apply per dimension):

| Score | Meaning |
| --- | --- |
| 0 | Absent |
| 1 | Claimed in the pitch, not visible in the product |
| 2 | Present but trivial / hardcoded / demo-only |
| 3 | Working, credible, unremarkable |
| 4 | Working and *deliberate* — a design choice a judge would defend |
| 5 | Working, deliberate, and teaches the judge something they hadn't considered |

Realistic target: **anything ≥ 4.0 average (80/100) is podium territory**; ≥ 3.4 (68) should make the Top 5.

---

## 3. Per-criterion rubric detail

### 3.1 Security impact — 20%

| Score | Evidence |
| --- | --- |
| 1–2 | Generic "AI for security"; threat model unstated |
| 3 | Names a real threat class and plausibly addresses it |
| 4 | Threat model is explicit; shows a concrete attack it stops and one it doesn't |
| 5 | Addresses a gap existing tooling genuinely leaves open, and the judge recognises the gap from their own work |

**Cordyceps hook:** insider threat / over-permissioned access is the canonical gap RBAC leaves open. Name the adjacent categories out loud — UEBA, ABAC, JIT access, purpose-based access control — so security judges know you know the landscape, then state the differentiator: *live organisational context is the missing input*.

### 3.2 Technical execution — 18%

| Score | Evidence |
| --- | --- |
| 1–2 | Slideware, or a single LLM call wrapped in a UI |
| 3 | Runs live, one integration real |
| 4 | Multi-layer architecture where each layer is justified; graph/data model is real; runs under Q&A pressure |
| 5 | Above, plus a non-obvious engineering decision explained in one sentence |

**Cordyceps hook:** the hybrid pipeline — deterministic policy checks → context retrieval → graph attack-path analysis → LLM risk assessment → decision → human approval. The single most credible line available: *"the deterministic layer enforces hard constraints, the model only handles ambiguity — we never let an LLM be the sole authority on an access decision."* That sentence scores in 3.2, 3.4 and 3.7 simultaneously.

### 3.3 AI autonomy — 15%

| Score | Evidence |
| --- | --- |
| 1–2 | LLM used for text generation only |
| 3 | Agent makes a classification the system acts on |
| 4 | Agent gathers its own context, makes a graded decision (allow / challenge / block / escalate), and explains it |
| 5 | Above, with a clear, *defended* boundary on what the agent may decide alone |

Note the trap: judges reward autonomy **and** reward restraint. Resolve it by making the boundary explicit rather than maximising autonomy.

### 3.4 Real-world applicability — 15%

| Score | Evidence |
| --- | --- |
| 1–2 | Requires the world to change to adopt it |
| 3 | Plausible for a startup with no legacy |
| 4 | Integration story is concrete — named systems, named data sources |
| 5 | Above, plus a credible answer on deployment friction, false positives, and who owns it internally |

**Cordyceps hook:** do not pitch "a new ERP employees must maintain". Pitch a **context layer that reads from Jira, Linear, GitHub, Slack, Notion, SAP**. The internal task board is the *demo substrate*, not the product. Say this before a judge says it to you.

### 3.5 Product thinking — 12%

| Score | Evidence |
| --- | --- |
| 1–2 | Feature, not product; no user named |
| 3 | Clear user and job-to-be-done |
| 4 | Sharp scope, explicit non-goals, obvious wedge |
| 5 | Above, plus a believable expansion path from wedge to platform |

**Wedge → platform arc:** start where context already exists and stakes are high (engineering orgs, source code + customer data), expand to finance/HR data, then to the full permission graph. Say the non-goal aloud: *"we are not rebuilding IAM, we sit in front of it."*

### 3.6 Safety & responsible AI — 12%

| Score | Evidence |
| --- | --- |
| 1–2 | Not mentioned |
| 3 | Mentions human-in-the-loop |
| 4 | Failure modes named; false-positive cost acknowledged; decisions auditable |
| 5 | Above, plus surveillance/privacy posture addressed unprompted, and reversibility designed in |

**Cordyceps hook — this is the highest-leverage cheap win on the board.** Three things to say unprompted:

1. **Suspend, don't deny.** Access is held pending second-party approval, never silently killed. Failure mode is *delay*, not *lockout*.
2. **Auditability.** Every decision writes policy reasons, risk score, approver and outcome. Explanations are in plain English, aimed at the person affected.
3. **Anti-surveillance posture.** The system scores *access events against work context* — it is not a productivity monitor and does not rank employees. Say this before anyone asks; daily-task reporting reads as surveillance if you let it.

### 3.7 UX clarity — 8%

| Score | Evidence |
| --- | --- |
| 1–2 | Judge cannot follow what happened |
| 3 | Screens are readable |
| 4 | The decision and its reasoning are legible in a single screen |
| 5 | A judge could explain your product to another judge after 3 minutes |

Design target: one screen where **the request, the risk score, the plain-English reasons, and the approval action are visible together.** Do not make judges scroll during a 3-minute demo.

---

## 4. Judge panel — weighted context

Nine judges. Composition drives the weighting above: **~3 capital-side, ~2 public-sector AI, ~4 practitioner/vendor.** No single judge dominates, so the winning pitch must land on all three axes within three minutes.

### Capital side (~33% of the room)

| Judge | Role | What they score hardest | Likely question |
| --- | --- | --- | --- |
| **Umberto Belluzzo** | Investor, Earlybird Ventures | Product thinking, real-world applicability | "Who buys this, and what do they rip out to make room for it?" |
| **Jai Taylor** | Principal, Blue Wire Capital | Market framing, defensibility | "What stops Okta or CrowdStrike shipping this as a feature?" |
| **Naol Basaye** | Entrepreneur First, Spring 2026 | Sharpness of the insight; is this a company | "What's the one thing you believe that most security people don't?" |

**How to serve them:** lead with the insight, not the architecture. *"Permissions answer whether you can. Nothing in production answers whether you should, right now."* Have a one-sentence moat answer ready — the moat is the **context graph**, not the model.

### Public sector / responsible AI (~22%)

| Judge | Role | What they score hardest | Likely question |
| --- | --- | --- | --- |
| **David Gelberg** | AI Innovation Fellow, 10 Downing Street | Safety & responsible AI, critical-infrastructure relevance, policy legibility | "What happens when the model is wrong about a legitimate access?" |
| **Ehsan Ashouri** | Principal Engineer, Justice AI Unit | Engineering rigour *and* accountability of automated decisions | "Can an affected employee contest this decision, and on what record?" |

**How to serve them:** these two are why safety is weighted at 12% rather than 5%. Automated decisions about people, with a due-process story, is precisely their professional terrain. The audit trail and the *suspend-not-deny* design are your answers — lead with them rather than being drawn to them.

### Practitioners & enterprise vendors (~44%)

| Judge | Role | What they score hardest | Likely question |
| --- | --- | --- | --- |
| **Paul Price** | Founder, CodeWall | Does it actually work; false-positive burden; developer UX | "What's your false-positive rate, and who eats the pager for it?" |
| **Tyler Edwards** | Founder & CEO, Overmind | Graph/dependency modelling, blast radius reasoning | "How do you build and keep the graph current?" |
| **Hani Momeninia** | AI Security, SAP | Enterprise AI security, data governance, integration realism | "Where does this sit relative to existing IAM and SoD controls?" |
| **Rares-Teodor Ciucur** | Cyber Security Consultant, IBM | SOC fit, compliance mapping, operational maturity | "How does this map to what a SOC already runs?" |

**How to serve them:** this is the largest bloc and the most sceptical. Concessions land better than claims — name the false-positive cost, name what you'd need to deploy for real, and map to vocabulary they already use (least privilege, separation of duties, JIT elevation, blast radius, MITRE ATT&CK lateral movement / T1078 valid accounts).

**Tyler Edwards is a special case:** the attack-path graph is his company's core thesis. Two outcomes — a shallow graph gets picked apart by the one person who knows it best, or a genuinely reasoned graph earns the panel's most credible advocate. Either invest in it properly or keep it explicitly secondary and framed as future work. Do not bluff it.

---

## 5. Partners & sponsors — weighted context

Tracks are **Incident Response, Offensive Security, AI Security, + Bonus Sponsor Challenges**, with "more tracks and sponsor prize buckets to be announced". Sponsor buckets are a *second, parallel prize pool* — they do not raise your main-track score, so treat integrations as ROI decisions, not a checklist.

**Rule: a coherent two-partner implementation beats six superficial logos.** Judges from IBM, SAP and Overmind can tell within one question whether an integration is real.

| Partner | Fit for Cordyceps | Priority | Notes |
| --- | --- | --- | --- |
| **Cursor** | Host; build velocity is the implicit meta-criterion | **Required** | Cursor credits are a prize. Being able to say "built today, in Cursor, here's the shape of it" supports Technical Execution. |
| **Supabase** | Auth, org/project/task data, resource metadata, access logs, realtime approval notifications | **Core** | Realtime is the demo-maker: the approval request appearing live on the owner's screen is the single most persuasive beat in the run. |
| **Modal** | Embeddings, behavioural baselining, graph/attack-path computation | **Core** | Gives the AI layer real substance — moves AI Autonomy from 3 to 4. Keep the call path fast enough to run live. |
| **Overmind** | Infrastructure dependency + blast-radius context feeding the attack graph | **High-leverage, high-risk** | Direct thesis overlap with judge Tyler Edwards. Highest upside per unit of effort *if* it is real; worst place to fake depth. |
| **SAP** | Enterprise integration framing — a contextual security layer over organisational data | **Framing over integration** | Judge Hani Momeninia (AI Security, SAP). Even without a live integration, framing Cordyceps as sitting *beside* an ERP rather than replacing one directly serves this judge and the applicability score. |
| **IBM** | Enterprise SOC / consulting lens | **Framing only** | Judge Rares-Teodor Ciucur. Serve via SOC-fit and compliance vocabulary, not an integration. |
| **Ossprey** | Supply-chain / dependency security | **Skip unless free** | No natural seam with contextual authorisation; forcing it dilutes the story. |

**Community partners** — Night Office (Oli Kingshot), TryHackMe (Nodir Umurkulov), Security Builder Club (Zizou Brahmi) — shape the room and the audience, not the scoring. Co-hosts Nodir, Zizou and Francisco run the day.

**Track selection:** Cordyceps' primary track is **AI Security** (autonomous agent making security decisions with a human in the loop). It has a secondary claim on **Incident Response** via the escalation/approval workflow. It has none on Offensive Security — the attack-path graph is defensive reasoning, not offence; don't stretch for it.

---

## 6. Self-assessment — Cordyceps

Scored honestly against the weighted rubric. Update as the build lands.

| Criterion | Weight | Target | Currently at risk if… |
| --- | --- | --- | --- |
| Security impact | 20% | 5 | The insider-threat scenario isn't shown end-to-end live |
| Technical execution | 18% | 4 | The hybrid pipeline is asserted in slides but only the LLM layer actually runs |
| AI autonomy | 15% | 4–5 | The "AI" is a single prompt over an access log rather than context-grounded reasoning |
| Real-world applicability | 15% | 4 | It looks like a new ERP employees must maintain |
| Product thinking | 12% | 4 | Scope creeps back toward the full ERP |
| Safety & responsible AI | 12% | 5 | Surveillance framing goes unaddressed; no visible audit trail |
| UX clarity | 8% | 4 | The decision and its reasoning are split across screens |

**Weakest link:** real-world applicability, because the origin idea was an ERP. Pre-empt it in the first 20 seconds of the pitch.

---

## 7. Demo checklist — mapping the 3 minutes to the rubric

The Alice / Project Nova scenario, timed and mapped:

| Time | Beat | Criteria served |
| --- | --- | --- |
| 0:00–0:20 | One-line pitch + the gap RBAC leaves open | Security impact, Product thinking |
| 0:20–0:40 | Alice opens the Atlas repo → instant allow. *Establishes the system isn't just a blocker.* | UX clarity, Real-world applicability |
| 0:40–1:20 | Alice requests Nova's confidential acquisition doc → context checks fire: not assigned, no task references Nova, doc is confidential, first-ever Nova access, bulk download in progress | AI autonomy, Technical execution |
| 1:20–1:45 | Agent explains the mismatch in plain English; risk score + policy reasons on one screen | AI autonomy, UX clarity |
| 1:45–2:10 | Access **suspended**, not denied. Approval request appears live on Nova owner's screen (Supabase realtime) | Safety & responsible AI |
| 2:10–2:30 | Owner approves/rejects; decision + reasoning written to the audit trail | Safety, Real-world applicability |
| 2:30–2:50 | Attack-path graph: Alice → GitHub → service credential → prod DB → customer records. *Why the agent intervened at all.* | Security impact, Technical execution |
| 2:50–3:00 | Integration line: reads from Jira/Linear/GitHub/Slack/SAP — not another platform to maintain | Real-world applicability, Product thinking |

**Prepared answers to have loaded** (each maps to a named judge above):

- False positives → "suspend, not deny; the cost is a 15-minute delay with a named approver, not a lockout."
- Moat → "the context graph, not the model — it compounds with every integration."
- Graph freshness → how it's built, how it's refreshed, what goes stale.
- Contestability → the audit record, and the fact the explanation is written for the employee, not just the SOC.
- vs. incumbents → "we're in front of IAM, not replacing it — this is the purpose layer nobody owns today."

---

## 8. Open questions to confirm on the day

Ask at the 09:15 briefing / judging overview:

- Are the seven criteria **equally weighted**, or is there a published weighting? (Replaces §2.)
- How is the Top 5 cut made — judge scoring of submissions, or organiser triage?
- What exactly does the submission artefact need (repo, video, deck, live URL)?
- Which sponsor bonus buckets exist, and are they judged separately from the main track?
- Is there a Q&A window after the 3-minute demo, or is it 3 minutes flat?
