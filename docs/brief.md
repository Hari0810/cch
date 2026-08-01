Me:

My idea - a central ERP for employees to report their daily tasks, weekly KPIs and overall projects. 

The ERP will also have cybersecurity features that allow for context awareness, awareness of access privileges of each user, maps out potential attack vectors, but most importantly, if it finds that some employees are accessing idea that they technically could but shouldnt, flag that on the system and restrict access until a second party permits it

AI Response:

The strongest part of your idea is not the ERP. It is this:

Detecting when an employee is technically authorised to access data, but the access makes no sense given what they are currently working on.

That is a genuine security gap. Traditional access control asks, “Does this person’s role permit access?” Your system asks, “Does this specific access have a legitimate purpose right now?”

Sharpened concept

Build a context-aware access control layer for organisations.

It combines:

Identity and formal permissions
Current projects and assigned tasks
Recent employee activity
Data sensitivity and ownership
Time, location and access method
Relationships between employees, systems and resources

Every sensitive access request receives a contextual risk score.

Example	Decision
Engineer opens the repository for their assigned project	Allow
Engineer accesses an unrelated project’s roadmap	Challenge or flag
Finance employee exports the entire customer table	Temporarily block
Departing employee downloads many sensitive documents	Block and escalate
Employee has a legitimate unusual reason	Request second-party approval

The important distinction is:

Authentication: Are you Harishan?
RBAC: Is your role allowed to access this resource?
Your system: Does Harishan have a legitimate reason to access this resource in this context?

Security teams sometimes describe adjacent concepts as UEBA, ABAC, just-in-time access or purpose-based access control. Your differentiator is using live organisational context to connect them.

Do not build a full ERP today

“Central ERP” makes the idea sound enormous and administratively burdensome. Daily task reporting could also feel like employee surveillance.

For the hackathon, present the task/project system as a context engine, not the main product. In reality, it would integrate with Jira, Linear, Slack, GitHub, Notion, SAP or existing ERP systems rather than force employees to maintain another platform.

Your MVP only needs:

A small project-management screen showing employees, projects and tasks.
A resource catalogue containing repositories, documents and databases.
A permissions graph showing who can technically access what.
An access simulator or proxy.
An AI agent that evaluates suspicious access.
A second-party approval workflow.
A visible audit trail explaining every decision.
Best three-minute demo

Use one memorable insider-threat scenario:

Setup: Alice is assigned to Project Atlas. Her permissions also allow her to read Project Nova because both projects share an engineering group.

Alice accesses the Atlas repository — immediately allowed.
Alice requests Nova’s confidential acquisition document.
The system checks:
She is not assigned to Nova.
None of her current tasks mention Nova.
The document is highly sensitive.
This is her first access to Nova.
She has started downloading several files.
The agent explains the mismatch in plain English.
Access is suspended rather than permanently denied.
Nova’s project owner receives an approval request.
The owner approves or rejects it.
The complete reasoning and decision are recorded.

This demonstrates security impact, AI autonomy, human-in-the-loop design, UX clarity and responsible AI—all explicit judging criteria.

Make the AI technically meaningful

Avoid merely sending access logs to an LLM. Build a hybrid decision system:

Access event
    ↓
Deterministic policy checks
    ↓
Organisational context retrieval
    ↓
Graph-based attack-path analysis
    ↓
AI risk assessment and explanation
    ↓
Allow / challenge / temporarily block
    ↓
Human approval for ambiguous cases

The deterministic layer enforces hard constraints. The AI handles ambiguity, such as whether the access matches an employee’s task or project context. This is safer and more credible than allowing an LLM to make every access decision itself.

A sample decision output could be:

{
  "decision": "REQUIRE_APPROVAL",
  "risk_score": 82,
  "policy_reasons": [
    "Resource is classified as confidential",
    "User is not assigned to Project Nova",
    "No active task establishes a business purpose",
    "Access differs from the user's normal behaviour"
  ],
  "approver": "project-nova-owner",
  "expires_in_minutes": 15
}
Attack-vector mapping

The attack-path feature can strengthen the demo, but keep it secondary. Represent the company as a graph:

Users
Roles
Projects
Resources
Credentials
Services
Permissions

Then show something like:

Alice can access GitHub → repository contains a service credential → credential reaches the production database → database contains customer records.

That gives the agent a stronger reason to intervene: it understands not only the requested document but also what that access could lead to.

Suggested sponsor-aligned stack
Supabase: authentication, project/task data, resource metadata, access logs and realtime approval notifications
Modal: run embeddings, behavioural analysis or attack-graph processing
SAP: frame it as an enterprise integration or contextual security layer around organisational data
Overmind: potentially use infrastructure relationships and dependency context
Cursor: rapid implementation and agent development

You do not need to force every sponsor into the project. A coherent Supabase + Modal implementation is better than six superficial integrations.

Product name and pitch

Possible names: ContextGate, Purpose, AccessLens, Mandate, or WhyAccess.

One-line pitch:

ContextGate prevents insider threats by checking not only whether an employee can access sensitive data, but whether they should be accessing it for their current work.

Or, more dramatic:

Your permissions say what you can access. ContextGate understands what you should access right now.

Overall, this is technically strong enough—but only if you narrow it from “build an ERP with cybersecurity features” to build a contextual authorisation agent with a minimal organisational-context dashboard. That narrower version is more novel, more demoable, and much more aligned with the hackathon.