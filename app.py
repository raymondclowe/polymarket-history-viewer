"""
Polymarket History Viewer — P&L Dashboard

Streamlit app for analyzing Polymarket trade history.
Live API fetch (primary) with file-based JSON cache and CSV fallback.

Usage:
  uv run streamlit run app.py
"""

from __future__ import annotations

import re as _re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import streamlit as st
from streamlit import session_state as ss

from data_loader import get_activity, load_all_wallets, load_csvs_from_wallet
from data_processor import (
    api_rows_to_dataframe,
    compute_overall_pnl,
    compute_per_coin_pnl,
    compute_per_market_pnl,
    compute_per_timeframe_pnl,
    normalize_csv_dataframe,
)

# ─────────────────────────────────────────────────────────────
# Page config
# ─────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Polymarket History Viewer",
    page_icon="📊",
    layout="wide",
)

st.title("📊 Polymarket History Viewer")
st.caption("P&L dashboard — connect a wallet or load CSV files")

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _fmt_usd(val: float) -> str:
    """Format a USD value with sign and 2 decimal places."""
    sign = "+" if val >= 0 else ""
    return f"{sign}${val:,.2f}"


def _color_pnl(val: float) -> str:
    """Return CSS color for a P&L value."""
    if val > 0:
        return "color: #16a34a"
    if val < 0:
        return "color: #dc2626"
    return "color: #6b7280"


def _tx_link(tx_hash: str) -> str:
    """Polymarket transaction link."""
    if not tx_hash:
        return ""
    return f"https://polymarket.com/tx/{tx_hash}"


# ─────────────────────────────────────────────────────────────
# Data loading (cached)
# ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner="Fetching from API...")
def _cached_api_fetch(
    wallet: str,
    since_ts: int,
    until_ts: int,
    force_refresh: bool = False,
) -> tuple[pd.DataFrame, dict]:
    """Cached wrapper around get_activity."""
    rows, meta = get_activity(
        wallet=wallet,
        since_ts=since_ts,
        until_ts=until_ts,
        force_refresh=force_refresh,
    )
    df = api_rows_to_dataframe(rows)
    return df, meta


@st.cache_data(show_spinner="Loading CSVs...")
def _cached_csv_load(data_dir: str, wallet_name: str | None = None) -> pd.DataFrame:
    """Cached CSV loader."""
    if wallet_name:
        df = load_csvs_from_wallet(data_dir, wallet_name)
    else:
        wallets = load_all_wallets(data_dir)
        if not wallets:
            return pd.DataFrame()
        # Merge all wallets
        dfs = [normalize_csv_dataframe(d) for d in wallets.values()]
        df = pd.concat(dfs, ignore_index=True)
    return normalize_csv_dataframe(df)


# ─────────────────────────────────────────────────────────────
# Sidebar
# ─────────────────────────────────────────────────────────────

st.sidebar.header("Data Source")

# Wallet input
wallet_input = st.sidebar.text_input(
    "Wallet address",
    value="",
    placeholder="0x...",
    help="Enter a Polymarket wallet address for live API fetch",
)

# CSV wallet folders found
data_dir = "data"
csv_wallets = []
try:
    data_path = Path(data_dir)
    if data_path.exists():
        csv_wallets = sorted(
            [d.name for d in data_path.iterdir() if d.is_dir() and not d.name.startswith(".")]
        )
except Exception:
    pass

# Data source selector
source = st.sidebar.radio(
    "Source",
    options=["Live API", "CSV files", "Both"],
    index=0,
    help="Live API: fetch from Polymarket data API. CSV: load from data/<wallet>/ folder.",
)

# If using CSV, show wallet picker
csv_wallet = None
if source in ("CSV files", "Both"):
    if csv_wallets:
        csv_wallet = st.sidebar.selectbox(
            "CSV wallet folder",
            options=csv_wallets,
            index=0,
        )
    else:
        st.sidebar.warning("No CSV folders found in data/")

