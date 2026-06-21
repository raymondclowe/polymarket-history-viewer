"""Fetch ALL API data with large page size and compute P&L."""
import urllib.request, urllib.parse, json, time
from datetime import datetime, timezone
from data_processor import api_rows_to_dataframe, compute_overall_pnl

wallet = "0xc1c66EedC6Fb6DeA58e5dd9875b04140f8a7C88e"
url = "https://data-api.polymarket.com/activity"

all_rows = []
limit = 1000
for offset in range(0, 10000, limit):
    params = {"user": wallet, "limit": limit, "offset": offset, "sortDirection": "DESC"}
    full_url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url, headers={"User-Agent": "PolymarketHistoryViewer/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode()
            page = json.loads(body)
        if not page:
            print(f"offset={offset}: empty page, stopping")
            break
        all_rows.extend(page)
        ts_oldest = int(page[-1].get("timestamp", 0))
        oldest = datetime.fromtimestamp(ts_oldest, tz=timezone.utc)
        print(f"offset={offset}: {len(page)} rows, oldest={oldest}")
        if len(page) < limit:
            print(f"  last page has {len(page)} rows (incomplete), stopping")
            break
        time.sleep(0.3)
    except urllib.error.HTTPError as e:
        print(f"offset={offset}: HTTP {e.code}, stopping")
        break

print(f"\nTotal rows: {len(all_rows)}")

df = api_rows_to_dataframe(all_rows)
pnl = compute_overall_pnl(df)
print(f"P&L all available data: ${pnl['total_pnl']:.2f}")

ts_min = df["timestamp"].min()
ts_max = df["timestamp"].max()
print(f"Date range: {datetime.fromtimestamp(ts_min, tz=timezone.utc)} to {datetime.fromtimestamp(ts_max, tz=timezone.utc)}")
now = datetime.now(tz=timezone.utc)
cutoff = int(now.timestamp() - 7*86400)
mask = df["timestamp"] >= cutoff
df7 = df[mask].copy()
pnl7 = compute_overall_pnl(df7)
print(f"7-day P&L: ${pnl7['total_pnl']:.2f}")
print(f"7-day rows: {len(df7)}")
tmin = datetime.fromtimestamp(df7["timestamp"].min(), tz=timezone.utc)
tmax = datetime.fromtimestamp(df7["timestamp"].max(), tz=timezone.utc)
print(f"7-day date range: {tmin} to {tmax}")
