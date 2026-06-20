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
last_updated: 2026-06-20  # date-window pagination implemented
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**
- Live API data loading with 4 defense layers (cache, retry, dedup, validation)
- CSV import from `data/<wallet>/` folders with auto-format detection
- P&L computation per coin, timeframe, and market
- Streamlit UI with sidebar filters, summary cards, and drill-down
- CSV export of filtered data and market summaries

**Not yet built:**
- Multi-wallet comparison mode
- Charts/visualizations (P&L over time, distribution)
- Wallet address validation
- Automated tests

**Known issues:**
- CSV format detection assumes Buy column exists — may fail on exotic formats
- Timeframe extraction from title strings is heuristic and may misclassify
- No pagination in market detail table (all rows rendered in memory)

**Recently fixed:**
- Coin/timeframe multiselect filters not applying — Streamlit keeps `default=["ALL"]` in the selection when user picks a specific option, making the `"ALL" not in selected` check always False. Fixed by stripping `"ALL"` from the selection when specific options are also chosen.
- P&L inflated by non-trade event types — DEPOSIT, WITHDRAWAL, TRANSFER were counted as P&L. Fixed by zeroing `signed_usdc` for these types in both API and CSV paths. MERGE correctly remains P&L-positive (give token pair, get $1 back). SPLIT correctly treats as money-out (like BUY).
- **P&L inflated by time-window asymmetry** — `fetch_all_activity()` stopped paginating at `oldest_ts < since_ts`, so buys outside the selected date range were never loaded, but their exits (redeems/merges) inside the range appeared as pure $1-per-token income. Fix: removed time-window filtering at the data-loading layer entirely.
- **P&L inflated by dedup on transactionHash** — `deduplicate_rows()` grouped by `transactionHash` and dropped all but the first row per hash. Polymarket batches multiple fills (in different markets!) into a single on-chain tx, so dedup by txhash silently discarded $193 of real P&L data. Fix: removed dedup step entirely from `get_activity()`. Only truly identical rows (all columns equal) could be deduped, which never occurs in practice. Combined with PAGE_SIZE fix, P&L changed from +$47.72 to -$145.23.
- **P&L inflated by PAGE_SIZE=200** — `fetch_all_activity()` used PAGE_SIZE=200, requiring 20 API calls to get 4000 rows. The `if len(page) < PAGE_SIZE: break` guard on the last partial page (136 rows) truncated real data. Additionally `limit=200` vs `limit=1000` means more pages with larger gaps. Fix: PAGE_SIZE=1000, removed partial-page break.
- **Time presets all showing same P&L** — display-layer time filter was missing for API data. CSV path had time filtering but API path didn't, so all presets (Today, Last 7d, All time) showed identical values. Fix: added universal `df = df[(timestamp >= since_ts) & (timestamp <= until_ts)]` after both sources load. Cache still holds ALL data; filtering happens at display.
- **Polymarket API has hard 4000-row offset ceiling per query** — NOT a total data limit. Fix: date-window pagination using `start`/`end` Unix-timestamp params. `fetch_all_activity()` now pre-scans in 30-day leaps to find first activity, then walks forward in 7-day windows, paginating with offset within each. Result: 20,679 rows (5x more), P&L -$1,283.97 vs portfolio -$1,529.72.

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
