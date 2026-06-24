---
name: time-presets-api-fetch
description: Time preset buttons must trigger API fetches, not just client-side filtering. Client-side filtering cannot show data that was never loaded from the API.
last_updated: 2026-06-21
---

# Time Presets Must Trigger API Fetch

## The Problem
The time preset buttons (All Time, Last 24h, Last 7 Days, Last 30 Days) were doing **only client-side filtering** — changing `currentDays` and calling `renderAll()`. This meant that clicking "All Time" after loading 7 days of data only showed 7 days of data (re-labeled as "all time"), giving completely wrong KPIs.

## Root Cause
Client-side state had two independent variables:
- `loadDays` — what was actually fetched from `/api/data?days=N`
- `currentDays` — a client-side cutoff used in `applyFilters()`

Time presets only changed `currentDays` without checking `loadDays`. If `currentDays > loadDays`, the cutoff extended beyond what was loaded but pointed at the same in-memory rows.

## Fix (Three Changes)
1. **Time preset handler** → calls `loadData(days)` (full API fetch) instead of just `currentDays = days`
2. **`resetFilters()`** → sets `currentDays = loadDays` (not hardcoded 7) so filter matches reality
3. **After `loadData()` completes** → calls `updateTimePresetButtons(loadDays)` to highlight correct preset

```
// BEFORE (broken):
currentDays = parseInt(e.target.dataset.days);
updateTimePresetButtons(currentDays);
renderAll();

// AFTER (fixed):
loadData(days);  // triggers full API fetch → resetFilters → renderAll
```

## Caveat
Every preset switch now triggers a new API fetch, even if the user already has enough data (e.g., switching from "All Time" to "Last 7 Days" when full data is already loaded). This is correct for data integrity but could be optimized in the future by checking: `if (requestedDays === 0 || requestedDays > loadDays) { loadData(requestedDays) } else { currentDays = requestedDays; renderAll() }`.
