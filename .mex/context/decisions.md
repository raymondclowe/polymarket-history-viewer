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
last_updated: 2026-06-19
---

# Decisions

## Decision Log

### D001: urllib over requests (2026-06-19)
**Decision:** Use stdlib `urllib.request` for HTTP calls, not `requests`.
**Reasoning:** Matches convention in `polymarket-trader-emulation`. Avoids an extra dependency. The API surface is tiny (one GET endpoint with query params).

### D002: JSON file cache over SQLite (2026-06-19)
**Decision:** Cache API responses as JSON files in `cache/<wallet>.json`.
**Reasoning:** Simple, debuggable, version-control-friendly (`.gitkeep` + `.gitignore` pattern). No need for a database in a read-only dashboard.

### D003: 4-layer defense for API data (2026-06-19)
**Decision:** Every API fetch goes through cache → retry → dedup → validate pipeline.
**Reasoning:** Polymarket Data API is unreliable — returns duplicates, stale data, and sometimes 429s. Defensive layering prevents bad data from reaching the UI.

### D004: Coin extracted from slug + title fallback (2026-06-19)
**Decision:** Parse `slug` first (e.g., `btc-5m-up-or-down-...` → BTC), fall back to regex on `title`.
**Reasoning:** Slugs are machine-generated and reliable. Titles are human-written and vary in format. Double extraction maximizes coverage.

### D005: CSV price derived from usdcAmount/size (2026-06-19)
**Decision:** Derive `price` as `abs(usdcAmount) / size` from CSV rows that lack an explicit price column.
**Reasoning:** Polymarket CSV exports have `usdcAmount` and `size` (token amount). Price is computable from those two fields. This avoids requiring users to have a specific CSV format.
     Do not document every decision — only ones where "why" matters.
     Minimum 3 decision entries during initial population. If you cannot identify 3,
     write placeholder entries with "[TO DETERMINE]" and explain what decision is pending.

     Format for each entry:

     ### [Decision Title]
     **Date:** YYYY-MM-DD (check git history for real dates when possible)
     **Status:** Active | Superseded by [title]
     **Decision:** [What was decided, in one sentence]
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
