/**
 * Polymarket History Viewer — Cloudflare Worker
 *
 * Serves an interactive P&L dashboard with charts, filters, and drill-down.
 * Fetches from Polymarket activity API with date-window pagination.
 *
 * Routes:
 *   GET /           — HTML/JS dashboard
 *   GET /api/data    — JSON P&L data for a wallet (?wallet=0x...)
 */

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const POLYMARKET_API = "https://data-api.polymarket.com/activity";
const PAGE_SIZE = 1000;
const REQUEST_DELAY = 300; // ms between pages
const WINDOW_DAYS = 7; // days per date window

// CRYPTO coin patterns for coin extraction
const COIN_PATTERNS = [
  ["Bitcoin", "BTC"],
  ["Ethereum", "ETH"],
  ["XRP", "XRP"],
  ["Solana", "SOL"],
  ["Bitcoin Cash", "BCH"],
  ["Litecoin", "LTC"],
  ["Dogecoin", "DOGE"],
];

// ──────────────────────────────────────────────────────────────
// Polyfills for crypto.randomUUID (Cloudflare Workers runtime)
// ──────────────────────────────────────────────────────────────

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = globalThis.crypto || {};
  globalThis.crypto.randomUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
}

// ──────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API endpoint
    if (url.pathname === "/api/data") {
      return handleApiRequest(url, env, ctx);
    }

    // Everything else → HTML dashboard
    return new Response(HTML_PAGE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

// ──────────────────────────────────────────────────────────────
// API: fetch & process Polymarket data
// ──────────────────────────────────────────────────────────────

async function handleApiRequest(url, env, ctx) {
  const wallet = url.searchParams.get("wallet") || "";
  if (!wallet || wallet.length < 10) {
    return json({ error: "Missing or invalid wallet address" }, 400);
  }

  const force = url.searchParams.get("force") === "1";

  // Try KV cache first
  if (!force && env.CACHE) {
    const cached = await env.CACHE.get(wallet, "json");
    if (cached && cached.rows && cached.rows.length > 0) {
      const data = processRows(cached.rows);
      return json({ ...data, cached: true });
    }
  }

  // Fetch from Polymarket API
  const rows = await fetchAllActivity(wallet);

  // Cache in KV (1 hour TTL)
  if (env.CACHE && rows.length > 0) {
    ctx.waitUntil(env.CACHE.put(wallet, JSON.stringify({ rows, ts: Date.now() }), { expirationTtl: 3600 }));
  }

  const data = processRows(rows);
  return json({ ...data, cached: false, total_raw: rows.length });
}

// ──────────────────────────────────────────────────────────────
// Date-window pagination (mirrors data_loader.py)
// ──────────────────────────────────────────────────────────────

async function fetchAllActivity(wallet) {
  const now = Math.floor(Date.now() / 1000);
  const rows = [];

  // Pre-scan: find first activity in 30-day leaps
  let windowStart = Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000);
  while (windowStart < now) {
    const probeEnd = Math.min(windowStart + 30 * 86400, now);
    const page = await fetchPage(wallet, 0, 1, windowStart, probeEnd);
    if (page.length > 0) break;
    windowStart = probeEnd;
    await sleep(REQUEST_DELAY);
  }

  // Walk forward in WINDOW_DAYS-day windows
  let emptyWindows = 0;
  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + WINDOW_DAYS * 86400, now);
    let windowRows = 0;
    let offset = 0;

    while (offset < 4000) {
      const page = await fetchPage(wallet, offset, PAGE_SIZE, windowStart, windowEnd);
      if (page.length === 0) break;
      rows.push(...page);
      windowRows += page.length;
      offset += PAGE_SIZE;
      if (page.length < PAGE_SIZE) break;
      await sleep(REQUEST_DELAY);
    }

    windowRows > 0 ? (emptyWindows = 0) : emptyWindows++;
    if (emptyWindows >= 6) break; // 42 days empty → stop
    windowStart = windowEnd;
    await sleep(REQUEST_DELAY);
  }

  return rows;
}

