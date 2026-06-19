"""
data_loader.py — Fetch Polymarket activity from API + CSV fallback.

Defense layers:
  1. File-based JSON cache (5-min TTL) — always consulted before hitting API
  2. Retry with exponential backoff (3 attempts, 1s/2s/4s) for transient errors
  3. Deduplication by transactionHash — set-based, first occurrence wins
  4. Time-window validation — rejects rows outside requested range
  5. Row integrity checks — usdcSize>0, price 0-1, slug non-empty for TRADE/REDEEM
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ACTIVITY_URL = "https://data-api.polymarket.com/activity"
CACHE_DIR = Path(__file__).resolve().parent / "cache"
CACHE_TTL = 300  # 5 minutes
REQUEST_DELAY = 0.3  # seconds between pages
MAX_PAGES = 50  # 10,000 rows max
PAGE_SIZE = 200


# ─────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────

def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        if v in (None, ""):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _to_int(v: Any, default: int = 0) -> int:
    try:
        if v in (None, ""):
            return default
        return int(v)
    except (TypeError, ValueError):
        return default


def _utc_iso(ts: int) -> str:
    if ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─────────────────────────────────────────────────────────────
# Layer 2: API fetch with retry + backoff
# ─────────────────────────────────────────────────────────────

def fetch_activity_page(
    wallet: str,
    offset: int = 0,
    limit: int = PAGE_SIZE,
    since_ts: int | None = None,
    until_ts: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Fetch one page of activity. Returns (rows, http_status).
    http_status is 0 for network errors after all retries.
    """
    params: dict[str, Any] = {
        "user": wallet,
        "limit": limit,
        "offset": offset,
        "sortDirection": "DESC",
    }
    url = f"{ACTIVITY_URL}?{urllib.parse.urlencode(params)}"

    for attempt in range(3):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "PolymarketHistoryViewer/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode()
                data = json.loads(body)
                if not isinstance(data, list):
                    return [], resp.status
                return data, resp.status
        except urllib.error.HTTPError as e:
            if e.code == 400:
                return [], 400  # no retry — bad request or end of data
            if e.code in (429, 500, 502, 503):
                if attempt < 2:
                    time.sleep(2 ** attempt)
            elif attempt < 2:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError, TimeoutError):
            if attempt < 2:
                time.sleep(2 ** attempt)

    return [], 0  # all retries exhausted


def fetch_all_activity(
    wallet: str,
    since_ts: int | None = None,
    until_ts: int | None = None,
) -> list[dict[str, Any]]:
    """Paginate the activity API. Returns raw rows (unsanitized)."""
    rows: list[dict[str, Any]] = []
    offset = 0

    for _ in range(MAX_PAGES):
        page, status = fetch_activity_page(wallet, offset=offset)
        if status == 400:
            break
        if not page:
            break

        rows.extend(page)

        oldest_ts = _to_int(page[-1].get("timestamp"))
        if since_ts is not None and oldest_ts < since_ts:
            break

        if len(page) < PAGE_SIZE:
            break

        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY)

    return rows


# ─────────────────────────────────────────────────────────────
# Layer 3: Deduplication
# ─────────────────────────────────────────────────────────────

def deduplicate_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Dedup by transactionHash. First occurrence wins (API returns DESC).
    Returns (deduped_rows, duplicates_removed_count).
    """
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    dupes = 0

    for row in rows:
        tx_hash = str(row.get("transactionHash", ""))
        if not tx_hash:
            # rows without hash: keep them (e.g. rewards) but don't dedup by hash
            unique.append(row)
            continue
        if tx_hash in seen:
            dupes += 1
            continue
        seen.add(tx_hash)
        unique.append(row)

    return unique, dupes


# ─────────────────────────────────────────────────────────────
# Layer 4: Time-window validation
# ─────────────────────────────────────────────────────────────

def validate_time_window(
    rows: list[dict[str, Any]],
    since_ts: int | None,
    until_ts: int | None,
) -> tuple[list[dict[str, Any]], int]:
    """Reject rows with timestamp outside [since_ts, until_ts].
    Returns (valid_rows, out_of_window_count).
    """
    if since_ts is None and until_ts is None:
        return rows, 0

    valid: list[dict[str, Any]] = []
    rejected = 0

    for row in rows:
        ts = _to_int(row.get("timestamp"))
        if since_ts is not None and ts < since_ts:
            rejected += 1
            continue
        if until_ts is not None and ts > until_ts:
            rejected += 1
            continue
        valid.append(row)

    return valid, rejected


# ─────────────────────────────────────────────────────────────
# Layer 5: Row integrity checks
# ─────────────────────────────────────────────────────────────

def validate_row_integrity(
    rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int]:
    """Basic sanity checks on each row. Bad rows are skipped.
    Returns (valid_rows, integrity_failures_count).
    """
    valid: list[dict[str, Any]] = []
    failures = 0

    for row in rows:
        act_type = str(row.get("type", "")).upper()
        usdc_size = _to_float(row.get("usdcSize"))
        price = _to_float(row.get("price"))
        slug = str(row.get("slug", ""))

        # TRADE and REDEEM must have a slug
        if act_type in ("TRADE", "REDEEM", "MERGE", "SPLIT"):
            if not slug:
                failures += 1
                continue

        # TRADE rows must have positive usdcSize
        if act_type == "TRADE":
            if usdc_size <= 0:
                failures += 1
                continue
            if not (0.0 < price < 1.0):
                # price can be 0 or 1 for non-trade types; skip only for TRADE
                failures += 1
                continue

        valid.append(row)

    return valid, failures


# ─────────────────────────────────────────────────────────────
# Layer 1: File-based JSON cache
# ─────────────────────────────────────────────────────────────

def _cache_path(wallet: str) -> Path:
    """Cache file path for a wallet address."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR / f"{wallet}.json"


