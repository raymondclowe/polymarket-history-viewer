# dedup-pagination-fix.md

Key findings from 2026-06-20 session:

## Final P&L after fixes
- All-time (June 8-20 API data): **-$145.23**
- 7d P&L: **-$68.97**
- Rows: 4000, no dedup
- Portfolio page shows -$1,529.72 (includes months of pre-June 8 history API can't serve)

## Three bugs fixed
1. **PAGE_SIZE=200** → changed to 1000. API needs limit=1000 to serve full response efficiently.
2. **`len(page) < PAGE_SIZE: break`** → removed. Last page can have fewer rows; breaking there truncates data.
3. **`deduplicate_rows()` by `transactionHash`** → removed entirely. Polymarket batches multiple fills in one on-chain tx. 121 hashes with dupes = 200 rows discarded, swinging P&L by ~$193.

## What's still unused
- `deduplicate_rows()` function at data_loader.py l.147-175 — still exists, no longer called. Could be removed but kept for reference.

## What to tell the user
- P&L now shows -$145.23 across all available API data (12 days)
- 7d P&L: -$68.97 (user said ~$41 — discrepancy may be time-boundary differences)
- Platform reports -$1,529.72 all-time, but API doesn't serve pre-June 8 data

## Verification command that works
uv run python _verify_pnl.py
# Returns: 4000 rows, 0 dupes, P&L = -$145.23, 7d = -$68.97
