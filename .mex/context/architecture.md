---
name: architecture
description: How the major pieces of this project connect and flow. Load when working on system design, integrations, or understanding how components interact.
triggers:
  - "architecture"
  - "system design"
  - "how does X connect to Y"
  - "integration"
  - "flow"
edges:
  - target: context/stack.md
    condition: when specific technology details are needed
  - target: context/decisions.md
    condition: when understanding why the architecture is structured this way
last_updated: 2026-06-19
---

# Architecture

## System Overview

User selects wallet + time range in Streamlit sidebar → `app.py` calls `data_loader.get_activity()` or `load_csvs_from_wallet()` → data flows through 4 defense layers (cache check → HTTP fetch with retry → dedup → time-window validate → row integrity validate) → raw dicts returned → `data_processor.api_rows_to_dataframe()` or `normalize_csv_dataframe()` standardizes into a DataFrame with `signed_usdc`, `coin`, `timeframe` columns → `compute_per_*()` functions calculate P&L groupings → `app.py` renders metric cards, dataframes, drill-down, and CSV export.

## Component Map

```
app.py (Streamlit UI)
    │
    ├── data_loader.py (fetch + validate)
    │   ├── fetch_activity_page()     — single HTTP page with retry
    │   ├── fetch_all_activity()      — paginator w/ rate limiting
    │   ├── deduplicate_rows()        — set-based by transactionHash
    │   ├── validate_time_window()    — reject out-of-range timestamps
    │   ├── validate_row_integrity()  — usdcSize/price/slug checks
    │   ├── load_cache()/save_cache() — JSON file cache (5min TTL)
    │   └── get_activity()            — main orchestrator
    │
    └── data_processor.py (transform + compute)
        ├── api_rows_to_dataframe()   — API dicts → standardized df
        ├── normalize_csv_dataframe() — CSV → standardized df
        ├── _extract_coin_from_*()    — slug/title → BTC/ETH/etc
        ├── _extract_timeframe_from_*() — slug/title → 5m/15m/1h
        ├── compute_per_market_pnl()  — groupby slug
        ├── compute_per_coin_pnl()    — groupby coin
        ├── compute_per_timeframe_pnl() — groupby timeframe
        └── compute_overall_pnl()     — totals
```

## Data Flow

1. **Input:** Wallet address (`0x...`) or CSV folder (`data/noble-tree/`)
2. **Load:** API → cache → dedup → validate → rows; or CSV → normalize → rows
3. **Transform:** Extract `coin` and `timeframe` from `slug`/`title`; compute `signed_usdc` (positive=profit, negative=loss)
4. **Aggregate:** Group by coin, timeframe, market slug for summary views
5. **Display:** Streamlit renders metric cards + sortable dataframes
6. **Export:** Filtered DataFrame → CSV download

## Key Components
<!-- List the major components, modules, or services in this project.
     For each: name, what it does, what it depends on.
     Only include components that are non-obvious or have important constraints.
     Minimum 3 components. If you cannot identify 3, write "[TO DETERMINE]" as a placeholder.
     Length: 1-2 lines per component.
     Example:
     - **AuthService** — handles all authentication logic, depends on UserRepository and JWTLib
     - **EventBus** — async communication between services, all side effects go through here -->

## External Dependencies
<!-- Third-party services, APIs, or databases this project connects to.
     For each: what it is, what we use it for, any important constraints.
     Minimum 3 items. If you cannot find 3, write "[TO DETERMINE]" as a placeholder.
     Length: 1-2 lines per dependency.
     Example:
     - **PostgreSQL** — primary database, all writes go through the repository layer only
     - **SendGrid** — transactional email, use the EmailService wrapper, never call directly -->

## What Does NOT Exist Here
<!-- Explicit boundaries — what is deliberately outside this system.
     This prevents the agent from building things that belong elsewhere or making wrong assumptions.
     Minimum 2 items. If you cannot find 2, write "[TO DETERMINE]" as a placeholder.
     Length: 2-5 items.
     Example:
     - No background job processing — that lives in the worker service (separate repo)
     - No file storage — we use S3 directly, no abstraction layer -->