def load_cache(wallet: str) -> list[dict[str, Any]] | None:
    """Load cached rows if cache is fresh (within CACHE_TTL).
    Returns None if cache is missing or stale.
    """
    path = _cache_path(wallet)
    if not path.exists():
        return None

    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    fetched_at = data.get("fetched_at", 0)
    if time.time() - fetched_at > CACHE_TTL:
        return None

    rows = data.get("rows", [])
    if not isinstance(rows, list):
        return None
    return rows


def save_cache(wallet: str, rows: list[dict[str, Any]]) -> None:
    """Save rows to cache file."""
    path = _cache_path(wallet)
    data = {
        "fetched_at": time.time(),
        "wallet": wallet,
        "rows": rows,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


# ─────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────

def get_activity(
    wallet: str,
    since_ts: int | None = None,
    until_ts: int | None = None,
    force_refresh: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch activity for a wallet, with caching and all validation layers.

    Returns (validated_rows, metadata) where metadata contains:
      - cached: bool
      - duplicates_removed: int
      - out_of_window_removed: int
      - integrity_failures: int
      - fetch_duration_ms: float
      - total_raw: int (rows from API, before any filtering)
    """
    metadata: dict[str, Any] = {
        "cached": False,
        "duplicates_removed": 0,
        "out_of_window_removed": 0,
        "integrity_failures": 0,
        "fetch_duration_ms": 0.0,
        "total_raw": 0,
    }

    t0 = time.time()

    # Try cache first
    if not force_refresh:
        cached = load_cache(wallet)
        if cached is not None:
            metadata["cached"] = True
            metadata["total_raw"] = len(cached)
            # Still re-validate time window (time filter may have changed)
            valid, oow = validate_time_window(cached, since_ts, until_ts)
            metadata["out_of_window_removed"] = oow
            metadata["fetch_duration_ms"] = (time.time() - t0) * 1000
            return valid, metadata

    # Fetch from API
    raw = fetch_all_activity(wallet, since_ts=since_ts, until_ts=until_ts)
    metadata["total_raw"] = len(raw)

    # Layer 3: dedup
    deduped, dupes = deduplicate_rows(raw)
    metadata["duplicates_removed"] = dupes

    # Layer 4: time window
    valid_time, oow = validate_time_window(deduped, since_ts, until_ts)
    metadata["out_of_window_removed"] = oow

    # Layer 5: integrity
    clean, failures = validate_row_integrity(valid_time)
    metadata["integrity_failures"] = failures

    # Cache the clean result (before time-window filtering, so cache is reusable)
    save_cache(wallet, deduped)

    metadata["fetch_duration_ms"] = (time.time() - t0) * 1000
    return clean, metadata


# ─────────────────────────────────────────────────────────────
# CSV fallback loader
# ─────────────────────────────────────────────────────────────

_CSV_COLUMN_MAP = {
    "marketName": "title",
    "action": "type",
    "usdcAmount": "signed_usdc",
    "tokenAmount": "size",
    "tokenName": "outcome",
    "timestamp": "timestamp",
    "hash": "transactionHash",
}


def load_csvs_from_wallet(data_dir: str, wallet_name: str) -> pd.DataFrame:
    """Load all CSVs from data/<wallet_name>/ and return a unified DataFrame.
    Handles both CSV formats (with/without coin column, with/without Column1).
    """
    folder = Path(data_dir) / wallet_name
    if not folder.exists():
        return pd.DataFrame()

    csv_files = sorted(folder.glob("*.csv"))
    if not csv_files:
        return pd.DataFrame()

    frames = []
    for fpath in csv_files:
        df = pd.read_csv(fpath, encoding="utf-8-sig", dtype_backend="pyarrow")
        # Drop Column1 if present (redundant absolute-value column)
        if "Column1" in df.columns:
            df = df.drop(columns=["Column1"])
        frames.append(df)

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)

    # Rename CSV columns to match API field names for unified downstream processing
    df = df.rename(columns=_CSV_COLUMN_MAP)

    # Ensure we have a transactionHash column (some CSVs call it 'hash')
    if "hash" in df.columns and "transactionHash" not in df.columns:
        df["transactionHash"] = df["hash"]

    # Convert timestamp to int
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce").fillna(0).astype("int64")

    return df


def load_all_wallets(data_dir: str) -> dict[str, pd.DataFrame]:
    """Scan data/ directory and return {wallet_name: DataFrame} for each subfolder."""
    base = Path(data_dir)
    if not base.exists():
        return {}

    wallets: dict[str, pd.DataFrame] = {}
    for child in sorted(base.iterdir()):
        if child.is_dir():
            df = load_csvs_from_wallet(data_dir, child.name)
            if not df.empty:
                wallets[child.name] = df

    return wallets