# Refresh button (API only)
force_refresh = False
if source in ("Live API", "Both"):
    col1, col2 = st.sidebar.columns([3, 1])
    if col2.button("🔄", help="Force refresh from API (skip cache)"):
        force_refresh = True
        st.cache_data.clear()

# ─────────────────────────────────────────────────────────────
# Time filter
# ─────────────────────────────────────────────────────────────

st.sidebar.header("Time Filter")

time_presets = {
    "Today": (date.today(), date.today()),
    "Last 24h": (date.today() - timedelta(days=1), date.today()),
    "Last 7 days": (date.today() - timedelta(days=7), date.today()),
    "All time": (date(2020, 1, 1), date.today()),
}

preset_cols = st.sidebar.columns(len(time_presets))
selected_preset = None
for i, (label, _) in enumerate(time_presets.items()):
    if preset_cols[i].button(label, use_container_width=True, key=f"preset_{label}"):
        selected_preset = label

# Initialize session state for date range
if "date_start" not in ss:
    ss.date_start = date.today() - timedelta(days=7)
if "date_end" not in ss:
    ss.date_end = date.today()

if selected_preset:
    ss.date_start, ss.date_end = time_presets[selected_preset]

date_start = st.sidebar.date_input("Start date", value=ss.date_start)
date_end = st.sidebar.date_input("End date", value=ss.date_end)
ss.date_start = date_start
ss.date_end = date_end

# Convert to Unix timestamps for API queries
since_ts = int(datetime.combine(date_start, datetime.min.time(), tzinfo=timezone.utc).timestamp())
until_ts = int(datetime.combine(date_end, datetime.max.time(), tzinfo=timezone.utc).timestamp())

# ─────────────────────────────────────────────────────────────
# Load data
# ─────────────────────────────────────────────────────────────

df = pd.DataFrame()
meta = {}

if source in ("Live API", "Both") and wallet_input:
    df_api, meta = _cached_api_fetch(wallet_input, since_ts, until_ts, force_refresh)
    df = df_api

if source in ("CSV files", "Both") and csv_wallet:
    df_csv = _cached_csv_load(data_dir, wallet_name=csv_wallet)
    if not df_csv.empty:
        # Time-filter CSV data
        if "timestamp" in df_csv.columns:
            df_csv = df_csv[
                (df_csv["timestamp"] >= since_ts) & (df_csv["timestamp"] <= until_ts)
            ]
        if source == "Both" and not df.empty:
            df = pd.concat([df, df_csv], ignore_index=True)
        else:
            df = df_csv

# No data
if df.empty:
    st.info("👈 Enter a wallet address and click a time preset, or select a CSV wallet folder to load data.")
    st.stop()

# ─────────────────────────────────────────────────────────────
# Data quality banner
# ─────────────────────────────────────────────────────────────

if meta:
    issues = []
    if meta.get("cached"):
        fetched_at = time.time()  # approximate
        issues.append("📦 Loaded from cache")
    if meta.get("duplicates_removed", 0) > 0:
        issues.append(f"🗑 {meta['duplicates_removed']} duplicates removed")
    if meta.get("out_of_window_removed", 0) > 0:
        oow = meta["out_of_window_removed"]
        pct = oow / max(meta.get("total_raw", 1), 1) * 100
        if pct > 50:
            issues.append(f"⚠️ {oow} rows outside time window ({pct:.0f}% — API returned mostly stale data)")
        else:
            issues.append(f"📅 {oow} rows outside time window skipped")
    if meta.get("integrity_failures", 0) > 0:
        issues.append(f"❌ {meta['integrity_failures']} integrity failures skipped")
    if meta.get("fetch_duration_ms", 0) > 0 and not meta.get("cached"):
        issues.append(f"⏱ Fetched in {meta['fetch_duration_ms']:.0f}ms")

    if issues:
        st.info(" | ".join(issues))

