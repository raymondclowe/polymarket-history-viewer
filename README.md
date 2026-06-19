# Polymarket History Viewer

A Streamlit P&L dashboard for Polymarket trade history. Load from live API or CSV files, slice by coin/timeframe/market, and drill down to individual trades.

## Features

- **Live API** — fetch trade history for any wallet from the Polymarket Data API
- **CSV import** — drop CSV exports into `data/<wallet>/` folders
- **4-layer data defense** — cache, retry, dedup, and integrity validation
- **P&L breakdowns** — per coin, timeframe, and market
- **Drill-down** — click a market to see every individual trade with Polymarket links
- **CSV export** — download filtered data and market summaries

## Quick Start

```bash
uv sync
uv run streamlit run app.py
```

Open http://localhost:8501 and enter a wallet address or select a CSV folder.

## Project Structure

```
app.py              — Streamlit UI (sidebar, cards, tables, drill-down)
data_loader.py      — API fetch, cache, dedup, validation, CSV loading
data_processor.py   — DataFrame normalization, coin/timeframe extraction, P&L computation
cache/              — JSON cache files (gitignored)
data/               — CSV wallet folders
```