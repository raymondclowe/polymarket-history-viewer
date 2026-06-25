---
name: P&L Distribution Chart — Specification
about: Intended changes from `ac39f74` (broken) extracted from diff, to be applied properly one at a time.
base_commit: 93c4206 (percent vs dollar)
target_commit: ac39f74 (update)
status: spec
created: 2026-06-25
---

# Specification: Market P&L Distribution + CSV Export + Visual Polish

This document captures the **intended changes** in commit `ac39f74` relative to `93c4206`.
The commit failed to deploy (syntax error) so we decompose into atomic pieces and re-apply.

---

## Change 1: Market P&L Distribution Chart (Box-Plot Style)

**File:** `worker/src/html.js`

### 1a. HTML — New card section

Insert after the existing chart card (P&L Over Time):

```html
<!-- Market P&L Distribution -->
<div class="card">
  <h2>Market P&amp;L Distribution by Coin <span style="font-weight:400;color:#64748b;font-size:0.75rem;">— min ★ median ◇ mean ▯ max</span></h2>
  <div class="chart-wrap" style="height:400px;"><canvas id="marketDistChart"></canvas></div>
</div>
```

### 1b. JS — Chart variable

Add to the variable declarations block at the top of the `<script>`:

```js
let marketDistChart = null;
```

### 1c. JS — renderAll() wiring

Add after `renderCharts()` call:

```js
renderMarketDistChart();
```

### 1d. JS — New function `renderMarketDistChart()`

Full function that:
- Calls `computePerMarketPnlByCoinJs(filteredRows)` to get per-coin distributions
- Renders a bar chart with IQR (Q1–Q3) as bars
- Draws whiskers (min–max lines with caps)
- Draws median as a diamond (`★`)
- Draws mean as a yellow circle (`◇`)
- Respects `pctMode` toggle
- Custom Chart.js plugin for the overlay elements
- Custom legend with symbols
- Tooltip shows all six stats (min, Q1, median, mean, Q3, max)

### 1e. JS — New function `computePerMarketPnlByCoinJs(rows)`

Groups all trades by coin → per-market P&L → computes stats:
- min, max, mean, median, Q1, Q3, count, invested
- Sorted by count descending

---

## Change 2: Summary Card — P&L Mini-Bar

**File:** `worker/src/html.js` — `renderSummary()` function

Add a small horizontal bar under the Total P&L value showing magnitude:
- Bar container: 4px height, rounded, dark background
- Inner bar: green if positive, red if negative
- Width: `Math.min(100, |P&L| / invested * 100)`%

---

## Change 3: Market Table — P&L Gradient Bar Backgrounds

**File:** `worker/src/html.js` — `renderMarketTable()` function

For each market row's P&L cell:
- Compute `maxAbsPnl` across all markets
- Each cell gets a gradient background:
  - Positive P&L: green tint fills from left
  - Negative P&L: red tint fills from right
- Width proportional to `|P&L| / maxAbsPnl`

---

## Change 4: Drill-Down Table — P&L Gradient Bar Backgrounds

**File:** `worker/src/html.js` — `drillDown()` function

Same gradient treatment as the market table, but per-trade:
- `maxAbsDrill` computed from `t.signed_usdc`
- Each row's P&L cell gets proportional green/red gradient background

---

## Change 5: CSV Export

**File:** `worker/src/html.js`

### 5a. Export CSV button in Market Details card h2

```html
<button class="btn btn-outline btn-sm" id="exportMktCsvBtn" style="float:right;font-size:0.75rem;padding:4px 10px;">⬇ CSV</button>
```

### 5b. Export CSV button in drill-down h3

```html
<button class="btn btn-outline btn-sm" ... onclick="exportCsv('drillTable','drill_trades.csv')">⬇ CSV</button>
```

### 5c. Drill-down table gets `id="drillTable"`

### 5d. New function `exportCsv(tableId, filename)`

- Reads table headers and body rows
- Strips sort arrow characters
- Escapes quotes, wraps cells in quotes
- Creates Blob download

### 5e. Event listener

```js
document.getElementById("exportMktCsvBtn").addEventListener("click", () => exportCsv("marketTable", "markets.csv"));
```

---

## Change 6: Reference / Design Spec File (Non-Deployed)

**File:** `worker/_page.html`

Full static snapshot of the rendered HTML output — the entire page as it should look.
This is **not** deployed or served; it's a design reference to diff against during development.

---

## Change 7: Worker Check Script (Non-Deployed)

**File:** `worker/_check_js.py`

Python script to validate/parse-check the worker JavaScript files for syntax errors
before deploying. Helps catch problems like the one that broke `ac39f74`.

---

## Change 8: Diagnostic Script Tweaks (Non-Worker)

**Files:**
- `_csv_diag.py` — minor diagnostics update
- `_diagnose_pnl.py` — minor update
- `_full_fetch.py` — minor update
- `_verify_prod.py` — new or updated verification logic
- `_week_check.py` — minor cleanup

---

## Change 9: MEX Documentation

- `.mex/ROUTER.md` — update
- `.mex/patterns/pnl-magnitude-bars.md` — new pattern doc for the gradient bars
- `.mex/patterns/INDEX.md` — add new pattern

---

## Order of Re-Application

When ready to re-apply the worker changes, do them **one at a time** and deploy + verify after each:

| # | Change | Risk | Deploy-Verify |
|---|--------|------|---------------|
| 1 | `computePerMarketPnlByCoinJs()` + chart variable | Low (pure data fn) | ✅ |
| 2 | `renderMarketDistChart()` + box-plot Chart.js plugin | Medium (complex chart) | ✅ |
| 3 | HTML card for distribution chart + renderAll() wiring | Low | ✅ |
| 4 | CSV export (`exportCsv` function + buttons) | Low | ✅ |
| 5 | Summary card mini-bar | Low | ✅ |
| 6 | Market table gradient bars | Low (style only) | ✅ |
| 7 | Drill-down gradient bars + `id="drillTable"` | Low (style only) | ✅ |
| 8 | Diagnostic scripts + MEX docs | None | N/A |