async function fetchPage(wallet, offset, limit, startTs, endTs) {
  const params = new URLSearchParams({
    user: wallet,
    limit: String(limit),
    offset: String(offset),
    sortDirection: "ASC",
  });
  if (startTs) params.set("start", String(startTs));
  if (endTs) params.set("end", String(endTs));

  const url = `${POLYMARKET_API}?${params.toString()}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "PolymarketHistoryViewer/2.0", Accept: "application/json" },
      });
      if (resp.status === 400) return [];
      if (!resp.ok) {
        if (attempt < 2) await sleep(2 ** attempt * 1000);
        continue;
      }
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      if (attempt < 2) await sleep(2 ** attempt * 1000);
    }
  }
  return [];
}

// ──────────────────────────────────────────────────────────────
// P&L processing (mirrors data_processor.py)
// ──────────────────────────────────────────────────────────────

function processRows(rows) {
  // Validate integrity
  const clean = rows.filter((r) => {
    const type = (r.type || "").toUpperCase();
    const slug = (r.slug || "").trim();
    const usdc = parseFloat(r.usdcSize || 0);
    const price = parseFloat(r.price || 0);

    if (["TRADE", "REDEEM", "MERGE", "SPLIT"].includes(type) && !slug) return false;
    if (type === "TRADE") {
      if (usdc <= 0) return false;
      if (price <= 0 || price >= 1) return false;
    }
    return true;
  });

  // Convert to typed records
  const records = clean.map((r) => {
    const type = (r.type || "").toUpperCase();
    const side = (r.side || "").toUpperCase();
    const usdcSize = parseFloat(r.usdcSize || 0);
    const price = parseFloat(r.price || 0);
    const size = parseFloat(r.size || 0);
    const slug = (r.slug || "").trim();
    const title = (r.title || "").trim();
    const outcome = (r.outcome || "").trim();
    const timestamp = parseInt(r.timestamp || 0);
    const txHash = r.transactionHash || "";

    // Sign convention
    let signedUsdc;
    const nonPnl = ["DEPOSIT", "WITHDRAWAL", "WITHDRAW", "TRANSFER"];
    if (nonPnl.includes(type)) {
      signedUsdc = 0;
    } else if (type === "SPLIT") {
      signedUsdc = -usdcSize;
    } else if (type === "TRADE" && side === "BUY") {
      signedUsdc = -usdcSize;
    } else {
      signedUsdc = usdcSize;
    }

    // Coin extraction
    let coin = "OTHER";
    if (slug) {
      const parts = slug.split("-");
      if (parts.length > 0) {
        const c = parts[0].toUpperCase();
        const tickers = { BTC: "BTC", ETH: "ETH", XRP: "XRP", SOL: "SOL", BCH: "BCH", LTC: "LTC", DOGE: "DOGE" };
        const fullNames = { BITCOIN: "BTC", ETHEREUM: "ETH", XRP: "XRP", SOLANA: "SOL", LITECOIN: "LTC", DOGECOIN: "DOGE" };
        if (tickers[c]) coin = tickers[c];
        else if (fullNames[c]) coin = fullNames[c];
      }
    }

    // Timeframe extraction
    let timeframe = "N/A";
    if (slug) {
      const m = slug.match(/-(\d+[mhd])-/);
      if (m) {
        timeframe = m[1];
      } else if (/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+/i.test(slug)) {
        timeframe = "1h";
      }
    }

    return {
      title,
      slug,
      type,
      side,
      price,
      size,
      usdcSize,
      signed_usdc: signedUsdc,
      outcome,
      timestamp,
      transactionHash: txHash,
      coin,
      timeframe,
      date: timestamp > 0 ? new Date(timestamp * 1000).toISOString().slice(0, 10) : "",
      datetime: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : "",
    };
  });

  // Compute P&L summaries
  return {
    rows: records,
    overall_pnl: computeOverallPnl(records),
    coin_pnl: computePerCoinPnl(records),
    timeframe_pnl: computePerTimeframePnl(records),
    market_pnl: computePerMarketPnl(records),
  };
}

function computeOverallPnl(rows) {
  const totalPnl = rows.reduce((s, r) => s + r.signed_usdc, 0);
  const wins = rows.filter((r) => r.signed_usdc > 0).length;
  const losses = rows.filter((r) => r.signed_usdc < 0).length;
  const winRate = rows.length > 0 ? wins / rows.length : 0;
  const uniqueMarkets = new Set(rows.map((r) => r.slug).filter(Boolean)).size;
  const coins = [...new Set(rows.map((r) => r.coin).filter((c) => c !== "OTHER"))];
  const timeframes = [...new Set(rows.map((r) => r.timeframe).filter((t) => t !== "N/A"))];
  const tsVals = rows.map((r) => r.timestamp).filter((t) => t > 0);
  const dateRange =
    tsVals.length > 0
      ? `${new Date(Math.min(...tsVals) * 1000).toISOString().slice(0, 10)} → ${new Date(Math.max(...tsVals) * 1000).toISOString().slice(0, 10)}`
      : "";

  return { total_pnl: totalPnl, trade_count: rows.length, unique_markets: uniqueMarkets, win_rate: winRate, win_count: wins, loss_count: losses, coins, timeframes, date_range: dateRange };
}

function computePerCoinPnl(rows) {
  const groups = {};
  for (const r of rows) {
    const c = r.coin || "OTHER";
    if (!groups[c]) groups[c] = { pnl: 0, trade_count: 0, markets: new Set(), wins: 0 };
    groups[c].pnl += r.signed_usdc;
    groups[c].trade_count++;
    if (r.slug) groups[c].markets.add(r.slug);
    if (r.signed_usdc > 0) groups[c].wins++;
  }
  return Object.entries(groups)
    .map(([coin, g]) => ({
      coin,
      pnl: g.pnl,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
      win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function computePerTimeframePnl(rows) {
  const groups = {};
  for (const r of rows) {
    const tf = r.timeframe || "N/A";
    if (!groups[tf]) groups[tf] = { pnl: 0, trade_count: 0, markets: new Set() };
    groups[tf].pnl += r.signed_usdc;
    groups[tf].trade_count++;
    if (r.slug) groups[tf].markets.add(r.slug);
  }
  return Object.entries(groups)
    .map(([timeframe, g]) => ({
      timeframe,
      pnl: g.pnl,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function computePerMarketPnl(rows) {
  const groups = {};
  for (const r of rows) {
    const key = r.slug || r.title || "(unknown)";
    if (!groups[key]) {
      groups[key] = {
        slug: r.slug,
        title: r.title,
        coin: r.coin,
        timeframe: r.timeframe,
        pnl: 0,
        trade_count: 0,
        first_trade: Infinity,
        last_trade: -Infinity,
        buy_count: 0,
        sell_count: 0,
        redeem_count: 0,
        wins: 0,
      };
    }
    const g = groups[key];
    g.pnl += r.signed_usdc;
    g.trade_count++;
    if (r.timestamp < g.first_trade) g.first_trade = r.timestamp;
    if (r.timestamp > g.last_trade) g.last_trade = r.timestamp;
    if (r.side === "BUY") g.buy_count++;
    if (r.side === "SELL") g.sell_count++;
    if (r.type === "REDEEM") g.redeem_count++;
    if (r.signed_usdc > 0) g.wins++;
  }
  return Object.entries(groups)
    .map(([key, g]) => ({
      key,
      slug: g.slug,
      title: g.title,
      display_name: normalizeMarketName(g.slug || g.title),
      coin: g.coin,
      timeframe: g.timeframe,
      pnl: g.pnl,
      trade_count: g.trade_count,
      first_trade: g.first_trade === Infinity ? 0 : g.first_trade,
      last_trade: g.last_trade === -Infinity ? 0 : g.last_trade,
      buy_count: g.buy_count,
      sell_count: g.sell_count,
      redeem_count: g.redeem_count,
      win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function normalizeMarketName(slug) {
  if (!slug) return "(unknown)";
  if (slug === "__platform_credits__") return "Platform Credits";
  if (slug.includes(" ")) return slug;
  // Parse slug: coin-type-timeframe-ts or coin-up-or-down-date-time
  const parts = slug.split("-");
  const coin = (parts[0] || "").toUpperCase();
  const tfMatch = parts.find((p) => /^\d+[mhd]$/.test(p)) || "";
  const tsPart = parts[parts.length - 1];
  if (/^\d{10}$/.test(tsPart)) {
    const dt = new Date(parseInt(tsPart) * 1000).toISOString().slice(0, 16).replace("T", " ");
    return `${coin} ${tfMatch} ${dt}`;
  }
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// ──────────────────────────────────────────────────────────────
// HTML page (inline SPA)
// ──────────────────────────────────────────────────────────────

const HTML_PAGE = `<!DOCTYPE html>
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

/* Input */
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

/* Summary cards */
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.summary-item { text-align: center; padding: 16px; background: #0f172a; border-radius: 8px; }
.summary-item .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.summary-item .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
.value.green { color: #22c55e; }
.value.red { color: #ef4444; }
.value.gray { color: #94a3b8; }

/* Filters */
.filter-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.filter-row label { font-size: 0.8rem; color: #94a3b8; display: block; margin-bottom: 4px; }
.filter-row select { padding: 8px 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.85rem; min-width: 140px; }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th { text-align: left; padding: 10px 12px; color: #64748b; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid #334155; }
td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
tr:hover { background: #1e293b; cursor: pointer; }
tr.selected { background: #1e3a5f; }
.pnl-pos { color: #22c55e; }
.pnl-neg { color: #ef4444; }

/* Charts */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-wrap { position: relative; height: 300px; }
.chart-wrap canvas { width: 100% !important; }

/* Loading / error */
.loader { text-align: center; padding: 40px; color: #64748b; }
.spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #334155; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error { color: #ef4444; padding: 12px; background: #450a0a; border-radius: 8px; margin: 12px 0; }
.info-banner { padding: 10px 14px; background: #1e293b; border-radius: 8px; color: #94a3b8; font-size: 0.8rem; margin-bottom: 12px; }

/* Drill-down */
.drill-down { margin-top: 12px; }
.drill-down h3 { font-size: 0.95rem; margin-bottom: 8px; color: #cbd5e1; }
.drill-down .close-btn { float: right; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem; }

@media (max-width: 768px) { .chart-row { grid-template-columns: 1fr; } .summary-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="container">
  <h1>📊 Polymarket History Viewer</h1>
  <p class="subtitle">P&L dashboard — enter a wallet to fetch full history</p>

  <div class="card">
    <div class="input-row">
      <input type="text" id="walletInput" placeholder="0x..." value="0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e">
      <button class="btn btn-primary" id="loadBtn">🔍 Load</button>
      <button class="btn btn-outline btn-sm" id="clearBtn">Clear Cache</button>
    </div>
  </div>

  <div id="statusArea"></div>

  <!-- Filters & Summary (hidden until data loads) -->
  <div id="dashboard" style="display:none;">
    <div id="banner" class="info-banner"></div>

    <!-- Summary Cards -->
    <div class="summary-grid" id="summaryCards"></div>

    <!-- Time Presets -->
    <div class="card" style="margin-top:16px;">
      <div class="btn-group" id="timePresets">
        <button class="btn btn-outline btn-sm active" data-days="0">All Time</button>
        <button class="btn btn-outline btn-sm" data-days="7">Last 7 Days</button>
        <button class="btn btn-outline btn-sm" data-days="1">Last 24h</button>
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
      </div>
    </div>

    <!-- Charts -->
    <div class="chart-row">
      <div class="card"><h2>P&L by Coin</h2><div class="chart-wrap"><canvas id="coinChart"></canvas></div></div>
      <div class="card"><h2>P&L by Timeframe</h2><div class="chart-wrap"><canvas id="tfChart"></canvas></div></div>
    </div>

    <!-- Market Table -->
    <div class="card">
      <h2>Market Details <span style="font-weight:400;color:#64748b;font-size:0.8rem;">— click a row to drill down</span></h2>
      <div style="max-height:500px;overflow-y:auto;">
        <table id="marketTable">
          <thead><tr><th>Market</th><th>Coin</th><th>TF</th><th>P&L</th><th>Trades</th><th>First Trade</th><th>Last Trade</th></tr></thead>
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

let allData = null;        // { rows, overall_pnl, coin_pnl, timeframe_pnl, market_pnl }
let filteredRows = [];
let currentDays = 0;       // 0 = all time
let currentCoin = "ALL";
let currentTf = "ALL";
let coinChart = null;
let tfChart = null;
let selectedMarketKey = null;

// ──────────────────────────────────────────────────────────────
// API call
// ──────────────────────────────────────────────────────────────

async function loadData(force) {
  const wallet = document.getElementById("walletInput").value.trim();
  if (!wallet || wallet.length < 10) {
    showStatus("Enter a valid wallet address", "error");
    return;
  }

  showStatus('<span class="spinner"></span> Fetching from Polymarket API...', "loader");
  document.getElementById("dashboard").style.display = "none";

  try {
    const resp = await fetch(\`/api/data?wallet=\${encodeURIComponent(wallet)}\${force ? "&force=1" : ""}\`);
    const data = await resp.json();
    if (data.error) { showStatus(data.error, "error"); return; }
    allData = data;
    filteredRows = data.rows;
    currentDays = 0;
    currentCoin = "ALL";
    currentTf = "ALL";
    document.getElementById("coinFilter").value = "ALL";
    document.getElementById("tfFilter").value = "ALL";
    updateTimePresetButtons(0);
    renderAll();
    document.getElementById("dashboard").style.display = "block";
    showStatus("", "");
  } catch (e) {
    showStatus("Failed to load: " + e.message, "error");
  }
}

// ──────────────────────────────────────────────────────────────
// Filtering
// ──────────────────────────────────────────────────────────────

function applyFilters() {
  let rows = allData.rows;
  const now = Math.floor(Date.now() / 1000);

  if (currentDays > 0) {
    const cutoff = now - currentDays * 86400;
    rows = rows.filter(r => r.timestamp >= cutoff);
  }
  if (currentCoin !== "ALL") {
    rows = rows.filter(r => r.coin === currentCoin);
  }
  if (currentTf !== "ALL") {
    rows = rows.filter(r => r.timeframe === currentTf);
  }
  filteredRows = rows;
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
  b.textContent = \`📅 Data range: \${range} (\${filteredRows.length.toLocaleString()} rows)\${allData.cached ? " · 📦 from cache" : ""}\`;
}

function renderSummary() {
  const pnl = computeOverallPnlJs(filteredRows);
  const fmt = (v) => (v >= 0 ? "+" : "") + "$" + v.toFixed(2);
  const color = (v) => v > 0 ? "green" : v < 0 ? "red" : "gray";
  document.getElementById("summaryCards").innerHTML = \`
    <div class="summary-item"><div class="label">Total P&amp;L</div><div class="value \${color(pnl.total_pnl)}">\${fmt(pnl.total_pnl)}</div></div>
    <div class="summary-item"><div class="label">Trades</div><div class="value gray">\${pnl.trade_count.toLocaleString()}</div></div>
    <div class="summary-item"><div class="label">Markets</div><div class="value gray">\${pnl.unique_markets}</div></div>
    <div class="summary-item"><div class="label">Win Rate</div><div class="value gray">\${(pnl.win_rate*100).toFixed(1)}%</div></div>
    <div class="summary-item"><div class="label">W / L</div><div class="value gray">\${pnl.win_count} / \${pnl.loss_count}</div></div>
  \`;
}

function renderCharts() {
  const coinPnl = computePerCoinPnlJs(filteredRows);
  const tfPnl = computePerTimeframePnlJs(filteredRows);

  // Coin chart
  if (coinChart) coinChart.destroy();
  const coinCtx = document.getElementById("coinChart").getContext("2d");
  coinChart = new Chart(coinCtx, {
    type: "bar",
    data: {
      labels: coinPnl.map(c => c.coin),
      datasets: [{
        label: "P&L (USD)",
        data: coinPnl.map(c => c.pnl),
        backgroundColor: coinPnl.map(c => c.pnl >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"),
        borderColor: coinPnl.map(c => c.pnl >= 0 ? "#22c55e" : "#ef4444"),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        y: { ticks: { color: "#94a3b8", callback: v => "$" + v.toLocaleString() }, grid: { color: "#1e293b" } },
      },
    },
  });

  // Timeframe chart
  if (tfChart) tfChart.destroy();
  const tfCtx = document.getElementById("tfChart").getContext("2d");
  tfChart = new Chart(tfCtx, {
    type: "bar",
    data: {
      labels: tfPnl.map(t => t.timeframe),
      datasets: [{
        label: "P&L (USD)",
        data: tfPnl.map(t => t.pnl),
        backgroundColor: tfPnl.map(t => t.pnl >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"),
        borderColor: tfPnl.map(t => t.pnl >= 0 ? "#22c55e" : "#ef4444"),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
        y: { ticks: { color: "#94a3b8", callback: v => "$" + v.toLocaleString() }, grid: { color: "#1e293b" } },
      },
    },
  });

  // Populate filter dropdowns
  const allCoins = [...new Set(allData.rows.map(r => r.coin).filter(c => c !== "OTHER"))].sort();
  const allTfs = [...new Set(allData.rows.map(r => r.timeframe).filter(t => t !== "N/A"))].sort();
  document.getElementById("coinFilter").innerHTML = '<option value="ALL">All Coins</option>' + allCoins.map(c => \`<option value="\${c}">\${c}</option>\`).join("");
  document.getElementById("tfFilter").innerHTML = '<option value="ALL">All Timeframes</option>' + allTfs.map(t => \`<option value="\${t}">\${t}</option>\`).join("");
}

function renderMarketTable() {
  const mkts = computePerMarketPnlJs(filteredRows);
  const fmt = (v) => (v >= 0 ? "+" : "") + "$" + v.toFixed(2);
  const pnlClass = (v) => v >= 0 ? "pnl-pos" : "pnl-neg";
  const tsStr = (ts) => ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
  const tbody = document.querySelector("#marketTable tbody");
  tbody.innerHTML = mkts.map((m, i) => \`
    <tr class="\${m.key === selectedMarketKey ? "selected" : ""}" data-key="\${m.key.replace(/"/g,"&quot;")}" data-idx="\${i}">
      <td>\${escHtml(m.display_name)}</td>
      <td>\${m.coin}</td>
      <td>\${m.timeframe}</td>
      <td class="\${pnlClass(m.pnl)}">\${fmt(m.pnl)}</td>
      <td>\${m.trade_count}</td>
      <td>\${tsStr(m.first_trade)}</td>
      <td>\${tsStr(m.last_trade)}</td>
    </tr>
  \`).join("");

  // Click handler
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", () => {
      const key = tr.dataset.key.replace(/&quot;/g, '"');
      drillDown(key);
    });
  });
}

function drillDown(key) {
  selectedMarketKey = key;
  const trades = filteredRows.filter(r => (r.slug || r.title || "(unknown)") === key).sort((a, b) => a.timestamp - b.timestamp);
  if (trades.length === 0) return;

  const fmt = (v) => (v >= 0 ? "+" : "") + "$" + v.toFixed(2);
  const pnlClass = (v) => v >= 0 ? "pnl-pos" : "pnl-neg";
  const pnl = trades.reduce((s, r) => s + r.signed_usdc, 0);

  const d = document.getElementById("drillDown");
  d.style.display = "block";
  d.innerHTML = \`
    <button class="close-btn" onclick="closeDrillDown()">✕</button>
    <h3>\${escHtml(trades[0].title || key)} &nbsp; <span class="\${pnlClass(pnl)}">\${fmt(pnl)}</span> — \${trades.length} trades</h3>
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
              <td class="\${pnlClass(t.signed_usdc)}">\${fmt(t.signed_usdc)}</td>
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
// JS P&L computation (same as server, runs on filteredRows)
// ──────────────────────────────────────────────────────────────

function computeOverallPnlJs(rows) {
  const totalPnl = rows.reduce((s, r) => s + r.signed_usdc, 0);
  const wins = rows.filter(r => r.signed_usdc > 0).length;
  const losses = rows.filter(r => r.signed_usdc < 0).length;
  const winRate = rows.length > 0 ? wins / rows.length : 0;
  const uniqueMarkets = new Set(rows.map(r => r.slug).filter(Boolean)).size;
  return { total_pnl: totalPnl, trade_count: rows.length, unique_markets: uniqueMarkets, win_rate: winRate, win_count: wins, loss_count: losses };
}

function computePerCoinPnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const c = r.coin || "OTHER";
    if (!groups[c]) groups[c] = { pnl: 0, trade_count: 0, markets: new Set(), wins: 0 };
    groups[c].pnl += r.signed_usdc;
    groups[c].trade_count++;
    if (r.slug) groups[c].markets.add(r.slug);
    if (r.signed_usdc > 0) groups[c].wins++;
  }
  return Object.entries(groups)
    .map(([coin, g]) => ({
      coin,
      pnl: g.pnl,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
      win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function computePerTimeframePnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const tf = r.timeframe || "N/A";
    if (!groups[tf]) groups[tf] = { pnl: 0, trade_count: 0, markets: new Set() };
    groups[tf].pnl += r.signed_usdc;
    groups[tf].trade_count++;
    if (r.slug) groups[tf].markets.add(r.slug);
  }
  return Object.entries(groups)
    .map(([timeframe, g]) => ({
      timeframe,
      pnl: g.pnl,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function computePerMarketPnlJs(rows) {
  const groups = {};
  for (const r of rows) {
    const key = r.slug || r.title || "(unknown)";
    if (!groups[key]) {
      groups[key] = {
        slug: r.slug,
        title: r.title,
        coin: r.coin,
        timeframe: r.timeframe,
        pnl: 0,
        trade_count: 0,
        first_trade: Infinity,
        last_trade: -Infinity,
        buy_count: 0,
        sell_count: 0,
        redeem_count: 0,
        wins: 0,
      };
    }
    const g = groups[key];
    g.pnl += r.signed_usdc;
    g.trade_count++;
    if (r.timestamp < g.first_trade) g.first_trade = r.timestamp;
    if (r.timestamp > g.last_trade) g.last_trade = r.timestamp;
    if (r.side === "BUY") g.buy_count++;
    if (r.side === "SELL") g.sell_count++;
    if (r.type === "REDEEM") g.redeem_count++;
    if (r.signed_usdc > 0) g.wins++;
  }
  return Object.entries(groups)
    .map(([key, g]) => ({
      key,
      slug: g.slug,
      title: g.title,
      display_name: normalizeMarketNameClient(g.slug || g.title),
      coin: g.coin,
      timeframe: g.timeframe,
      pnl: g.pnl,
      trade_count: g.trade_count,
      first_trade: g.first_trade === Infinity ? 0 : g.first_trade,
      last_trade: g.last_trade === -Infinity ? 0 : g.last_trade,
      buy_count: g.buy_count,
      sell_count: g.sell_count,
      redeem_count: g.redeem_count,
      win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

function normalizeMarketNameClient(slug) {
  if (!slug) return "(unknown)";
  if (slug === "__platform_credits__") return "Platform Credits";
  if (slug.includes(" ")) return slug;
  const parts = slug.split("-");
  const coin = (parts[0] || "").toUpperCase();
  const tfMatch = parts.find((p) => /^\d+[mhd]$/.test(p)) || "";
  const tsPart = parts[parts.length - 1];
  if (/^\d{10}$/.test(tsPart)) {
    const dt = new Date(parseInt(tsPart) * 1000).toISOString().slice(0, 16).replace("T", " ");
    return \`\${coin} \${tfMatch} \${dt}\`;
  }
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ──────────────────────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────────────────────

function showStatus(msg, type) {
  const el = document.getElementById("statusArea");
  el.innerHTML = msg ? \`<div class="\${type}">\${msg}</div>\` : "";
}

function updateTimePresetButtons(activeDays) {
  document.querySelectorAll("#timePresets button").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.days) === activeDays);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ──────────────────────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────────────────────

document.getElementById("loadBtn").addEventListener("click", () => loadData(false));
document.getElementById("clearBtn").addEventListener("click", () => loadData(true));
document.getElementById("walletInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadData(false); });

document.getElementById("timePresets").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    currentDays = parseInt(e.target.dataset.days);
    updateTimePresetButtons(currentDays);
    renderAll();
  }
});

document.getElementById("coinFilter").addEventListener("change", (e) => {
  currentCoin = e.target.value;
  renderAll();
});

document.getElementById("tfFilter").addEventListener("change", (e) => {
  currentTf = e.target.value;
  renderAll();
});

// ──────────────────────────────────────────────────────────────
// Auto-load if wallet is pre-filled
// ──────────────────────────────────────────────────────────────

if (document.getElementById("walletInput").value.trim().length > 10) {
  loadData(false);
}
</script>
</body>
</html>`;
