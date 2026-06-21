"""Check CSV data for older history and compute P&L."""
import pandas as pd
from pathlib import Path
from data_processor import normalize_csv_dataframe, compute_overall_pnl, compute_per_market_pnl

files = sorted(Path("data/noble-tree").glob("*.csv"))
for f in files:
    df = pd.read_csv(f)
    if "timestamp" in df.columns:
        ts_min = str(df["timestamp"].min())
        ts_max = str(df["timestamp"].max())
        ts = ts_min + " to " + ts_max
    else:
        ts = "N/A"
    print(f"{f.name}: {len(df)} rows, timestamps={ts}")
    print(f"  Columns: {list(df.columns)}")
    print()

# Process full CSV
all_csv = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
normalized = normalize_csv_dataframe(all_csv)
pnl = compute_overall_pnl(normalized)
print(f"=== CSV P&L ===")
print(f"total_pnl: ${pnl['total_pnl']:.2f}")
print(f"trade_count: {pnl['trade_count']}")
print()
print("Per-market top 10:")
mpnl = compute_per_market_pnl(normalized)
print(mpnl.head(10).to_string())
