/**
 * data.js — P&L computation (ported from data_processor.py)
 *
 * All functions are pure — take raw rows in, return summaries.
 * Runs identically on server (for DB storage) and client (for filtering).
 */

// ──────────────────────────────────────────────────────────────
// Row processing
// ──────────────────────────────────────────────────────────────

export function processRows(rows, wallet) {
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

  return records;
}

// ──────────────────────────────────────────────────────────────
// Summaries
// ──────────────────────────────────────────────────────────────

export function computeOverallPnl(rows) {
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

  const totalInvested = rows.filter(r => (r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT").reduce((s, r) => s + r.usdcSize, 0);
  return { total_pnl: totalPnl, total_invested: totalInvested, trade_count: rows.length, unique_markets: uniqueMarkets, win_rate: winRate, win_count: wins, loss_count: losses, coins, timeframes, date_range: dateRange };
}

export function computePerCoinPnl(rows) {
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
  return Object.entries(groups)
    .map(([coin, g]) => ({
      coin,
      pnl: g.pnl,
      invested: g.invested,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
      win_rate: g.trade_count > 0 ? g.wins / g.trade_count : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function computePerTimeframePnl(rows) {
  const groups = {};
  for (const r of rows) {
    const tf = r.timeframe || "N/A";
    if (!groups[tf]) groups[tf] = { pnl: 0, invested: 0, trade_count: 0, markets: new Set() };
    groups[tf].pnl += r.signed_usdc;
    if ((r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT") groups[tf].invested += r.usdcSize;
    groups[tf].trade_count++;
    if (r.slug) groups[tf].markets.add(r.slug);
  }
  return Object.entries(groups)
    .map(([timeframe, g]) => ({
      timeframe,
      pnl: g.pnl,
      invested: g.invested,
      trade_count: g.trade_count,
      unique_markets: g.markets.size,
    }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function computePerMarketPnl(rows) {
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
        invested: 0,
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
    if ((r.type === "TRADE" && r.side === "BUY") || r.type === "SPLIT") g.invested += r.usdcSize;
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
      invested: g.invested,
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

export function computeDailyPnl(rows) {
  /** Daily P&L for time-series chart — group by date, sort ascending. */
  const groups = {};
  for (const r of rows) {
    if (!r.date) continue;
    if (!groups[r.date]) groups[r.date] = { date: r.date, pnl: 0, trades: 0 };
    groups[r.date].pnl += r.signed_usdc;
    groups[r.date].trades++;
  }
  return Object.values(groups).sort((a, b) => a.date.localeCompare(b.date));
}

export function computeAll(rows) {
  return {
    rows,
    overall_pnl: computeOverallPnl(rows),
    coin_pnl: computePerCoinPnl(rows),
    timeframe_pnl: computePerTimeframePnl(rows),
    market_pnl: computePerMarketPnl(rows),
    daily_pnl: computeDailyPnl(rows),
  };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function normalizeMarketName(slug) {
  if (!slug) return "(unknown)";
  if (slug === "__platform_credits__") return "Platform Credits";
  if (slug.includes(" ")) return slug;
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
