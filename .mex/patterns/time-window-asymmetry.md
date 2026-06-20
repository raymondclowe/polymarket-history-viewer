---
name: time-window-asymmetry
description: Preventing inflated P&L from incomplete cost basis when fetching Polymarket activity data
applies_to: data_loader.py, app.py
last_updated: 2026-06-20
---

# Time-Window Asymmetry (P&L Inflation Bug)

## Symptom
P&L shows profit even when the user consistently loses money over time. The discrepancy grows when looking at shorter time windows (e.g., "Last 7 days" shows +$78, but all-time shows +$20).

## Root Cause
The Polymarket activity API paginates in DESC order (newest first). `fetch_all_activity()` stopped paginating when `oldest_ts < since_ts`, meaning:
- Exits (REDEEM, MERGE) within the time window were fetched → counted as +$1 per token income
- Buys from BEFORE the time window were NOT fetched → missing cost basis
- Result: exits appear as pure profit instead of net P&L against the original buy cost

## Fix Applied
Time-window filtering was removed from the data-loading layer entirely:

1. **`data_loader.py:fetch_all_activity()`** — removed the `if oldest_ts < since_ts: break` condition. Now fetches all pages up to MAX_PAGES regardless of time window.

2. **`data_loader.py:get_activity()`** — removed all `validate_time_window()` calls. Returns ALL cached or fetched data unfiltered.

3. **`app.py:_cached_api_fetch()`** — removed `since_ts`/`until_ts` parameters. The Streamlit `@st.cache_data` decorator now has a stable cache key across time-preset changes.

4. **`app.py` display layer** — after loading complete data from cache/API, a time filter is applied:
   ```python
   df = df[(df["timestamp"] >= since_ts) & (df["timestamp"] <= until_ts)]
   ```
   This means different time presets show different P&L values. "All time" uses `since=2020-01-01` so no rows are filtered out.

## Key Principle
**Load everything, filter at display.** The cache holds ALL available data for complete cost basis. Time-window filtering happens at the UI layer — each preset selects a different subset of rows. "All time" is the ground truth; shorter windows show only activity in that period. Shorter windows may show inflated P&L if buys from outside the window don't have matching exits counted, but this is a known trade-off: the alternative (filtering at load time) produced wildly wrong +$78 P&L for 7d when the real loss was -$69.

## To Verify
1. Clear cache (`cache/<wallet>.json`)
2. Load the app — the cache fills with ALL available API data
3. **"All time"** should show the ground-truth P&L (e.g. -$145.23)
4. **"Last 7 days"** should show a different (usually smaller magnitude) P&L — the subset of activity in that window
5. Switching presets should change the displayed P&L, trade count, and market count
