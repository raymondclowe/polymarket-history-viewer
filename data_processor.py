"""
data_processor.py — Normalize, extract features, and compute P&L from activity rows.

Works on both API-fetched rows (list of dicts) and CSV-loaded DataFrames.
The unified output is a DataFrame with standardized columns.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import pandas as pd


# Coin name → ticker mapping (from title text)
_COIN_PATTERNS = [
    ("Bitcoin", "BTC"),
    ("Ethereum", "ETH"),
    ("XRP", "XRP"),
    ("Solana", "SOL"),
    ("Bitcoin Cash", "BCH"),
    ("Litecoin", "LTC"),
    ("Dogecoin", "DOGE"),
]


def _extract_coin_from_title(title: str) -> str:
    """Parse coin ticker from market title text."""
    for name, ticker in _COIN_PATTERNS:
        if name in title:
            return ticker
    return "OTHER"


def _extract_coin_from_slug(slug: str) -> str:
    """Parse coin ticker from slug like 'btc-updown-15m-1775001900' or 'bitcoin-up-or-down-june-18-2026-5pm-et'."""
    parts = slug.split("-")
    if parts:
        coin = parts[0].upper()
        # Standard abbreviations
        if coin in ("BTC", "ETH", "XRP", "SOL", "BCH", "LTC", "DOGE"):
            return coin
        # Full-name slugs from hourly markets
        full_to_ticker = {
            "BITCOIN": "BTC",
            "ETHEREUM": "ETH",
            "XRP": "XRP",
            "SOLANA": "SOL",
            "LITECOIN": "LTC",
            "DOGECOIN": "DOGE",
        }
        if coin in full_to_ticker:
            return full_to_ticker[coin]
    return "OTHER"


def _extract_timeframe_from_slug(slug: str) -> str:
    """Parse timeframe from slug like 'btc-updown-15m-1775001900' or 'bitcoin-up-or-down-june-18-2026-5pm-et'."""
    m = re.search(r"-(\d+[mhd])-", slug)
    if m:
        return m.group(1)
    # Hourly markets: bitcoin-up-or-down-june-18-2026-5pm-et
    if re.search(r"-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+", slug, re.IGNORECASE):
        return "1h"
    return "N/A"


def _extract_timeframe_from_title(title: str) -> str:
    """Parse timeframe from title like 'XRP Up or Down - June 18, 7:10AM-7:15AM ET'."""
    # Pattern: HH:MM<AM|PM>-HH:MM<AM|PM> ET
    m = re.search(
        r"(\d{1,2}):(\d{2})(AM|PM)-(\d{1,2}):(\d{2})(AM|PM)\s*ET", title
    )
    if m:
        h1, m1, ampm1, h2, m2, ampm2 = m.groups()
        h1, m1, h2, m2 = int(h1), int(m1), int(h2), int(m2)
        if ampm1 == "PM" and h1 != 12:
            h1 += 12
        if ampm1 == "AM" and h1 == 12:
            h1 = 0
        if ampm2 == "PM" and h2 != 12:
            h2 += 12
        if ampm2 == "AM" and h2 == 12:
            h2 = 0
        start_mins = h1 * 60 + m1
        end_mins = h2 * 60 + m2
        delta = end_mins - start_mins
        if delta <= 0:
            delta += 1440  # midnight crossover

        if delta == 5:
            return "5m"
        if delta == 10:
            return "10m"
        if delta == 15:
            return "15m"
        if delta == 30:
            return "30m"
        if delta == 60:
            return "1h"
        return f"{delta}m"

    # "5PM ET" style (hourly market, no range)
    m2 = re.search(r"(\d{1,2})(PM|AM)\s*ET", title)
    if m2 and "-" not in title.split("ET")[0]:
        return "1h"

    return "N/A"


# ─────────────────────────────────────────────────────────────
# API rows → DataFrame
# ─────────────────────────────────────────────────────────────

def api_rows_to_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert raw API activity rows into a standardized DataFrame."""
    if not rows:
        return pd.DataFrame()

    records = []
    for row in rows:
        act_type = str(row.get("type", "")).upper()
        side = str(row.get("side", "")).upper()
        usdc_size = float(row.get("usdcSize", 0) or 0)
        price = float(row.get("price", 0) or 0)
        size = float(row.get("size", 0) or 0)
        slug = str(row.get("slug", ""))
        title = str(row.get("title", ""))
        outcome = str(row.get("outcome", ""))

        # Derive signed USDC amount
        # Balance movements (deposits, withdrawals, transfers) are not P&L — zero them.
        # MERGE is P&L income (give token pair, get $1 back).
        # SPLIT spends $1 to create tokens (money out, like BUY).
        if act_type in ("DEPOSIT", "WITHDRAWAL", "WITHDRAW", "TRANSFER"):
            signed_usdc = 0.0
        elif act_type == "SPLIT":
            signed_usdc = -usdc_size
        elif act_type == "TRADE" and side == "BUY":
            signed_usdc = -usdc_size
        else:
            signed_usdc = usdc_size

        records.append({
            "title": title,
            "slug": slug,
            "type": act_type,
            "side": side,
            "price": price,
            "size": size,
            "usdcSize": usdc_size,
            "signed_usdc": signed_usdc,
            "outcome": outcome,
            "timestamp": int(row.get("timestamp", 0) or 0),
            "transactionHash": str(row.get("transactionHash", "")),
        })

    df = pd.DataFrame(records)
    return _add_derived_columns(df)


