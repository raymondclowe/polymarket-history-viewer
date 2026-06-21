---
name: router
description: Session bootstrap and navigation hub. Read at the start of every session before any task. Contains project state, routing table, and behavioural contract.
edges:
  - target: context/architecture.md
    condition: when working on system design, integrations, or understanding how components connect
  - target: context/stack.md
    condition: when working with specific technologies, libraries, or making tech decisions
  - target: context/conventions.md
    condition: when writing new code, reviewing code, or unsure about project patterns
  - target: context/decisions.md
    condition: when making architectural choices or understanding why something is built a certain way
  - target: context/setup.md
    condition: when setting up the dev environment or running the project for the first time
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-06-21  # D1 persistent storage, Workers AI, cron, time-series chart, multi-module refactor
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Two versions exist:**
1. **Streamlit app** (`app.py` + `data_loader.py` + `data_processor.py`) — full-featured Python dashboard on port 8501
2. **Cloudflare Worker** (`worker/`) — standalone SPA with interactive charts (Chart.js), deployed to Cloudflare Workers

**Worker architecture (multi-module):**
- `worker/src/index.js` — Main handler: routing, D1 operations, Polymarket API fetch, cron scheduler
- `worker/src/data.js` — Pure P&L computation functions (shared server & client-side)
- `worker/src/ai.js` — Workers AI commentary using @cf/meta/llama-3.2-3b-instruct
- `worker/src/html.js` — Full SPA dashboard HTML/CSS/JS as template string
- `worker/schema.sql` — D1 database schema (trades, wallets, daily_pnl tables)
- `worker/wrangler.toml` — Config with D1 binding (`DB`), AI binding, Smart Placement, daily cron

**Key infrastructure:**
- **D1 persistent storage** — trades cached in SQLite, UNIQUE(wallet+tx_hash) for idempotent re-fetches
- **Workers AI** — per-market and overall trading commentary, ~$0.001/call
- **Cron trigger** — daily refresh of known wallets at 6am UTC
- **Smart Placement** — worker runs near Polymarket API servers for faster data fetches
- **Date-window pagination** — bypasses 4000-offset API ceiling via start/end Unix timestamps
- **3-column chart layout** — P&L by coin (bar), P&L by timeframe (bar), P&L Over Time with cumulative line

**Worker routes:**
- `GET /` — HTML dashboard (Chart.js SPA)
- `GET /api/data?wallet=0x...&force=1` — JSON P&L data (from D1 or API)
- `GET /api/timeseries?wallet=0x...` — Daily P&L from D1
- `GET /api/ai/market?wallet=0x...&slug=...` — AI market commentary
- `GET /api/ai/summary?wallet=0x...&days=...` — AI overall summary

**Not yet built:**
- Multi-wallet comparison mode
- CSV import in Worker version
- Automated tests
- Wallet pagination in cron (currently limited to 10 stale wallets)

**Known issues:**
- Timeframe extraction from title strings is heuristic and may misclassify
- No pagination in market detail table (all rows rendered in memory)
- First fetch from API can take 30-60s (20k rows across 7-day windows)
- AI commentary only available after D1 populates (first fetch must complete)

**Recently fixed:**
- **D1 SQLITE_ERROR fix** — Changed batch INSERT from multi-VALUES (exceeded 999 var limit) to individual prepared statements via db.batch() (50 stmts/call)
- **D1 + AI + Cron infrastructure** — Complete rewrite: multi-module architecture, D1 persistent storage, Workers AI commentary, Smart Placement, daily cron refresh
- **Polymarket.com links** — Market names link to polymarket.com/event/{slug} in table and drill-down headers
- **20k+ rows fetched** — Date-window pagination working, all P&L computed correctly

## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it. Narrate what you load: "Loading architecture context..."
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. If the why matters, run `mex log --type decision "<what changed and why>"` or `mex log "<note>"`.

## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it. Narrate what you load: "Loading architecture context..."
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. If the why matters, run `mex log --type decision "<what changed and why>"` or `mex log "<note>"`.
