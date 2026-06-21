---
name: decisions
description: Key architectural and technical decisions with reasoning. Load when making design choices or understanding why something is built a certain way.
triggers:
  - "why do we"
  - "why is it"
  - "decision"
  - "alternative"
  - "we chose"
edges:
  - target: context/architecture.md
    condition: when a decision relates to system structure
  - target: context/stack.md
    condition: when a decision relates to technology choice
last_updated: 2026-06-21
---

# Decisions

## Decision Log

### D006: D1 over KV for persistent Worker storage (2026-06-21)
**Decision:** Use Cloudflare D1 (SQLite via HTTP) instead of KV for caching trade data.
**Reasoning:** D1 supports SQL queries (SELECT with WHERE, ORDER BY, JOIN) which are essential for AI analysis (filter by slug) and time-series (daily P&L). KV only offers key-value lookups with 1hr TTL — insufficient for the new features. D1 also handles dedup via UNIQUE constraints natively. Cost is negligible at this scale (~20k rows).

### D007: Workers AI (Llama 3.2 3B) over OpenAI API (2026-06-21)
**Decision:** Use `@cf/meta/llama-3.2-3b-instruct` via Workers AI binding for trading commentary.
**Reasoning:** Tight integration with Workers runtime — no API keys, no external HTTP calls, no latency from a separate provider. The 3B model is fast (~500ms on cold start), cheap (~$0.001/call), and sufficient for analysis of structured numeric data. Falls back gracefully with "not available" if the AI binding is missing.

### D008: Smart Placement for API-proximity execution (2026-06-21)
**Decision:** Use `placement = { mode = "smart" }` to deploy the Worker near Polymarket API servers, not near users.
**Reasoning:** The worker spends the vast majority of its time on server-side data fetching (Polymarket API pagination), not serving HTML/JSON to the browser. Smart Placement minimizes data-fetch latency. The HTML dashboard is simple text so user-proximity is irrelevant.

### D009: Multi-module Worker architecture (2026-06-21)
**Decision:** Split the Worker into `index.js` (routing/D1), `data.js` (P&L math), `ai.js` (commentary), `html.js` (UI template).
**Reasoning:** The single-file approach became unwieldy at ~800 lines. Each module has a single responsibility, making testing and iteration easier. ES modules in Workers support named exports naturally.

### D010: Individual INSERT via db.batch() over multi-VALUES (2026-06-21)
**Decision:** Use individual prepared statements batched via `db.batch()` instead of single INSERT with multiple VALUES rows.
**Reasoning:** SQLite has a 999 variable limit per query. A multi-VALUES INSERT with 15 columns exceeds that limit at just 67 rows. D1's `db.batch()` accepts up to 100 individual statements per call, which avoids the limit entirely for any batch size.
     **Reasoning:** [Why this was chosen]
     **Alternatives considered:** [What else was considered and why it was rejected]
     **Consequences:** [What this means for the codebase going forward]

     Example:

     ### Use PostgreSQL for all persistent storage
     **Date:** 2024-03-01
     **Status:** Active
     **Decision:** All persistent data lives in PostgreSQL, no secondary databases.
     **Reasoning:** Simplicity — one database to operate, backup, and reason about.
     **Alternatives considered:** Redis for sessions (rejected — adds operational complexity for minimal gain), MongoDB for user preferences (rejected — relational model fits our data).
     **Consequences:** No caching layer at database level. Application-level caching if needed.

     Example of a superseded entry:

     ### Use Redis for session storage
     **Date:** 2024-02-15
     **Status:** Superseded by "Use PostgreSQL for all persistent storage"
     **Decision:** Store user sessions in Redis.
     **Reasoning:** Fast read/write for session data.
     **Alternatives considered:** PostgreSQL (chosen later due to operational simplicity).
     **Consequences:** ~~Requires Redis infrastructure alongside PostgreSQL.~~
     **Superseded because:** Maintaining two data stores added operational complexity
     without meaningful performance benefit for our scale. -->
