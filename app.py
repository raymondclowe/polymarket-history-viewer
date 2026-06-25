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


def _fmt_pnl(val: float, invested: float = 0.0) -> str:
    """Format P&L as $ or % depending on global pct_mode."""
    if pct_mode:  # noqa: F821 — set at module level by sidebar radio
        if invested == 0:
            return "—"
        return f"{val / invested * 100:+.1f}%"
    sign = "+" if val >= 0 else ""
    return f"{sign}${val:,.2f}"


def _tx_link(tx_hash: str) -> str:
    """PolygonScan transaction link."""
    if not tx_hash:
        return ""
    return f"https://polygonscan.com/tx/{tx_hash}"


# ─────────────────────────────────────────────────────────────
# Data loading (cached)
# ─────────────────────────────────────────────────────────────

@st.cache_data(ttl=300, show_spinner="Fetching from API...")
def _cached_api_fetch(
    wallet: str,
    force_refresh: bool = False,
) -> tuple[pd.DataFrame, dict]:
    """Cached wrapper around get_activity.

    No time-window parameters — ALL available data is fetched so that
    P&L calculations have complete cost basis for every closed position.
    Time window filtering is applied later at the display layer only.
    """
    rows, meta = get_activity(
        wallet=wallet,
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

# Refresh / clear cache
force_refresh = False
if source in ("Live API", "Both"):
    if st.sidebar.button("🗑 Clear Cache", help="Delete cached API data and fetch fresh from Polymarket", width="stretch"):
        force_refresh = True
        st.cache_data.clear()
        st.sidebar.success("Cache cleared — next load will fetch fresh data")

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
    if preset_cols[i].button(label, width="stretch", key=f"preset_{label}"):
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

# ─────────────────────────────────────────────────────────────
# Display mode toggle
# ─────────────────────────────────────────────────────────────

st.sidebar.header("Display")
pct_mode = st.sidebar.radio(
    "P&L Format",
    options=["$ USD", "% Return"],
    index=0,
    help="%: P&L relative to capital deployed (BUY + SPLIT USDC volume per group).",
)
pct_mode = pct_mode == "% Return"

# Convert to Unix timestamps for API queries
since_ts = int(datetime.combine(date_start, datetime.min.time(), tzinfo=timezone.utc).timestamp())
until_ts = int(datetime.combine(date_end, datetime.max.time(), tzinfo=timezone.utc).timestamp())

# ─────────────────────────────────────────────────────────────
# Load data
# ─────────────────────────────────────────────────────────────

df = pd.DataFrame()
meta = {}

if source in ("Live API", "Both") and wallet_input:
    df_api, meta = _cached_api_fetch(wallet_input, force_refresh)
    df = df_api

if source in ("CSV files", "Both") and csv_wallet:
    df_csv = _cached_csv_load(data_dir, wallet_name=csv_wallet)
    if not df_csv.empty:
        if source == "Both" and not df.empty:
            df = pd.concat([df, df_csv], ignore_index=True)
        else:
            df = df_csv

# Apply time filter at the display layer (after loading complete data for cost basis).
# "All time" preset uses since=2020-01-01 so the filter is a no-op.
if not df.empty and "timestamp" in df.columns:
    df = df[(df["timestamp"] >= since_ts) & (df["timestamp"] <= until_ts)]

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
            issues.append(f"⚠️ {oow} rows from outside your date range ignored ({pct:.0f}% — API may have sent old data, try a smaller date range)")
        else:
            issues.append(f"📅 {oow} rows outside time window skipped")
    if meta.get("integrity_failures", 0) > 0:
        issues.append(f"❌ {meta['integrity_failures']} integrity failures skipped")
    if meta.get("fetch_duration_ms", 0) > 0 and not meta.get("cached"):
        issues.append(f"⏱ Fetched in {meta['fetch_duration_ms']:.0f}ms")

    if issues:
        st.info(" | ".join(issues))

# Show data date range so users understand API window limits
if "timestamp" in df.columns and not df.empty:
    from datetime import datetime as _dt
    ts_col = df["timestamp"]
    oldest = _dt.fromtimestamp(int(ts_col.min()), tz=timezone.utc).strftime("%b %d, %Y")
    newest = _dt.fromtimestamp(int(ts_col.max()), tz=timezone.utc).strftime("%b %d, %Y")
    range_msg = f"📅 Data range: {oldest} → {newest} ({len(df):,} rows)"

    st.caption(range_msg)

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
# NOTE: Streamlit multiselect with default=["ALL"] keeps "ALL" selected when the user
# picks a specific option — the selection becomes ["ALL", "BTC"].
# We strip "ALL" so the filter actually takes effect.

filtered = df.copy()
if "ALL" in selected_coins and len(selected_coins) > 1:
    selected_coins = [c for c in selected_coins if c != "ALL"]
if "ALL" in selected_tfs and len(selected_tfs) > 1:
    selected_tfs = [t for t in selected_tfs if t != "ALL"]
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
    st.metric("Total P&L", _fmt_pnl(overall["total_pnl"], overall["total_invested"]))
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
    coin_display["P&L"] = coin_display.apply(
        lambda r: _fmt_pnl(r["pnl"], r["invested"]), axis=1
    )
    coin_display["Win Rate"] = (coin_display["win_rate"] * 100).round(1).astype(str) + "%"
    st.dataframe(
        coin_display[["coin", "P&L", "trade_count", "unique_markets", "Win Rate"]].rename(
            columns={"coin": "Coin", "trade_count": "Trades", "unique_markets": "Markets"}
        ),
        width="stretch",
        hide_index=True,
    )

# ─────────────────────────────────────────────────────────────
# P&L by Timeframe
# ─────────────────────────────────────────────────────────────

st.subheader("P&L by Timeframe")
tf_pnl = compute_per_timeframe_pnl(filtered)
if not tf_pnl.empty:
    tf_display = tf_pnl.copy()
    tf_display["P&L"] = tf_display.apply(
        lambda r: _fmt_pnl(r["pnl"], r["invested"]), axis=1
    )
    st.dataframe(
        tf_display[["timeframe", "P&L", "trade_count", "unique_markets"]].rename(
            columns={
                "timeframe": "Timeframe",
                "trade_count": "Trades",
                "unique_markets": "Markets",
            }
        ),
        width="stretch",
        hide_index=True,
    )

# ─────────────────────────────────────────────────────────────
# Market detail table (clickable)
# ─────────────────────────────────────────────────────────────

st.subheader("Market Details")
market_pnl = compute_per_market_pnl(filtered)

if not market_pnl.empty:
    # Determine which column uniquely identifies a market in the raw data
    _slug_usable = "slug" in filtered.columns and not (
        filtered["slug"].isna().all() or (filtered["slug"] == "").all()
    )
    raw_key_col = "slug" if _slug_usable else "title"

    # Build display DataFrame with a unique key column for lookups
    mkt = market_pnl.reset_index(drop=True)
    mkt["_raw_key"] = mkt.get(raw_key_col, mkt.get("title", ""))
    mkt["_raw_key"] = mkt["_raw_key"].fillna("")

    # Sort
    sort_col = st.selectbox(
        "Sort by",
        options=["P&L", "Market", "Coin", "TF", "Trades", "First Trade", "Last Trade"],
        index=0,
        key="market_sort",
    )
    sort_map = {
        "P&L": "pnl",
        "Market": "display_name",
        "Coin": "coin",
        "TF": "timeframe",
        "Trades": "trade_count",
        "First Trade": "first_trade",
        "Last Trade": "last_trade",
    }
    sort_by = sort_map.get(sort_col, "pnl")
    ascending = sort_by == "pnl"  # highest P&L first
    mkt = mkt.sort_values(sort_by, ascending=not ascending).reset_index(drop=True)

    # Display columns (no raw key)
    display_df = mkt[[
        "display_name", "coin", "timeframe", "pnl", "invested", "trade_count",
        "first_trade_dt", "last_trade_dt", "slug",
    ]].rename(columns={
        "display_name": "Market",
        "coin": "Coin",
        "timeframe": "TF",
        "pnl": "P&L",
        "trade_count": "Trades",
        "first_trade_dt": "First Trade",
        "last_trade_dt": "Last Trade",
        "slug": "Link",
    }).copy()
    display_df["P&L"] = display_df.apply(
        lambda r: _fmt_pnl(r["P&L"], r["invested"]), axis=1
    )
    display_df = display_df.drop(columns=["invested"])

    # Build Polymarket event URLs from slugs (skip synthetic slugs)
    display_df["Link"] = display_df["Link"].apply(
        lambda s: f"https://polymarket.com/event/{s}"
        if s and s != "" and not s.startswith("__")
        else ""
    )

    # Clickable table — click a row to drill down
    st.caption("👆 Click any row above to see its individual trades below")
    event = st.dataframe(
        display_df,
        width="stretch",
        hide_index=True,
        selection_mode="single-row",
        on_select="rerun",
        key="market_detail_table",
        column_config={
            "Link": st.column_config.LinkColumn("Link", display_text="🔗"),
        },
    )

    # ─────────────────────────────────────────────────────────
    # Drill-down: show trades for the selected market
    # ─────────────────────────────────────────────────────────

    st.subheader("Drill-Down: Market Trades")

    selected_rows = event.selection.get("rows", []) if event.selection else []

    if selected_rows:
        selected_idx = selected_rows[0]
        row = mkt.iloc[selected_idx]
        raw_key = row["_raw_key"]
        display_label = row.get("display_name", row.get("title", ""))
        market_slug = row.get("slug", "")

        market_trades = filtered[filtered[raw_key_col] == raw_key].copy()

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

            trade_display["Tx"] = trade_display["transactionHash"].apply(
                lambda h: f"https://polygonscan.com/tx/{h}" if h else ""
            )

            trade_display = trade_display.rename(columns={
                "type": "Type",
                "side": "Side",
                "outcome": "Outcome",
                "size": "Shares",
            })

            st.dataframe(
                trade_display[["Time", "Type", "Side", "Outcome", "Price", "Shares", "USDC", "P&L", "Tx"]],
                width="stretch",
                hide_index=True,
                column_config={
                    "Tx": st.column_config.LinkColumn("Tx", display_text="🔗"),
                },
            )

            # Market P&L summary
            market_pnl_total = market_trades["signed_usdc"].sum()
            market_invested = market_trades[market_trades["type"].isin(["BUY", "SPLIT"])]["usdcSize"].sum()
            market_trade_count = len(market_trades)

            # Polymarket event link (skip for platform transactions / synthetic slugs)
            if market_slug and not market_slug.startswith("__"):
                event_url = f"https://polymarket.com/event/{market_slug}"
                st.markdown(f"[🔗 View on Polymarket]({event_url})")

            st.metric(
                f"Market P&L: {display_label}",
                _fmt_pnl(market_pnl_total, market_invested),
                delta=f"{market_trade_count} trades",
            )
        else:
            st.info("No trade details available for this market.")
    else:
        st.info("Click a row in the Market Details table above to see individual trades.")

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
