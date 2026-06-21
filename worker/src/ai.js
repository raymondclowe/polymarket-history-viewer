/**
 * ai.js — AI-powered commentary for markets and summaries
 *
 * Uses Workers AI (Llama 3.2 3B) via env.AI binding.
 * Commentary is cached in D1 (ai_cache table) to avoid re-prompting.
 */

const AI_MODEL = "@cf/meta/llama-3.2-3b-instruct";

/**
 * Generate a trading summary for a specific market.
 */
export async function marketCommentary(env, market, trades) {
  const today = new Date().toISOString().slice(0, 10);

  // Build a compact stats summary
  const wins = trades.filter((t) => t.signed_usdc > 0).length;
  const losses = trades.filter((t) => t.signed_usdc < 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.signed_usdc, 0);
  const buys = trades.filter((t) => t.side === "BUY").length;
  const sells = trades.filter((t) => t.side === "SELL").length;
  const redeems = trades.filter((t) => t.type === "REDEEM").length;
  const avgEntry = buys > 0
    ? trades.filter((t) => t.side === "BUY").reduce((s, t) => s + t.price, 0) / buys
    : 0;
  const avgExit = sells > 0
    ? trades.filter((t) => t.side === "SELL").reduce((s, t) => s + t.price, 0) / sells
    : 0;

  const prompt = `You are a trading coach analyzing Polymarket prediction market activity.

Market: ${market.slug || market.title || "(unknown)"}
Coin: ${market.coin}
Timeframe: ${market.timeframe}
Trades: ${trades.length} (${wins} wins, ${losses} losses)
P&L: $${totalPnl.toFixed(2)}
Buys: ${buys} | Sells: ${sells} | Redeems: ${redeems}
Avg entry price: $${avgEntry.toFixed(4)}
Avg exit price: $${avgExit.toFixed(4)}
Date range: ${new Date(Math.min(...trades.map(t => t.timestamp))*1000).toISOString().slice(0,10)} → ${new Date(Math.max(...trades.map(t => t.timestamp))*1000).toISOString().slice(0,10)}

Write 1-2 concise sentences analyzing the trading performance on this market.
Focus on: what the trader did well, what they did poorly, and one actionable suggestion.
Be direct and specific — mention actual numbers. No fluff. No disclaimers.`;

  return await runAi(env, prompt);
}

/**
 * Generate a top-level summary for all recent trading activity.
 */
export async function overallSummary(env, overall, coinPnl, tfPnl, topMarkets, days) {
  const topCoins = coinPnl.slice(0, 4);
  const bestCoin = coinPnl.length > 0 ? coinPnl[0] : null;
  const worstCoin = coinPnl.length > 1 ? coinPnl[coinPnl.length - 1] : null;

  const prompt = `You are a trading coach analyzing Polymarket prediction market activity over the ${days > 0 ? `last ${days} days` : "entire history"}.

Overall P&L: $${overall.total_pnl.toFixed(2)} across ${overall.trade_count} trades on ${overall.unique_markets} markets.
Win rate: ${(overall.win_rate * 100).toFixed(1)}% (${overall.win_count}W / ${overall.loss_count}L)
Date range: ${overall.date_range}

By coin:
${topCoins.map(c => `  ${c.coin}: $${c.pnl.toFixed(2)} (${c.trade_count} trades, ${(c.win_rate*100).toFixed(0)}% win rate)`).join("\n")}

Top markets:
${topMarkets.slice(0, 5).map(m => `  ${m.display_name}: $${m.pnl.toFixed(2)} (${m.trade_count} trades)`).join("\n")}

Write 3-4 sentences analyzing overall trading performance. Cover: biggest strengths, biggest weaknesses, and the single most impactful change the trader should make. Be direct and specific — mention actual numbers. No fluff. No disclaimers. No markdown formatting.`;

  return await runAi(env, prompt);
}

// ──────────────────────────────────────────────────────────────
// AI helper
// ──────────────────────────────────────────────────────────────

async function runAi(env, prompt) {
  if (!env.AI) {
    return "AI commentary not available — no Workers AI binding configured.";
  }

  try {
    const response = await env.AI.run(AI_MODEL, {
      prompt,
      stream: false,
      max_tokens: 300,
      temperature: 0.7,
    });
    return (response?.response || "").trim();
  } catch (e) {
    console.error("AI error:", e.message);
    return "AI commentary unavailable at this time.";
  }
}
