---
name: agents
description: Always-loaded project anchor. Read this first. Contains project identity, non-negotiables, commands, and pointer to ROUTER.md for full context.
last_updated: 2026-06-19
---

# Polymarket History Viewer

## What This Is
A Streamlit P&L dashboard for Polymarket trade history — load from live API or CSV files, slice by coin/timeframe/market, and drill down to individual trades.

## Non-Negotiables
- **`uv run` or nothing.** Never use raw `python` or `pip install`. All execution through `uv run`.
- **Keep it simple.** This is a read-only analytics dashboard — no over-engineering.
- **Data integrity over speed.** Validate every row. Reject bad data. Cache defensively.
- **Live API is primary, CSV is fallback.** The API is unreliable (lag, duplicates, stale data) — validate aggressively but prefer it.
- **Fix everything you see.** Preexisting bugs are still bugs. Fix them.

## Commands
- Dev: `uv run streamlit run app.py`
- Lint: `uv run ruff check .`
- Sync: `uv sync`

## After Every Task
After meaningful work, run GROW:
- Ground: what changed in reality?
- Record: update `.mex/ROUTER.md` and relevant `.mex/context/` files
- Orient: create or update a `.mex/patterns/` runbook if this can recur
- Write: bump `last_updated` on changed scaffold files and run `mex log` when rationale matters

## Navigation
At the start of every session, read `.mex/ROUTER.md` before doing anything else.
For full project context, patterns, and task guidance — everything is there.