# ─────────────────────────────────────────────────────────────
# Coin & Timeframe filters (from actual data)
# ─────────────────────────────────────────────────────────────

filter_col1, filter_col2 = st.columns(2)

with filter_col1:
    available_coins = sorted([c for c in df["coin"].unique() if c and c != "OTHER"])
    if not available_coins:
        available_coins = ["ALL"]
    selected_coins = st.multiselect(
        "Coin",
        options=["ALL"] + available_coins,
        default=["ALL"],
    )

with filter_col2:
    available_tfs = sorted([
        t for t in df["timeframe"].unique() if t and t != "N/A"
    ], key=lambda x: (x[-1], int(_re.match(r"(\d+)", x).group(1)) if _re.match(r"(\d+)", x) else 0))
    if not available_tfs:
        available_tfs = ["ALL"]
    selected_tfs = st.multiselect(
        "Timeframe",
        options=["ALL"] + available_tfs,
        default=["ALL"],
    )

# Apply filters

filtered = df.copy()
if "ALL" not in selected_coins:
    filtered = filtered[filtered["coin"].isin(selected_coins)]
if "ALL" not in selected_tfs:
    filtered = filtered[filtered["timeframe"].isin(selected_tfs)]

if filtered.empty:
    st.warning("No data matches the selected filters.")
    st.stop()

# ─────────────────────────────────────────────────────────────
# Summary cards
# ─────────────────────────────────────────────────────────────

overall = compute_overall_pnl(filtered)

c1, c2, c3, c4, c5 = st.columns(5)
with c1:
    st.metric("Total P&L", _fmt_usd(overall["total_pnl"]))
with c2:
    st.metric("Trades", overall["trade_count"])
with c3:
    st.metric("Markets", overall["unique_markets"])
with c4:
    win_rate_pct = f"{overall['win_rate'] * 100:.1f}%"
    st.metric("Win Rate", win_rate_pct)
with c5:
    st.metric("W / L", f"{overall['win_count']} / {overall['loss_count']}")

# ─────────────────────────────────────────────────────────────
# P&L by Coin
# ─────────────────────────────────────────────────────────────

st.subheader("P&L by Coin")
coin_pnl = compute_per_coin_pnl(filtered)
if not coin_pnl.empty:
    coin_display = coin_pnl.copy()
    coin_display["P&L"] = coin_display["pnl"].apply(_fmt_usd)
    coin_display["Win Rate"] = (coin_display["win_rate"] * 100).round(1).astype(str) + "%"
    st.dataframe(
        coin_display[["coin", "P&L", "trade_count", "unique_markets", "Win Rate"]].rename(
            columns={"coin": "Coin", "trade_count": "Trades", "unique_markets": "Markets"}
        ),
        use_container_width=True,
        hide_index=True,
    )

# ─────────────────────────────────────────────────────────────
# P&L by Timeframe
# ─────────────────────────────────────────────────────────────

st.subheader("P&L by Timeframe")
tf_pnl = compute_per_timeframe_pnl(filtered)
if not tf_pnl.empty:
    tf_display = tf_pnl.copy()
    tf_display["P&L"] = tf_display["pnl"].apply(_fmt_usd)
    st.dataframe(
        tf_display[["timeframe", "P&L", "trade_count", "unique_markets"]].rename(
            columns={
                "timeframe": "Timeframe",
                "trade_count": "Trades",
                "unique_markets": "Markets",
            }
        ),
        use_container_width=True,
        hide_index=True,
    )

# ─────────────────────────────────────────────────────────────
# Market detail table
# ─────────────────────────────────────────────────────────────

st.subheader("Market Details")
market_pnl = compute_per_market_pnl(filtered)