# ─────────────────────────────────────────────────────────────
# CSV DataFrame normalization
# ─────────────────────────────────────────────────────────────

def normalize_csv_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize a CSV-loaded DataFrame to match the API schema.

    CSVs may have:
      - 'action' column (Buy/Sell/Redeem/Maker Rebate) → maps to 'type'
      - 'side' may be missing → derive from action
      - 'usdcAmount' may be pre-signed or not → auto-detect
      - 'coin' column may be present or missing
      - 'price' is derived as abs(usdcAmount) / tokenAmount
    """
    if df.empty:
        return df

    # Auto-detect CSV format: are Buy amounts negative or positive?
    # Check if 'type' or 'action' column exists
    action_col = None
    if "type" in df.columns:
        action_col = "type"
    elif "action" in df.columns:
        df = df.rename(columns={"action": "type"})
        action_col = "type"

    # Normalize action names: uppercase
    if action_col:
        df["type"] = df["type"].str.strip().str.upper()

    # Derive side from action if missing
    if "side" not in df.columns:
        action_to_side = {
            "BUY": "BUY",
            "SELL": "SELL",
            "REDEEM": None,
            "MERGE": None,
            "SPLIT": None,
            "DEPOSIT": None,
            "WITHDRAWAL": None,
            "WITHDRAW": None,
            "TRANSFER": None,
            "MAKER REBATE": None,
            "TAKER REBATE": None,
            "REWARD": None,
        }
        df["side"] = df["type"].map(action_to_side)

    # Auto-detect and fix Buy sign
    if "signed_usdc" in df.columns:
        # Check if any Buy rows have positive signed_usdc
        buy_rows = df[df["type"] == "BUY"]
        has_positive_buys = (buy_rows["signed_usdc"] > 0).any()
        if has_positive_buys:
            # Flip: all Buys should be negative
            df.loc[df["type"] == "BUY", "signed_usdc"] = (
                -df.loc[df["type"] == "BUY", "signed_usdc"].abs()
            )
        # Ensure all non-Buys are positive
        non_buy = df["type"] != "BUY"
        df.loc[non_buy, "signed_usdc"] = df.loc[non_buy, "signed_usdc"].abs()

    # Derive price if missing
    if "price" not in df.columns or df["price"].isna().all():
        size_col = "size" if "size" in df.columns else "tokenAmount"
        if size_col in df.columns and "signed_usdc" in df.columns:
            df["price"] = df["signed_usdc"].abs() / df[size_col].replace(0, pd.NA)
        else:
            df["price"] = 0.0

    # Ensure required columns exist
    for col in ["title", "slug", "size", "usdcSize", "outcome", "transactionHash"]:
        if col not in df.columns:
            if col == "title" and "marketName" in df.columns:
                df["title"] = df["marketName"]
            elif col == "size" and "tokenAmount" in df.columns:
                df["size"] = df["tokenAmount"]
            elif col == "usdcSize" and "signed_usdc" in df.columns:
                df["usdcSize"] = df["signed_usdc"].abs()
            elif col == "outcome" and "tokenName" in df.columns:
                df["outcome"] = df["tokenName"]
            elif col == "transactionHash" and "hash" in df.columns:
                df["transactionHash"] = df["hash"]
            elif col == "slug":
                df["slug"] = ""
            else:
                df[col] = ""

    return _add_derived_columns(df)


# ─────────────────────────────────────────────────────────────
# Derived columns (shared)
# ─────────────────────────────────────────────────────────────

def _add_derived_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add coin, timeframe, datetime columns to a DataFrame."""
    if df.empty:
        return df

    # Coin: from slug first, then title fallback
    has_slug = "slug" in df.columns and not (df["slug"].isna().all() or (df["slug"] == "").all())
    has_title = "title" in df.columns

    if has_slug:
        df["coin"] = df["slug"].apply(lambda s: _extract_coin_from_slug(str(s)) if s else "OTHER")
    elif has_title:
        df["coin"] = df["title"].apply(lambda t: _extract_coin_from_title(str(t)))
    else:
        df["coin"] = "OTHER"

    # Timeframe: from slug first, then title fallback
    if has_slug:
        df["timeframe"] = df["slug"].apply(
            lambda s: _extract_timeframe_from_slug(str(s)) if s else "N/A"
        )
    elif has_title:
        df["timeframe"] = df["title"].apply(
            lambda t: _extract_timeframe_from_title(str(t))
        )
    else:
        df["timeframe"] = "N/A"

    # Zero out signed_usdc for non-P&L event types (balance movements only).
    # These have no market relevance and must not contribute to P&L.
    _non_pnl_types = {"DEPOSIT", "WITHDRAWAL", "WITHDRAW", "TRANSFER"}
    if "signed_usdc" in df.columns:
        pnl_exclude_mask = df["type"].str.strip().str.upper().isin(_non_pnl_types)
        if pnl_exclude_mask.any():
            df.loc[pnl_exclude_mask, "signed_usdc"] = 0.0

    # Tag platform-level transactions (rebates, rewards, deposits, withdrawals) that have no market.
    # Do this AFTER coin/timeframe extraction so we override only these rows.
    non_trading_types = {"MAKER_REBATE", "TAKER_REBATE", "REWARD", "MAKER REBATE", "TAKER REBATE",
                         "DEPOSIT", "WITHDRAWAL", "WITHDRAW", "TRANSFER"}
    is_platform = df["type"].str.strip().str.upper().isin(non_trading_types)
    has_no_slug = df["slug"].isna() | (df["slug"].astype(str).str.strip() == "")
    platform_mask = is_platform & has_no_slug

    if platform_mask.any():
        df.loc[platform_mask, "slug"] = "__platform_credits__"
        df.loc[platform_mask, "coin"] = "Platform"
        df.loc[platform_mask, "timeframe"] = "N/A"
        if "side" in df.columns:
            df.loc[platform_mask, "side"] = "CREDIT"
        if "outcome" in df.columns:
            df.loc[platform_mask, "outcome"] = df.loc[platform_mask, "type"]

    # Datetime from timestamp
    if "timestamp" in df.columns:
        df["datetime"] = pd.to_datetime(df["timestamp"], unit="s", utc=True, errors="coerce")
        df["date"] = df["datetime"].dt.date

    return df


