# PRODUCT.md

> **Assumptions flagged.** This file was inferred from the repository + the
> user's build brief (`build a lead-monitoring dashboard, use shadcn/ui`) while
> the user was answering a separate questionnaire. Sections marked _(assumed)_
> should be confirmed or replaced.

## What this is

An internal operations console for the **Sales Automation agent** in this repo,
built for **PT Core Solution Digital** (B2B digital solutions: custom web apps,
AI automation, custom AI agents, AI sales automation, and system integration).
The agent — "Nadia", the AI Sales Representative — converses with inbound
WhatsApp leads through a LangGraph pipeline (triage → RAG → lead scoring →
strategy → reply → booking → evaluation → reflection → long-term memory). The
dashboard is the human window into that machine: it shows which leads arrived,
how they were scored, what the agent replied, how the reply was judged, and
where the funnel is leaking.

## Who uses it _(assumed)_

The sales/ops team at PT Core Solution Digital running WhatsApp sales. They
check it several times a day between other work, on a laptop, in a bright
office. They need to scan fast: "who is hot, who needs a human, what did Nadia
say, is it working?"

## The job to be done

- **Triage the queue.** See new leads ranked by score and segment.
- **Inspect a lead.** Read the full WhatsApp transcript, the score breakdown,
  the strategy chosen, the booking state, and the evaluation.
- **Judge the machine.** Is the agent scoring sensibly? Are replies scoring
  well? Is the reflection loop learning?

## Success looks like

It replaces the "run a psql query" workflow. A team member can answer "who are
today's hottest leads and what happened with them?" in under 30 seconds.

## Product truth (from the repo)

- Data source of record: Postgres (`leads`, `conversations`, `long_term_memory`,
  `evaluations`, `bookings`) + the LangGraph checkpointer.
- The backend already exposes a REST API (`/leads`, `/conversations/:threadId`,
  `/health`, `/graph/mermaid`). This build adds `/metrics`, `/leads/:id`,
  `/evaluations`, `/bookings`.
- Segments are `nurture` (<40), `objection` (40–74), `closing` (>=75).
- Evaluations score relevance, groundedness, tone, conversion likelihood, overall (0–10).
- Message direction: `inbound` (lead) / `outbound` (agent).
- The product is Indonesian-first (the agent replies in the lead's language).

## Hard constraints

- **Visual world is pinned to shadcn/ui** by the brief. Extend the shadcn design
  language; do not invent a competing identity.
- Do not fabricate commercial claims or fake leads. Demo data is labeled as such
  and the dashboard reads real DB values.
- Not an autonomous agent surface: read-only monitoring. No sending messages
  from the dashboard.

## Non-goals (for now)

- Auth / multi-tenant.
- Editing prompts or knowledge from the UI.
- Replacing the WhatsApp conversation experience.
