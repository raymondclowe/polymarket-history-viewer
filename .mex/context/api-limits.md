# Polymarket API limits

## Offset ceiling
- The activity API has a hard offset ceiling at ~4000 per query (not per wallet).
- `limit=1000` max; `limit=5000` silently capped to 1000.
- This applies PER QUERY — changing `sortDirection` or `limit` doesn't extend it.

## Date-window pagination (the fix)
- API supports `start` and `end` params with Unix-second timestamps.
- By slicing history into 7-day windows, each window stays under the offset ceiling.
- `fetch_all_activity()`:
  1. Pre-scans in 30-day leaps to find first activity (skips empty months fast)
  2. Walks forward in 7-day windows, paginating with offset within each
  3. Stops after 42 consecutive empty days (no more activity)

## Results for 0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e
- 20,679 rows (was 4,000 — 5.2x more)
- P&L: -$1,283.97 (was -$145.23; portfolio ground truth: -$1,529.72)
- Date range: March 11 → June 20, 2026 (wallet genesis to present)
