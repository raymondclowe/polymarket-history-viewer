"""Prove the time-window-asymmetry theory:
Buys from before the window are missing, but their payouts (redeems/merges/maker_rebates)
within the window appear as pure profit -> inflated P&L.
"""
from data_loader import get_activity
from data_processor import api_rows_to_dataframe, compute_overall_pnl
from datetime import datetime, timezone, timedelta

wallet = "0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e"

# 1) Fetch ALL data (wide window)
now_ts = int(datetime.now(tz=timezone.utc).timestamp())
wide_since = 0
rows_all, meta = get_activity(wallet, since_ts=wide_since, until_ts=now_ts)
df_all = api_rows_to_dataframe(rows_all)
pnl_all = compute_overall_pnl(df_all)
print("=== ALL data (since=0) ===")
print(f"P&L: ${pnl_all['total_pnl']:.2f}")
print(f"Rows: {len(df_all)}")
print(f"Timestamp range: {datetime.fromtimestamp(df_all['timestamp'].min(), tz=timezone.utc)} to {datetime.fromtimestamp(df_all['timestamp'].max(), tz=timezone.utc)}")
print()

# 2) Fetch just "last 7 days" 
week_ago_ts = int((datetime.now(tz=timezone.utc) - timedelta(days=7)).timestamp())
rows_7d, meta7 = get_activity(wallet, since_ts=week_ago_ts, until_ts=now_ts)
df_7d = api_rows_to_dataframe(rows_7d)
pnl_7d = compute_overall_pnl(df_7d)
print("=== Last 7 days only ===")
print(f"P&L: ${pnl_7d['total_pnl']:.2f}")
print(f"Rows: {len(df_7d)}")
print()

# 3) Compare buy/exit counts
for label, df in [("ALL DATA", df_all), ("LAST 7D", df_7d)]:
    buys = len(df[df["type"] == "TRADE"])
    redeems = len(df[df["type"] == "REDEEM"])
    merges = len(df[df["type"] == "MERGE"])
    exits = redeems + merges
    buy_vol = df[df["type"] == "TRADE"]["signed_usdc"].sum()
    exit_vol = df[df["type"].isin(["REDEEM", "MERGE"])]["signed_usdc"].sum()
    print(f"{label}: buys={buys} (${buy_vol:.2f}), redeems={redeems}, merges={merges}, total_exits={exits} (${exit_vol:.2f})")
