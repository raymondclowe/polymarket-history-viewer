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
last_updated: 2026-06-21  # Added polymarket.com/event links to market tables
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Two versions exist:**
1. **Streamlit app** (`app.py` + `data_loader.py` + `data_processor.py`) — full-featured Python dashboard on port 8501
2. **Cloudflare Worker** (`worker/src/index.js`) — standalone SPA with interactive charts (Chart.js), identical P&L logic, deployed to Cloudflare Workers

**Working in both versions:**
- Live API data loading with date-window pagination (7-day windows, 1000/page, bypasses 4000-offset ceiling)
- Validation layer (reject bad trades, non-trade events zeroed)
- P&L computation per coin, timeframe, and market
- Interactive filters (coin, timeframe, date range presets)
- Market drill-down table with individual trade details
- KV caching in Worker (1hr TTL)

**Worker-specific:**
- Chart.js bar charts for P&L by coin and timeframe
- Single-file deploy (HTML/CSS/JS all in `worker/src/index.js`)
- Routes: `GET /` (dashboard), `GET /api/data?wallet=0x...&force=1` (JSON)

**Not yet built:**
- Multi-wallet comparison mode
- CSV import in Worker version
- Automated tests
- Time-series P&L chart (cumulative P&L over time)

**Known issues:**
- Worker deploy requires `wrangler deploy` with OAuth login to Cloudflare
- Timeframe extraction from title strings is heuristic and may misclassify
- No pagination in market detail table (all rows rendered in memory)

**Recently fixed:**
- **Market links** — Market names in table and drill-down header now link to `polymarket.com/event/{slug}`
- **Date-window pagination** — bypasses 4000-offset API ceiling via `start`/`end` Unix timestamps. 20,679 rows, P&L -$1,283.97
- **P&L bugs** — dedup by txhash, PAGE_SIZE=200 truncation, missing display-layer time filter, non-trade event P&L leakage
- **Cloudflare Worker built** — full SPA with interactive charts, same logic as Streamlit, deployed live

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