if not market_pnl.empty:
    # Prepare display table
    display_cols = {
        "display_name": "Market",
        "coin": "Coin",
        "timeframe": "TF",
        "pnl": "P&L",
        "trade_count": "Trades",
        "first_trade_dt": "First Trade",
        "last_trade_dt": "Last Trade",
    }
    display_df = market_pnl[list(display_cols.keys())].rename(columns=display_cols).copy()
    display_df["P&L"] = display_df["P&L"].apply(_fmt_usd)

    # Sort options
    sort_col = st.selectbox(
        "Sort by",
        options=["P&L", "Market", "Coin", "TF", "Trades", "First Trade", "Last Trade"],
        index=0,
        key="market_sort",
    )

    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
    )

    # ─────────────────────────────────────────────────────────
    # Drill-down: select a market to see trades
    # ─────────────────────────────────────────────────────────

    st.subheader("Drill-Down: Market Trades")
    market_options = market_pnl["display_name"].tolist()
    selected_market = st.selectbox(
        "Select a market",
        options=market_options,
        index=0,
    )

    if selected_market:
        # Find the corresponding slug and/or title
        market_row = market_pnl[market_pnl["display_name"] == selected_market].iloc[0]
        market_slug = market_row.get("slug", "")
        market_title = market_row.get("title", "")

        # Get all trades for this market
        if market_slug and market_slug in filtered["slug"].values:
            market_trades = filtered[filtered["slug"] == market_slug].copy()
        elif market_title and market_title in filtered["title"].values:
            market_trades = filtered[filtered["title"] == market_title].copy()
        else:
            market_trades = pd.DataFrame()

        if not market_trades.empty:
            market_trades = market_trades.sort_values("timestamp", ascending=True)

            trade_display = market_trades[[
                "timestamp", "type", "side", "outcome", "price",
                "size", "usdcSize", "signed_usdc", "transactionHash",
            ]].copy()

            trade_display["Time"] = pd.to_datetime(
                trade_display["timestamp"], unit="s", utc=True
            ).dt.strftime("%Y-%m-%d %H:%M:%S")

            trade_display["P&L"] = trade_display["signed_usdc"].apply(_fmt_usd)
            trade_display["Price"] = trade_display["price"].apply(lambda p: f"${p:.4f}" if p > 0 else "")
            trade_display["USDC"] = trade_display["usdcSize"].apply(lambda u: f"${u:,.2f}" if u > 0 else "")

            # Transaction hash as link
            trade_display["Tx"] = trade_display["transactionHash"].apply(
                lambda h: f"https://polymarket.com/tx/{h}" if h else ""
            )

            trade_display = trade_display.rename(columns={
                "type": "Type",
                "side": "Side",
                "outcome": "Outcome",
                "size": "Shares",
            })

            st.dataframe(
                trade_display[["Time", "Type", "Side", "Outcome", "Price", "Shares", "USDC", "P&L", "Tx"]],
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Tx": st.column_config.LinkColumn("Tx", display_text="🔗"),
                },
            )

            # Market P&L summary
            market_pnl_total = market_trades["signed_usdc"].sum()
            market_trade_count = len(market_trades)
            st.metric(
                f"Market P&L: {selected_market}",
                _fmt_usd(market_pnl_total),
                delta=f"{market_trade_count} trades",
            )
        else:
            st.info("No trade details available for this market.")

# ─────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────

st.sidebar.header("Export")
csv_export = filtered.to_csv(index=False)
st.sidebar.download_button(
    label="📥 Download filtered data (CSV)",
    data=csv_export,
    file_name=f"polymarket_trades_{date.today().isoformat()}.csv",
    mime="text/csv",
)

# Market summary export
if not market_pnl.empty:
    export_summary = market_pnl.copy()
    export_summary["P&L"] = export_summary["pnl"].apply(lambda x: f"{x:.2f}")
    csv_summary = export_summary.to_csv(index=False)
    st.sidebar.download_button(
        label="📥 Download market summary (CSV)",
        data=csv_summary,
        file_name=f"polymarket_markets_{date.today().isoformat()}.csv",
        mime="text/csv",
    )
