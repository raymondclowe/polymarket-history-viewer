"""Slice to 7 days and compare P&L with user's -$41 claim."""
import pandas as pd
from datetime import datetime, timezone, timedelta
from data_loader import get_activity
from data_processor import api_rows_to_dataframe, compute_overall_pnl

rows, meta = get_activity("0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e")
df = api_rows_to_dataframe(rows)

now = datetime.now(tz=timezone.utc)
week_ago = now - timedelta(days=7)
cutoff = int(week_ago.timestamp())
print(f"Current time: {now}")
print(f"Week ago: {week_ago}")
print(f"Data ts range: {df['timestamp'].min()} to {df['timestamp'].max()}")
print(f"Rows before filter: {len(df)}")

mask = df["timestamp"] >= cutoff
df_7d = df[mask].copy()
pnl_7d = compute_overall_pnl(df_7d)
print(f"Rows after 7d filter: {len(df_7d)}")
print(f"7-day P&L: ${pnl_7d['total_pnl']:.2f}")
print()

for t in df_7d["type"].unique():
    subset = df_7d[df_7d["type"] == t]
    print(f"  {t}: {len(subset)} rows, signed_usdc sum=${subset['signed_usdc'].sum():.2f}")

print()

# Also show the actual portfolio page calculation:
# The Polymarket portfolio shows REALIZED P&L. That's:
# - For SELLs: revenue - cost of that particular position
# - For REDEEMs: payout ($1 per token) - cost of those tokens
# The REDEEM usdcSize IS the payout already. The BUY usdcSize IS the cost.
# So realized P&L = sum(SELL signed_usdc) + sum(REDEEM signed_usdc) + sum(MERGE signed_usdc)
# minus the cost basis of ONLY the positions that were closed.

# In our calculation, we count ALL BUYs (including open positions) as negative.
# The portfolio page only counts BUYs that have been closed (paired with a SELL or REDEEM).
# So if there are many open BUYs, our number would be MORE negative than the portfolio page.
# But our number is +$12 and portfolio is -$1,529. That's backwards.

# Actually the portfolio page all-time number includes data we can't see (pre-June 8).
# But the user also says their 1-week loss is $41! Let me check that.
# If the portfolio page shows -$41 for just the last week, and our 7-day says +$X,
# then there's a different bug.

buys = df_7d[df_7d["type"] == "TRADE"]
buy_cost_sum = buys[buys["side"] == "BUY"]["usdcSize"].sum()
sell_rev_sum = buys[buys["side"] == "SELL"]["usdcSize"].sum()
redeem_sum = df_7d[df_7d["type"] == "REDEEM"]["usdcSize"].sum()
merge_sum = df_7d[df_7d["type"] == "MERGE"]["usdcSize"].sum()
rebate_sum = df_7d[df_7d["type"] == "MAKER_REBATE"]["usdcSize"].sum()

print("=== 7-day P&L decomposition ===")
print(f"  BUY cost (neg):       -${buy_cost_sum:.2f}")
print(f"  SELL revenue (pos):   +${sell_rev_sum:.2f}")
print(f"  REDEEM (pos):         +${redeem_sum:.2f}")
print(f"  MERGE (pos):          +${merge_sum:.2f}")
print(f"  MAKER_REBATE (pos):   +${rebate_sum:.2f}")
net = sell_rev_sum + redeem_sum + merge_sum + rebate_sum - buy_cost_sum
print(f"  Net P&L:              ${net:.2f}")
