/**
 * html.js — The entire SPA dashboard UI as a template string.
 * Exported separately so index.js stays focused on routing.
 */

export const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Polymarket History Viewer</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
.container { max-width: 1300px; margin: 0 auto; padding: 20px; }
h1 { font-size: 1.5rem; margin-bottom: 4px; color: #f1f5f9; }
.subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 20px; }
.card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #334155; }
.card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

.input-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.input-row input { flex: 1; min-width: 300px; padding: 10px 14px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.9rem; }
.input-row input::placeholder { color: #64748b; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: all 0.2s; }
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover { background: #2563eb; }
.btn-sm { padding: 6px 14px; font-size: 0.8rem; }
.btn-outline { background: transparent; border: 1px solid #475569; color: #cbd5e1; }
.btn-outline:hover { background: #1e293b; border-color: #64748b; }
.btn-outline.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.btn-group { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }

.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.summary-item { text-align: center; padding: 16px; background: #0f172a; border-radius: 8px; }
.summary-item .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.summary-item .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
.value.green { color: #22c55e; }
.value.red { color: #ef4444; }
.value.gray { color: #94a3b8; }

.filter-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.filter-row label { font-size: 0.8rem; color: #94a3b8; display: block; margin-bottom: 4px; }
.filter-row select { padding: 8px 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.85rem; min-width: 140px; }

table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th { text-align: left; padding: 10px 12px; color: #64748b; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #334155; cursor: pointer; user-select: none; }
th:hover { color: #94a3b8; }
th .sort-arrow { display: inline-block; margin-left: 4px; font-size: 0.7rem; color: #64748b; }
th .sort-arrow.active { color: #3b82f6; }
td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
tr:hover { background: #1e293b; cursor: pointer; }
tr.selected { background: #1e3a5f; }
.pnl-pos { color: #22c55e; }
.pnl-neg { color: #ef4444; }

.chart-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-wrap { position: relative; height: 300px; }
.chart-wrap canvas { width: 100% !important; }

.filter-input { padding: 8px 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.85rem; min-width: 140px; }
.filter-input::placeholder { color: #64748b; }

.loader { text-align: center; padding: 40px; color: #64748b; }
.spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { color: #ef4444; padding: 12px; background: #450a0a; border-radius: 8px; margin: 12px 0; }
.info-banner { padding: 10px 14px; background: #1e293b; border-radius: 8px; color: #94a3b8; font-size: 0.8rem; margin-bottom: 12px; }

.drill-down { margin-top: 12px; }
.drill-down h3 { font-size: 0.95rem; margin-bottom: 8px; color: #cbd5e1; }
.drill-down .close-btn { float: right; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; }
td a:hover { text-decoration: underline !important; }

@media (max-width: 768px) { .chart-row-3 { grid-template-columns: 1fr; } .summary-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">
  <h1>📊 Polymarket History Viewer</h1>
  <p class="subtitle">P&L dashboard — live from Polymarket API</p>

  <div class="card">
    <div class="input-row">
      <input type="text" id="walletInput" placeholder="0x..." value="0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e">
      <button class="btn btn-primary" id="loadBtn">🔍 Load</button>
      <button class="btn btn-outline btn-sm" id="clearBtn">Clear &amp; Refresh</button>
    </div>
  </div>

  <div id="statusArea"></div>

  <div id="dashboard" style="display:none;">
    <div id="banner" class="info-banner"></div>

    <!-- Summary Cards -->
    <div class="summary-grid" id="summaryCards"></div>

    <!-- Time Presets & Filters -->
    <div class="card" style="margin-top:16px;">
      <div class="btn-group" id="timePresets">
        <button class="btn btn-outline btn-sm" data-days="0">All Time</button>
        <button class="btn btn-outline btn-sm" data-days="0.0417">Last 1h</button>
        <button class="btn btn-outline btn-sm" data-days="0.0833">Last 2h</button>
        <button class="btn btn-outline btn-sm" data-days="0.125">Last 3h</button>
        <button class="btn btn-outline btn-sm" data-days="0.25">Last 6h</button>
        <button class="btn btn-outline btn-sm" data-days="0.5">Last 12h</button>
        <button class="btn btn-outline btn-sm active" data-days="1">Last 24h</button>
        <button class="btn btn-outline btn-sm" data-days="7">Last 7 Days</button>
        <button class="btn btn-outline btn-sm" data-days="30">Last 30 Days</button>
      </div>
      <div class="filter-row">
        <div>
          <label>Coin</label>
          <select id="coinFilter"><option value="ALL">All Coins</option></select>
        </div>
        <div>
          <label>Timeframe</label>
          <select id="tfFilter"><option value="ALL">All Timeframes</option></select>
        </div>
        <div>
          <label>Type</label>
          <select id="typeFilter">
            <option value="ALL">All Types</option>
            <option value="TRADE">Trade</option>
            <option value="REDEEM">Redeem</option>
            <option value="MERGE">Merge</option>
            <option value="SPLIT">Split</option>
          </select>
        </div>
        <div>
          <label>Market Search</label>
          <input type="text" id="marketSearch" class="filter-input" placeholder="Search markets...">
        </div>
        <div>
          <label>From</label>
          <input type="date" id="dateFrom" class="filter-input">
        </div>
        <div>
          <label>To</label>
          <input type="date" id="dateTo" class="filter-input">
        </div>
        <div>
          <label>Format</label>
          <div style="display:flex;gap:2px;">
            <button class="btn btn-outline btn-sm active" id="fmtUsdBtn" style="border-radius:6px 0 0 6px;">$</button>
            <button class="btn btn-outline btn-sm" id="fmtPctBtn" style="border-radius:0 6px 6px 0;">%</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts: 3-column -->
    <div class="chart-row-3">
      <div class="card"><h2>P&L by Coin</h2><div class="chart-wrap"><canvas id="coinChart"></canvas></div></div>
      <div class="card"><h2>P&L by Timeframe</h2><div class="chart-wrap"><canvas id="tfChart"></canvas></div></div>
      <div class="card"><h2>P&L Over Time</h2><div class="chart-wrap"><canvas id="dailyChart"></canvas></div></div>
    </div>

    <!-- Market Table -->
    <div class="card">
      <h2>Market Details <span style="font-weight:400;color:#64748b;font-size:0.8rem;">— click a row to drill down</span></h2>
      <div style="max-height:500px;overflow-y:auto;">
        <table id="marketTable">
          <thead><tr>
            <th data-sort="display_name">Market <span class="sort-arrow">▾</span></th>
            <th data-sort="coin">Coin <span class="sort-arrow">▾</span></th>
            <th data-sort="timeframe">TF <span class="sort-arrow">▾</span></th>
            <th data-sort="pnl">P&amp;L <span class="sort-arrow">▾</span></th>
            <th data-sort="trade_count">Trades <span class="sort-arrow">▾</span></th>
            <th data-sort="win_rate" title="Percentage of transactions with positive cash flow (sells/redeems count as positive, buys as negative). A profitable buy+sell pair shows 50%. Not a trade win-rate.">Pos % <span class="sort-arrow">▾</span></th>
            <th data-sort="first_trade">First Trade <span class="sort-arrow">▾</span></th>
            <th data-sort="last_trade">Last Trade <span class="sort-arrow">▾</span></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <!-- Drill-down -->
    <div id="drillDown" class="card drill-down" style="display:none;"></div>
  </div>
</div>

<script>
// ──────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────

let allData = null;
let filteredRows = [];
let currentDays = 1;
let currentCoin = "ALL";
let currentTf = "ALL";
let currentType = "ALL";
let currentSearch = "";
let dateFrom = "";
let dateTo = "";
let coinChart = null;
let tfChart = null;
let dailyChart = null;
let selectedMarketKey = null;
let loadDays = 1;
let pctMode = false;
let sortColumn = "last_trade";
let sortDirection = "desc";

// ──────────────────────────────────────────────────────────────
// API call
// ──────────────────────────────────────────────────────────────

async function loadData(days) {
  const wallet = document.getElementById("walletInput").value.trim();
  if (!wallet || wallet.length < 10) {
    showStatus("Enter a valid wallet address", "error");
    return;
  }

  const isFullHistory = days === 0;
  loadDays = days;
  showStatus('<span class="spinner"></span> Loading ' + (isFullHistory ? "full history..." : "last " + days + " days..."), "loader");
  document.getElementById("dashboard").style.display = "none";

  try {
    const url = \`/api/data?wallet=\${encodeURIComponent(wallet)}\${days > 0 ? "&days=" + days : ""}\`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error) { showStatus(data.error, "error"); return; }

    allData = data;
    resetFilters();
    updateTimePresetButtons(loadDays);
    renderAll();
    document.getElementById("dashboard").style.display = "block";
    showStatus("", "");
  } catch (e) {
    showStatus("Failed to load: " + e.message, "error");
  }
}

function resetFilters() {
  currentDays = loadDays;
  currentCoin = "ALL";
  currentTf = "ALL";
  currentType = "ALL";
  currentSearch = "";
  dateFrom = "";
  dateTo = "";
  sortColumn = "last_trade";
  sortDirection = "desc";
  selectedMarketKey = null;
  document.getElementById("coinFilter").value = "ALL";
  document.getElementById("tfFilter").value = "ALL";
  document.getElementById("typeFilter").value = "ALL";
  document.getElementById("marketSearch").value = "";
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
}

// ──────────────────────────────────────────────────────────────
// Filtering
// ──────────────────────────────────────────────────────────────

function applyFilters() {
  if (!allData) { filteredRows = []; return; }
  let rows = allData.rows;
  const now = Math.floor(Date.now() / 1000);
  if (currentDays > 0) {
    const cutoff = now - currentDays * 86400;
    rows = rows.filter(r => r.timestamp >= cutoff);
  }
  if (currentCoin !== "ALL") rows = rows.filter(r => r.coin === currentCoin);
  if (currentTf !== "ALL") rows = rows.filter(r => r.timeframe === currentTf);
  if (currentType !== "ALL") rows = rows.filter(r => r.type === currentType);
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    rows = rows.filter(r => (r.slug || "").toLowerCase().includes(q) || (r.title || "").toLowerCase().includes(q));
  }
  if (dateFrom) {
    const fromTs = Math.floor(new Date(dateFrom + "T00:00:00Z").getTime() / 1000);
    rows = rows.filter(r => r.timestamp >= fromTs);
  }
  if (dateTo) {
    const toTs = Math.floor(new Date(dateTo + "T23:59:59Z").getTime() / 1000);
    rows = rows.filter(r => r.timestamp <= toTs);
  }

  // Drop orphan redeems: a redeem with no other rows for the same market
  // in the filtered set is settling a position from outside this window
  // and produces misleading P&L that doesn't match the visible trades.
  const slugsWithActivity = new Set();
  for (const r of rows) {
    if (r.type !== "REDEEM" && r.slug) slugsWithActivity.add(r.slug);
  }
  rows = rows.filter(r => {
    if (r.type !== "REDEEM") return true;
    return !r.slug || slugsWithActivity.has(r.slug);
  });

  filteredRows = rows;
}

// ──────────────────────────────────────────────────────────────
// Sorting
// ──────────────────────────────────────────────────────────────

function sortMarkets(mkts) {
  const sorted = [...mkts];
  sorted.sort((a, b) => {
    let va = a[sortColumn];
    let vb = b[sortColumn];
    if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
    if (va == null) va = "";
    if (vb == null) vb = "";
    if (va < vb) return sortDirection === "asc" ? -1 : 1;
    if (va > vb) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}

function updateSortArrows() {
  document.querySelectorAll("#marketTable th[data-sort]").forEach(th => {
    const arrow = th.querySelector(".sort-arrow");
    if (!arrow) return;
    const key = th.dataset.sort;
    if (key === sortColumn) {
      arrow.textContent = sortDirection === "asc" ? "▴" : "▾";
      arrow.style.color = "#3b82f6";
    } else {
      arrow.textContent = "▾";
      arrow.style.color = "#64748b";
    }
  });
}

// ──────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────

function renderAll() {
  applyFilters();
  renderBanner();
  renderSummary();
  renderCharts();
  renderMarketTable();
  closeDrillDown();
}

function renderBanner() {
  const b = document.getElementById("banner");
  const ts = filteredRows.map(r => r.timestamp).filter(t => t > 0);
  const range = ts.length > 0
    ? \`\${new Date(Math.min(...ts)*1000).toISOString().slice(0,10)} → \${new Date(Math.max(...ts)*1000).toISOString().slice(0,10)}\`
    : "";
  const partial = loadDays > 0 && allData && allData.rows.length < 21000
    ? \` · <a href="#" id="loadAllLink" style="color:#3b82f6;">Load Full History</a>\`
    : "";
  b.innerHTML = \`📅 Data range: \${range} (\${filteredRows.length.toLocaleString()} of \${allData ? allData.rows.length.toLocaleString() : "?"} rows)\${partial}\`;

  const link = document.getElementById("loadAllLink");
  if (link) link.addEventListener("click", (e) => { e.preventDefault(); loadData(0); });
}

function renderSummary() {
  const pnl = computeOverallPnlJs(filteredRows);
  const color = (v) => v > 0 ? "green" : v < 0 ? "red" : "gray";
  document.getElementById("summaryCards").innerHTML = \`
    <div class="summary-item"><div class="label">Total P&amp;L</div><div class="value \${color(pnl.total_pnl)}">\${_fmtPnl(pnl.total_pnl, pnl.total_invested)}</div></div>
    <div class="summary-item"><div class="label">Trades</div><div class="value gray">\${pnl.trade_count.toLocaleString()}</div></div>
    <div class="summary-item"><div class="label">Markets</div><div class="value gray">\${pnl.unique_markets}</div></div>
    <div class="summary-item"><div class="label" title="Percentage of transactions with positive cash flow (sells/redeems count as positive, buys as negative). Not a trade win-rate.">Pos %</div><div class="value gray">\${(pnl.win_rate*100).toFixed(1)}%</div></div>
    <div class="summary-item"><div class="label">W / L</div><div class="value gray">\${pnl.win_count} / \${pnl.loss_count}</div></div>
  \`;
}

function renderCharts() {
  const coinPnl = computePerCoinPnlJs(filteredRows);
  const tfPnl = computePerTimeframePnlJs(filteredRows);
  const dailyPnl = computeDailyPnlJs(filteredRows);
  const cumSum = (() => { let s = 0; return dailyPnl.map(d => { s += d.pnl; return s; }); })();

  if (coinChart) coinChart.destroy();
  const coinHasInvested = coinPnl.some(c => c.invested);
  coinChart = new Chart(document.getElementById("coinChart").getContext("2d"), {
    type: "bar",
    data: { labels: coinPnl.map(c => c.coin), datasets: [{ label: pctMode && coinHasInvested ? "P&L (%)" : "P&L (USD)", data: pctMode && coinHasInvested ? coinPnl.map(c => c.invested ? c.pnl / c.invested * 100 : NaN) : coinPnl.map(c => c.pnl), backgroundColor: coinPnl.map(c => c.pnl >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"), borderColor: coinPnl.map(c => c.pnl >= 0 ? "#22c55e" : "#ef4444"), borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } }, y: { ticks: { color: "#94a3b8", callback: pctMode && coinHasInvested ? (v => v.toFixed(1) + "%") : (v => "$" + v.toLocaleString()) }, grid: { color: "#1e293b" } } } },
  });

  if (tfChart) tfChart.destroy();
  const tfHasInvested = tfPnl.some(t => t.invested);
  tfChart = new Chart(document.getElementById("tfChart").getContext("2d"), {
    type: "bar",
    data: { labels: tfPnl.map(t => t.timeframe), datasets: [{ label: pctMode && tfHasInvested ? "P&L (%)" : "P&L (USD)", data: pctMode && tfHasInvested ? tfPnl.map(t => t.invested ? t.pnl / t.invested * 100 : NaN) : tfPnl.map(t => t.pnl), backgroundColor: tfPnl.map(t => t.pnl >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"), borderColor: tfPnl.map(t => t.pnl >= 0 ? "#22c55e" : "#ef4444"), borderWidth: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } }, y: { ticks: { color: "#94a3b8", callback: pctMode && tfHasInvested ? (v => v.toFixed(1) + "%") : (v => "$" + v.toLocaleString()) }, grid: { color: "#1e293b" } } } },
  });

  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(document.getElementById("dailyChart").getContext("2d"), {
    type: "line",
    data: {
      labels: dailyPnl.map(d => d.date),
      datasets: [
        { label: "Daily P&L", data: dailyPnl.map(d => d.pnl), backgroundColor: "rgba(59,130,246,0.1)", borderColor: "#3b82f6", borderWidth: 1, pointRadius: 2, fill: false, tension: 0.1, yAxisID: "y" },
        { label: "Cumulative", data: cumSum, borderColor: "#22c55e", borderWidth: 2, pointRadius: 0, fill: false, tension: 0.1, yAxisID: "y1" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#94a3b8", boxWidth: 12, padding: 8, font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxTicksLimit: 10 }, grid: { color: "#1e293b" } },
        y: { position: "left", ticks: { color: "#94a3b8", callback: v => "$" + v.toLocaleString() }, grid: { color: "#1e293b" }, title: { display: true, text: "Daily", color: "#3b82f6" } },
        y1: { position: "right", ticks: { color: "#94a3b8", callback: v => "$" + v.toLocaleString() }, grid: { display: false }, title: { display: true, text: "Cumulative", color: "#22c55e" } },
      },
    },
  });

  // Rebuild filter dropdowns preserving selections
  const savedCoin = currentCoin;
  const savedTf = currentTf;
  const allCoins = [...new Set(allData.rows.map(r => r.coin).filter(c => c !== "OTHER"))].sort();
  const allTfs = [...new Set(allData.rows.map(r => r.timeframe).filter(t => t !== "N/A"))].sort();
  document.getElementById("coinFilter").innerHTML = '<option value="ALL">All Coins</option>' + allCoins.map(c => \`<option value="\${c}">\${c}</option>\`).join("");
  document.getElementById("tfFilter").innerHTML = '<option value="ALL">All Timeframes</option>' + allTfs.map(t => \`<option value="\${t}">\${t}</option>\`).join("");
  document.getElementById("coinFilter").value = savedCoin;
  document.getElementById("tfFilter").value = savedTf;
}

function renderMarketTable() {
  let mkts = computePerMarketPnlJs(filteredRows);
  mkts = sortMarkets(mkts);
  updateSortArrows();

  const pnlClass = (v) => v >= 0 ? "pnl-pos" : "pnl-neg";
  const tsStr = (ts) => ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
  const tbody = document.querySelector("#marketTable tbody");
  const wrPct = (v) => (v * 100).toFixed(0) + "%";

  tbody.innerHTML = mkts.map((m, i) => \`
    <tr class="\${m.key === selectedMarketKey ? "selected" : ""}" data-key="\${m.key.replace(/"/g,"&quot;")}" data-idx="\${i}">
      <td>\${m.slug ? \`<a href="https://polymarket.com/event/\${escHtml(m.slug)}" target="_blank" style="color:#3b82f6;text-decoration:none;">\${escHtml(m.display_name)}</a>\` : escHtml(m.display_name)}</td>
      <td>\${m.coin}</td>
      <td>\${m.timeframe}</td>
      <td class="\${pnlClass(m.pnl)}">\${_fmtPnl(m.pnl, m.invested)}</td>
      <td>\${m.trade_count}</td>
      <td>\${wrPct(m.win_rate)}</td>
      <td>\${tsStr(m.first_trade)}</td>
      <td>\${tsStr(m.last_trade)}</td>
    </tr>
  \`).join("");

  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", () => {
      drillDown(tr.dataset.key.replace(/&quot;/g, '"'));
    });
  });
}

function drillDown(key) {
  selectedMarketKey = key;
  const trades = filteredRows.filter(r => (r.slug || r.title || "(unknown)") === key).sort((a, b) => a.timestamp - b.timestamp);
  if (trades.length === 0) return;

  const pnlClass = (v) => v >= 0 ? "pnl-pos" : "pnl-neg";
  const pnl = trades.reduce((s, r) => s + r.signed_usdc, 0);
  const invested = trades.filter(r => (r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT").reduce((s, r) => s + r.usdcSize, 0);
  const slug = trades[0].slug || key;

  const d = document.getElementById("drillDown");
  d.style.display = "block";
  d.innerHTML = \`
    <button class="close-btn" onclick="closeDrillDown()">✕</button>
    <h3>\${slug ? \`<a href="https://polymarket.com/event/\${escHtml(slug)}" target="_blank" style="color:#e2e8f0;text-decoration:none;">\${escHtml(trades[0].title || key)}</a>\` : escHtml(trades[0].title || key)} &nbsp; <span class="\${pnlClass(pnl)}">\${_fmtPnl(pnl, invested)}</span> — \${trades.length} trades</h3>
    <div style="max-height:400px;overflow-y:auto;margin-top:8px;">
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Side</th><th>Outcome</th><th>Price</th><th>Shares</th><th>USDC</th><th>P&amp;L</th><th>Tx</th></tr></thead>
        <tbody>
          \${trades.map(t => \`
            <tr>
              <td>\${new Date(t.timestamp*1000).toISOString().slice(0,19).replace("T"," ")}</td>
              <td>\${t.type}</td>
              <td>\${t.side}</td>
              <td>\${t.outcome}</td>
              <td>\${t.price > 0 ? "$"+t.price.toFixed(4) : ""}</td>
              <td>\${t.size.toFixed(2)}</td>
              <td>\${t.usdcSize > 0 ? "$"+t.usdcSize.toFixed(2) : ""}</td>
              <td class="\${pnlClass(t.signed_usdc)}">\${_fmtUsd(t.signed_usdc)}</td>
              <td>\${t.transactionHash ? '<a href="https://polygonscan.com/tx/'+t.transactionHash+'" target="_blank" style="color:#3b82f6;">🔗</a>' : ""}</td>
            </tr>
          \`).join("")}
        </tbody>
      </table>
    </div>
  \`;
}

function closeDrillDown() {
  selectedMarketKey = null;
  document.getElementById("drillDown").style.display = "none";
  renderMarketTable();
}

// ──────────────────────────────────────────────────────────────
// JS P&L computation
// ──────────────────────────────────────────────────────────────

function computeOverallPnlJs(rows) {
  const totalPnl = rows.reduce((s, r) => s + r.signed_usdc, 0);
  const wins = rows.filter(r => r.signed_usdc > 0).length;
  const losses = rows.filter(r => r.signed_usdc < 0).length;
  const totalInvested = rows.filter(r => (r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT").reduce((s, r) => s + r.usdcSize, 0);
  return { total_pnl: totalPnl, total_invested: totalInvested, trade_count: rows.length, unique_markets: new Set(rows.map(r => r.slug).filter(Boolean)).size, win_rate: rows.length > 0 ? wins / rows.length : 0, win_count: wins, loss_count: losses };
}

function computePerCoinPnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const c = r.coin || "OTHER";
    if (!groups[c]) groups[c] = { pnl: 0, invested: 0, trade_count: 0, markets: new Set(), wins: 0 };
    groups[c].pnl += r.signed_usdc;
    if ((r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT") groups[c].invested += r.usdcSize;
    groups[c].trade_count++;
    if (r.slug) groups[c].markets.add(r.slug);
    if (r.signed_usdc > 0) groups[c].wins++;
  }
  return Object.entries(groups).map(([coin, g]) => ({ coin, pnl: g.pnl, invested: g.invested, trade_count: g.trade_count, unique_markets: g.markets.size, win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0 })).sort((a, b) => b.pnl - a.pnl);
}

function computePerTimeframePnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const tf = r.timeframe || "N/A";
    if (!groups[tf]) groups[tf] = { pnl: 0, invested: 0, trade_count: 0, markets: new Set() };
    groups[tf].pnl += r.signed_usdc;
    if ((r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT") groups[tf].invested += r.usdcSize;
    groups[tf].trade_count++;
    if (r.slug) groups[tf].markets.add(r.slug);
  }
  return Object.entries(groups).map(([timeframe, g]) => ({ timeframe, pnl: g.pnl, invested: g.invested, trade_count: g.trade_count, unique_markets: g.markets.size })).sort((a, b) => b.pnl - a.pnl);
}

function computePerMarketPnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const key = r.slug || r.title || "(unknown)";
    if (!groups[key]) groups[key] = { slug: r.slug, title: r.title, coin: r.coin, timeframe: r.timeframe, pnl: 0, invested: 0, trade_count: 0, first_trade: Infinity, last_trade: -Infinity, buy_count: 0, sell_count: 0, redeem_count: 0, wins: 0 };
    const g = groups[key]; g.pnl += r.signed_usdc;
    if ((r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT") g.invested += r.usdcSize;
    g.trade_count++;
    if (r.timestamp < g.first_trade) g.first_trade = r.timestamp;
    if (r.timestamp > g.last_trade) g.last_trade = r.timestamp;
    if (r.side === "BUY") g.buy_count++;
    if (r.side === "SELL") g.sell_count++;
    if (r.type === "REDEEM") g.redeem_count++;
    if (r.signed_usdc > 0) g.wins++;
  }
  return Object.entries(groups).map(([key, g]) => ({ key, slug: g.slug, title: g.title, display_name: normalizeMarketNameClient(g.slug || g.title), coin: g.coin, timeframe: g.timeframe, pnl: g.pnl, invested: g.invested, trade_count: g.trade_count, first_trade: g.first_trade === Infinity ? 0 : g.first_trade, last_trade: g.last_trade === -Infinity ? 0 : g.last_trade, win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0 })).sort((a, b) => b.pnl - a.pnl);
}

function computeDailyPnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    if (!r.date) continue;
    if (!groups[r.date]) groups[r.date] = { date: r.date, pnl: 0, trades: 0 };
    groups[r.date].pnl += r.signed_usdc; groups[r.date].trades++;
  }
  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeMarketNameClient(slug) {
  if (!slug) return "(unknown)";
  if (slug === "__platform_credits__") return "Platform Credits";
  if (slug.includes(" ")) return slug;
  const parts = slug.split("-");
  const coin = (parts[0] || "").toUpperCase();
  const tfMatch = parts.find((p) => /^\d+[mhd]$/.test(p)) || "";
  const tsPart = parts[parts.length - 1];
  if (/^\d{10}$/.test(tsPart)) { const dt = new Date(parseInt(tsPart) * 1000).toISOString().slice(0, 16).replace("T", " "); return \`\${coin} \${tfMatch} \${dt}\`; }
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function showStatus(msg, type) { document.getElementById("statusArea").innerHTML = msg ? \`<div class="\${type}">\${msg}</div>\` : ""; }
function updateTimePresetButtons(d) { document.querySelectorAll("#timePresets button").forEach(b => b.classList.toggle("active", parseFloat(b.dataset.days) === d)); }
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function _fmtUsd(v) {
  return (v >= 0 ? "+" : "") + "$" + v.toFixed(2);
}
function _fmtPnl(v, invested) {
  if (pctMode) {
    if (!invested) return "—";
    return (v >= 0 ? "+" : "") + (v / invested * 100).toFixed(1) + "%";
  }
  return _fmtUsd(v);
}

// ── Load / Refresh ──

document.getElementById("loadBtn").addEventListener("click", () => loadData(loadDays));
document.getElementById("clearBtn").addEventListener("click", () => loadData(loadDays));
document.getElementById("walletInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadData(loadDays); });

// ── Time presets (trigger server-side fetch) ──

document.getElementById("timePresets").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    const days = parseFloat(e.target.dataset.days);
    loadData(days);
  }
});

// ── Filters ──

document.getElementById("coinFilter").addEventListener("change", (e) => { currentCoin = e.target.value; renderAll(); });
document.getElementById("tfFilter").addEventListener("change", (e) => { currentTf = e.target.value; renderAll(); });
document.getElementById("typeFilter").addEventListener("change", (e) => { currentType = e.target.value; renderAll(); });
document.getElementById("marketSearch").addEventListener("input", (e) => { currentSearch = e.target.value; renderAll(); });
document.getElementById("dateFrom").addEventListener("change", (e) => { dateFrom = e.target.value; renderAll(); });
document.getElementById("dateTo").addEventListener("change", (e) => { dateTo = e.target.value; renderAll(); });

// ── Format toggle ──

document.getElementById("fmtUsdBtn").addEventListener("click", () => {
  pctMode = false;
  document.getElementById("fmtUsdBtn").classList.add("active");
  document.getElementById("fmtPctBtn").classList.remove("active");
  renderAll();
});
document.getElementById("fmtPctBtn").addEventListener("click", () => {
  pctMode = true;
  document.getElementById("fmtUsdBtn").classList.remove("active");
  document.getElementById("fmtPctBtn").classList.add("active");
  renderAll();
});

// ── Sortable table headers ──

document.querySelectorAll("#marketTable th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortColumn === key) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortColumn = key;
      sortDirection = "desc";
    }
    renderMarketTable();
  });
});

// ── Auto-load on page load ──

if (document.getElementById("walletInput").value.trim().length > 10) loadData(1);
</script>
</body>
</html>`;