# ─────────────────────────────────────────────────────────────
# Market name normalization
# ─────────────────────────────────────────────────────────────

def normalize_market_name(title_or_slug: str) -> str:
    """Produce a human-readable market identifier."""
    if not title_or_slug:
        return "(unknown)"
    # Synthetic slug for platform credits (rebates, rewards)
    if title_or_slug == "__platform_credits__":
        return "Platform Credits (rebates, rewards)"
    # If it looks like a slug (no spaces, has dashes), prettify
    if " " not in title_or_slug and "-" in title_or_slug:
        parts = title_or_slug.split("-")
        coin = parts[0].upper() if parts else ""
        timeframe = ""
        for p in parts[1:]:
            if re.match(r"\d+[mhd]", p):
                timeframe = p
                break
        ts_part = parts[-1] if len(parts) > 1 else ""
        if ts_part.isdigit() and len(ts_part) >= 10:
            try:
                dt = datetime.fromtimestamp(int(ts_part), tz=timezone.utc)
                ts_str = dt.strftime("%Y-%m-%d %H:%M")
            except (ValueError, OSError):
                ts_str = ts_part
            return f"{coin} {timeframe} {ts_str}"
        if timeframe:
            return f"{coin} {timeframe}"
        # No recognizable timeframe/timestamp — show the full slug as title
        return title_or_slug.replace("-", " ").title()
    return str(title_or_slug)


