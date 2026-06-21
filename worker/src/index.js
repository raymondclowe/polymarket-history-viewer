/**
 * Polymarket History Viewer — Cloudflare Worker
 *
 * Routes:
 *   GET /                        — HTML/JS dashboard
 *   GET /api/data?wallet=0x...   — JSON P&L data (from D1 or Polymarket API)
 *   GET /api/refresh?wallet=0x...— Force-refresh from API into D1
 *   GET /api/timeseries?wallet=0x... — Daily P&L over time
 *   GET /api/ai/market?wallet=0x...&slug=... — AI market commentary
 *   GET /api/ai/summary?wallet=0x... — AI overall summary
 *
 * Cron (daily):
 *   Refresh known wallets from D1
 */

import { processRows, computeAll, computeOverallPnl, computePerMarketPnl } from "./data.js";
import { marketCommentary, overallSummary } from "./ai.js";
import { HTML_PAGE } from "./html.js";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const POLYMARKET_API = "https://data-api.polymarket.com/activity";
const PAGE_SIZE = 1000;
const REQUEST_DELAY = 300; // ms between pages
const WINDOW_DAYS = 7; // days per date window

// ──────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ── API: main data ──
      if (url.pathname === "/api/data") {
        return await handleApiData(url, env, ctx, corsHeaders);
      }
      // ── API: force refresh ──
      if (url.pathname === "/api/refresh") {
        return await handleRefresh(url, env, ctx, corsHeaders);
      }
      // ── API: time-series daily P&L ──
      if (url.pathname === "/api/timeseries") {
        return await handleTimeseries(url, env, corsHeaders);
      }
      // ── API: AI market commentary ──
      if (url.pathname === "/api/ai/market") {
        return await handleAiMarket(url, env, corsHeaders);
      }
      // ── API: AI overall summary ──
      if (url.pathname === "/api/ai/summary") {
        return await handleAiSummary(url, env, corsHeaders);
      }
      // ── Everything else: HTML dashboard ──
      return new Response(HTML_PAGE, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      console.error("fetch error:", e.message);
      return json({ error: e.message }, 500, corsHeaders);
    }
  },

  // ──────────────────────────────────────────────────────────
  // Cron: daily data refresh for known wallets
  // ──────────────────────────────────────────────────────────

  async scheduled(event, env, ctx) {
    console.log(`Cron triggered: ${event.cron}`);
    if (!env.DB) return;

    const { results } = await env.DB.prepare(
      "SELECT wallet FROM wallets WHERE last_refresh < unixepoch() - 86400 ORDER BY last_refresh ASC LIMIT 10"
    ).all();

    for (const row of results) {
      ctx.waitUntil(refreshWallet(row.wallet, env, ctx));
    }
    console.log(`Cron: queued refresh for ${results.length} wallets`);
  },
};

// ──────────────────────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────────────────────

async function handleApiData(url, env, ctx, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  if (!wallet || wallet.length < 10) {
    return json({ error: "Missing or invalid wallet address" }, 400, corsHeaders);
  }

  const force = url.searchParams.get("force") === "1";

  // ── D1 path ──
  if (env.DB) {
    if (force) {
      // Force refresh from API
      const rows = await fetchAllActivity(wallet);
      const processed = processRows(rows, wallet);
      try { await storeTrades(env.DB, wallet, processed); } catch (e) { console.error("storeTrades failed:", e.message); throw e; }
      try { await updateDailyPnl(env.DB, wallet, processed); } catch (e) { console.error("updateDailyPnl failed:", e.message); throw e; }
      await upsertWallet(env.DB, wallet, processed.length);
      const data = computeAll(processed);
      return json({ ...data, cached: false, total_raw: rows.length, source: "api" }, 200, corsHeaders);
    }

    // Try D1 first
    const rows = await loadTradesFromDb(env.DB, wallet);
    if (rows.length > 0) {
      const data = computeAll(rows);
      return json({ ...data, cached: true, source: "d1" }, 200, corsHeaders);
    }

    // Empty DB — fetch from API
    const apiRows = await fetchAllActivity(wallet);
    const processed = processRows(apiRows, wallet);
    if (processed.length > 0) {
      await storeTrades(env.DB, wallet, processed);
      await updateDailyPnl(env.DB, wallet, processed);
      await upsertWallet(env.DB, wallet, processed.length);
    }
    const data = computeAll(processed);
    return json({ ...data, cached: false, total_raw: apiRows.length, source: "api" }, 200, corsHeaders);
  }

  // ── Fallback (no D1): fetch from API only ──
  const rows = await fetchAllActivity(wallet);
  const processed = processRows(rows, wallet);
  const data = computeAll(processed);
  return json({ ...data, cached: false, total_raw: rows.length, source: "api" }, 200, corsHeaders);
}

async function handleRefresh(url, env, ctx, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  if (!wallet || wallet.length < 10) {
    return json({ error: "Missing or invalid wallet address" }, 400, corsHeaders);
  }
  if (!env.DB) {
    return json({ error: "D1 not configured" }, 400, corsHeaders);
  }

  ctx.waitUntil(refreshWallet(wallet, env, ctx));
  return json({ status: "refresh queued", wallet }, 200, corsHeaders);
}

async function handleTimeseries(url, env, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  if (!wallet || wallet.length < 10) {
    return json({ error: "Missing or invalid wallet address" }, 400, corsHeaders);
  }
  if (!env.DB) {
    return json({ error: "D1 not configured" }, 400, corsHeaders);
  }

  const { results } = await env.DB.prepare(
    "SELECT date, pnl, trades FROM daily_pnl WHERE wallet = ? ORDER BY date ASC"
  ).bind(wallet).all();

  return json({ daily: results }, 200, corsHeaders);
}

