"""Diagnose P&L discrepancy: our +$12 vs portfolio -$1,529.72."""
import json
from collections import Counter

WALLET = "0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e"
CACHE = f"cache/{WALLET}.json"

with open(CACHE) as f:
    data = json.load(f)
rows = data["rows"]

print(f"Total raw rows: {len(rows)}")
print()

# Type distribution
types = Counter(r.get("type") for r in rows)
print("=== Type distribution ===")
for t, n in types.most_common():
    print(f"  {t}: {n}")
print()

# For TRADE rows, BUY vs SELL
trade_rows = [r for r in rows if r.get("type") == "TRADE"]
trade_sides = Counter(r.get("side") for r in trade_rows)
print("=== TRADE side distribution ===")
for s, n in trade_sides.most_common():
    samples = [r for r in trade_rows if r.get("side") == s][:3]
    total_usdc = sum(float(r.get("usdcSize", 0) or 0) for r in trade_rows if r.get("side") == s)
    print(f"  {s}: {n} rows, total usdcSize=${total_usdc:.2f}")
    for r in samples:
        print(f"    usdcSize={r.get('usdcSize')} price={r.get('price')} size={r.get('size')} outcome={r.get('outcome')}")
print()

# For non-TRADE rows
non_trade = [r for r in rows if r.get("type") != "TRADE"]
for t in sorted(set(r.get("type") for r in non_trade)):
    samples = [r for r in non_trade if r.get("type") == t][:3]
    total_usdc = sum(float(r.get("usdcSize", 0) or 0) for r in non_trade if r.get("type") == t)
    total_size = sum(float(r.get("size", 0) or 0) for r in non_trade if r.get("type") == t)
    print(f"=== {t}: {sum(1 for r in non_trade if r.get('type')==t)} rows, total usdcSize=${total_usdc:.2f}, total size=${total_size:.2f} ===")
    for r in samples:
        print(f"    usdcSize={r.get('usdcSize')} price={r.get('price')} size={r.get('size')} side={r.get('side')} outcome={r.get('outcome')}")
print()

# What does the Polymarket portfolio page actually count?
# The portfolio page "realized P&L" is: total_payout - total_cost
# total_cost = sum of all BUY usdcSize
# total_payout = sum of all SELL usdcSize + REDEEM usdcSize + MERGE usdcSize + MAKER_REBATE usdcSize

buys = [r for r in trade_rows if r.get("side") == "BUY"]
sells = [r for r in trade_rows if r.get("side") == "SELL"]
total_buy_cost = sum(float(r.get("usdcSize", 0) or 0) for r in buys)
total_sell_revenue = sum(float(r.get("usdcSize", 0) or 0) for r in sells)
total_redeem = sum(float(r.get("usdcSize", 0) or 0) for r in rows if r.get("type") == "REDEEM")
total_merge = sum(float(r.get("usdcSize", 0) or 0) for r in rows if r.get("type") == "MERGE")
total_rebate = sum(float(r.get("usdcSize", 0) or 0) for r in rows if r.get("type") == "MAKER_REBATE")

print("=== P&L Decomposition ===")
print(f"  BUY cost (negative):       -${total_buy_cost:.2f}")
print(f"  SELL revenue (positive):    +${total_sell_revenue:.2f}")
print(f"  REDEEM (positive):          +${total_redeem:.2f}")
print(f"  MERGE (positive):           +${total_merge:.2f}")
print(f"  MAKER_REBATE (positive):    +${total_rebate:.2f}")
print()

total_out = total_buy_cost
total_in = total_sell_revenue + total_redeem + total_merge + total_rebate
net_pnl = total_in - total_out
print(f"  Total IN:  ${total_in:.2f}")
print(f"  Total OUT: -${total_out:.2f}")
print(f"  Net P&L:   ${net_pnl:.2f}")
print()

# What if the API is simply missing most of the historical data?
ts = [int(r.get("timestamp", 0)) for r in rows if r.get("timestamp")]
from datetime import datetime, timezone
if ts:
    print(f"Timestamp range: {datetime.fromtimestamp(min(ts), tz=timezone.utc)} to {datetime.fromtimestamp(max(ts), tz=timezone.utc)}")
    print(f"Days covered: {(max(ts)-min(ts))/86400:.1f}")
print()

# How many pages did we get? (200 per page)
print(f"Estimated pages: {len(rows)//200 + 1}")
print()

# Try fetching more pages to see if there's older data
import urllib.request, urllib.error, urllib.parse, time

PAGE_SIZE = 200
ACTIVITY_URL = "https://data-api.polymarket.com/activity"

# Try page 16 onward (we got ~16 pages)
for offset in [3200, 3400, 3600, 3800, 4000]:
    params = {"user": WALLET, "limit": PAGE_SIZE, "offset": offset, "sortDirection": "DESC"}
    url = f"{ACTIVITY_URL}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PolymarketHistoryViewer/1.0", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            page = json.loads(body)
        print(f"offset={offset}: {len(page)} rows", end="")
        if page:
            ts2 = int(page[-1].get("timestamp", 0))
            print(f", oldest={datetime.fromtimestamp(ts2, tz=timezone.utc)}")
        else:
            print()
    except urllib.error.HTTPError as e:
        print(f"offset={offset}: HTTP {e.code}")
    except Exception as e:
        print(f"offset={offset}: {e}")
    time.sleep(0.5)
