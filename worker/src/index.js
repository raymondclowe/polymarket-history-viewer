/**
 * Polymarket History Viewer — Cloudflare Worker
 *
 * Routes:
 *   GET /                        — HTML/JS dashboard
 *   GET /api/data?wallet=0x...&days=7 — JSON P&L data from Polymarket API
 *
 * In-memory only. No persistent storage.
 * Use ?days= for fast partial loads (default: all-time via prescan).
 */

import { processRows, computeAll } from "./data.js";
import { HTML_PAGE } from "./html.js";

const POLYMARKET_API = "https://data-api.polymarket.com/activity";
const PAGE_SIZE = 1000;
const REQUEST_DELAY = 300;
const WINDOW_DAYS = 7;

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
      if (url.pathname === "/api/data") {
        return await handleApiData(url, corsHeaders);
      }
      return new Response(HTML_PAGE, {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      console.error("fetch error:", e.message);
      return json({ error: e.message }, 500, corsHeaders);
    }
  },
};

// ──────────────────────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────────────────────

async function handleApiData(url, corsHeaders) {
  const wallet = url.searchParams.get("wallet") || "";
  if (!wallet || wallet.length < 10) {
    return json({ error: "Missing or invalid wallet address" }, 400, corsHeaders);
  }

  const days = parseInt(url.searchParams.get("days") || "0");

  const rows = await fetchAllActivity(wallet, days);
  const processed = processRows(rows, wallet);
  const data = computeAll(processed);
  return json({ ...data, cached: false, total_raw: rows.length, source: "api" }, 200, corsHeaders);
}

// ──────────────────────────────────────────────────────────────
// Date-window pagination (mirrors data_loader.py)
// ──────────────────────────────────────────────────────────────

async function fetchAllActivity(wallet, maxDays = 0) {
  const now = Math.floor(Date.now() / 1000);
  const rows = [];

  // Determine starting point
  let windowStart;
  if (maxDays > 0) {
    // Fast path: fetch only the last N days
    windowStart = Math.max(
      now - maxDays * 86400,
      Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000)
    );
  } else {
    // Full history: prescan to find first activity in 30-day leaps
    windowStart = Math.floor(new Date("2025-01-01T00:00:00Z").getTime() / 1000);
    while (windowStart < now) {
      const probeEnd = Math.min(windowStart + 30 * 86400, now);
      const page = await fetchPage(wallet, 0, 1, windowStart, probeEnd);
      if (page.length > 0) break;
      windowStart = probeEnd;
      await sleep(REQUEST_DELAY);
    }
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