async function handleAiMarket(url, env, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  const slug = url.searchParams.get("slug") || "";
  if (!wallet || !slug) {
    return json({ error: "Missing wallet or slug" }, 400, corsHeaders);
  }
  if (!env.DB) {
    return json({ error: "D1 not configured" }, 400, corsHeaders);
  }

  // Load trades for this market
  const trades = await loadTradesForMarket(env.DB, wallet, slug);
  if (trades.length === 0) {
    return json({ error: "No trades found for this market" }, 404, corsHeaders);
  }

  // Compute market summary
  const marketPnl = computePerMarketPnl(trades);
  const market = marketPnl[0] || { slug, title: slug, coin: "?", timeframe: "?" };
  const summary = await marketCommentary(env, market, trades);

  return json({ summary, slug, trade_count: trades.length }, 200, corsHeaders);
}

async function handleAiSummary(url, env, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  const days = parseInt(url.searchParams.get("days") || "0");
  if (!wallet) {
    return json({ error: "Missing wallet" }, 400, corsHeaders);
  }
  if (!env.DB) {
    return json({ error: "D1 not configured" }, 400, corsHeaders);
  }

  const rows = await loadTradesFromDb(env.DB, wallet, days > 0 ? days * 86400 : 0);
  if (rows.length === 0) {
    return json({ error: "No trades found" }, 404, corsHeaders);
  }

  const overall = computeOverallPnl(rows);
  const { computePerCoinPnl, computePerTimeframePnl } = await import("./data.js");
  const coinPnl = computePerCoinPnl(rows);
  const tfPnl = computePerTimeframePnl(rows);
  const marketPnl = computePerMarketPnl(rows);

  const summary = await overallSummary(env, overall, coinPnl, tfPnl, marketPnl, days);
  return json({ summary, trade_count: rows.length }, 200, corsHeaders);
}

// ──────────────────────────────────────────────────────────────
// D1 operations
// ──────────────────────────────────────────────────────────────

async function storeTrades(db, wallet, rows) {
  if (rows.length === 0) return;

  console.log(`storeTrades: ${rows.length} rows, using individual INSERT via batch()`);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO trades
     (wallet, transaction_hash, type, side, slug, title, outcome, price, size, usdc_size, signed_usdc, coin, timeframe, timestamp, date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // D1 batch() handles up to 100 statements per call
  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const batch = chunk.map((r) =>
      stmt.bind(
        wallet,
        r.transactionHash || null,
        r.type,
        r.side || null,
        r.slug || null,
        r.title || null,
        r.outcome || null,
        r.price,
        r.size,
        r.usdcSize,
        r.signed_usdc,
        r.coin || "OTHER",
        r.timeframe || "N/A",
        r.timestamp,
        r.date || null
      )
    );
    await db.batch(batch);
  }
}

async function loadTradesFromDb(db, wallet, secondsMaxAge = 0) {
  let query = "SELECT * FROM trades WHERE wallet = ? ORDER BY timestamp ASC";
  if (secondsMaxAge > 0) {
    const cutoff = Math.floor(Date.now() / 1000) - secondsMaxAge;
    query = `SELECT * FROM trades WHERE wallet = ? AND timestamp >= ${cutoff} ORDER BY timestamp ASC`;
  }
  const { results } = await db.prepare(query).bind(wallet).all();
  return results.map(normalizeDbRow);
}

async function loadTradesForMarket(db, wallet, slug) {
  const { results } = await db.prepare(
    "SELECT * FROM trades WHERE wallet = ? AND slug = ? ORDER BY timestamp ASC"
  ).bind(wallet, slug).all();
  return results.map(normalizeDbRow);
}

function normalizeDbRow(r) {
  return {
    ...r,
    price: r.price ?? 0,
    size: r.size ?? 0,
    usdcSize: r.usdc_size ?? 0,
    signed_usdc: r.signed_usdc ?? 0,
    transactionHash: r.transaction_hash,
  };
}

async function updateDailyPnl(db, wallet, rows) {
  const days = {};
  for (const r of rows) {
    if (!r.date) continue;
    if (!days[r.date]) days[r.date] = { pnl: 0, trades: 0 };
    days[r.date].pnl += r.signed_usdc;
    days[r.date].trades++;
  }

  const stmt = db.prepare(
    "INSERT INTO daily_pnl (wallet, date, pnl, trades) VALUES (?, ?, ?, ?) ON CONFLICT(wallet, date) DO UPDATE SET pnl = excluded.pnl, trades = excluded.trades, updated_at = unixepoch()"
  );
  const entries = Object.entries(days);
  // D1 batch() limit: 100 statements per call
  const CHUNK = 100;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const batch = chunk.map(([date, d]) => stmt.bind(wallet, date, d.pnl, d.trades));
    if (batch.length > 0) await db.batch(batch);
  }
}

async function upsertWallet(db, wallet, tradeCount) {
  await db.prepare(
    "INSERT INTO wallets (wallet, last_refresh, trade_count) VALUES (?, unixepoch(), ?) ON CONFLICT(wallet) DO UPDATE SET last_refresh = unixepoch(), trade_count = ?"
  ).bind(wallet, tradeCount, tradeCount).run();
}

async function refreshWallet(wallet, env, ctx) {
  try {
    const rows = await fetchAllActivity(wallet);
    const processed = processRows(rows, wallet);
    await storeTrades(env.DB, wallet, processed);
    await updateDailyPnl(env.DB, wallet, processed);
    await upsertWallet(env.DB, wallet, processed.length);
    console.log(`Refreshed ${wallet}: ${processed.length} trades`);
  } catch (e) {
    console.error(`Refresh failed for ${wallet}:`, e.message);
  }
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
    if (emptyWindows >= 6) break;
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
// Helpers
// ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