# ─────────────────────────────────────────────────────────────
# P&L computation
# ─────────────────────────────────────────────────────────────

def compute_per_market_pnl(df: pd.DataFrame) -> pd.DataFrame:
    """Group by market and compute P&L per market.
    Returns DataFrame with columns: title, slug, coin, timeframe, pnl, trade_count,
    first_trade, last_trade, buy_count, sell_count, redeem_count.
    """
    if df.empty:
        return pd.DataFrame()

    # Use slug as market key if available, else title
    has_slug = "slug" in df.columns and not (df["slug"].isna().all() or (df["slug"] == "").all())
    if has_slug:
        group_col = "slug"
    else:
        group_col = "title"

    grouped = df.groupby(group_col, dropna=False)

    summary = grouped.agg(
        pnl=("signed_usdc", "sum"),
        trade_count=("signed_usdc", "count"),
        first_trade=("timestamp", "min"),
        last_trade=("timestamp", "max"),
        coin=("coin", "first"),
        timeframe=("timeframe", "first"),
        title=("title", "first"),
        buy_count=("side", lambda x: (x == "BUY").sum()),
        sell_count=("side", lambda x: (x == "SELL").sum()),
        redeem_count=("type", lambda x: (x == "REDEEM").sum()),
    ).reset_index()

    # Normalize market name for display
    if has_slug:
        summary["display_name"] = summary["slug"].apply(normalize_market_name)
    else:
        summary["display_name"] = summary["title"]

    # Win rate: positive P&L / total
    summary["win"] = summary["pnl"] > 0

    # Format timestamps for display
    summary["first_trade_dt"] = pd.to_datetime(summary["first_trade"], unit="s", utc=True, errors="coerce")
    summary["last_trade_dt"] = pd.to_datetime(summary["last_trade"], unit="s", utc=True, errors="coerce")

    summary = summary.sort_values("pnl", ascending=False)
    return summary


def compute_per_coin_pnl(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate P&L by coin."""
    if df.empty:
        return pd.DataFrame()

    grouped = df.groupby("coin", dropna=False)
    summary = grouped.agg(
        pnl=("signed_usdc", "sum"),
        trade_count=("signed_usdc", "count"),
        unique_markets=("slug", "nunique"),
        win_count=("signed_usdc", lambda x: (x > 0).sum()),
    ).reset_index()

    summary["win_rate"] = summary["win_count"] / summary["trade_count"].replace(0, 1)
    summary = summary.sort_values("pnl", ascending=False)
    return summary


def compute_per_timeframe_pnl(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate P&L by timeframe."""
    if df.empty:
        return pd.DataFrame()

    grouped = df.groupby("timeframe", dropna=False)
    summary = grouped.agg(
        pnl=("signed_usdc", "sum"),
        trade_count=("signed_usdc", "count"),
        unique_markets=("slug", "nunique"),
    ).reset_index()

    summary = summary.sort_values("pnl", ascending=False)
    return summary


def compute_overall_pnl(df: pd.DataFrame) -> dict[str, Any]:
    """Overall statistics dict."""
    if df.empty:
        return {
            "total_pnl": 0.0,
            "trade_count": 0,
            "unique_markets": 0,
            "win_count": 0,
            "loss_count": 0,
            "win_rate": 0.0,
        }

    total_pnl = df["signed_usdc"].sum()
    trade_count = len(df)
    unique_markets = df["slug"].nunique() if "slug" in df.columns else df["title"].nunique()

    # Win/loss per market (not per trade)
    per_market = compute_per_market_pnl(df)
    win_count = int((per_market["pnl"] > 0).sum())
    loss_count = int((per_market["pnl"] < 0).sum())

    return {
        "total_pnl": total_pnl,
        "trade_count": trade_count,
        "unique_markets": unique_markets,
        "win_count": win_count,
        "loss_count": loss_count,
        "win_rate": win_count / (win_count + loss_count) if (win_count + loss_count) else 0.0,
    }
