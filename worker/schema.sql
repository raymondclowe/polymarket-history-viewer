-- D1 Schema for Polymarket History Viewer
-- Each row is one trade/event for a wallet.
-- The UNIQUE(wallet, transaction_hash) constraint ensures idempotent re-fetches.

CREATE TABLE IF NOT EXISTS trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet          TEXT NOT NULL,
  transaction_hash TEXT,
  type            TEXT NOT NULL,
  side            TEXT,
  slug            TEXT,
  title           TEXT,
  outcome         TEXT,
  price           REAL,
  size            REAL,
  usdc_size       REAL,
  signed_usdc     REAL,
  coin            TEXT,
  timeframe       TEXT,
  timestamp       INTEGER,
  date            TEXT,
  datetime        TEXT,
  created_at      INTEGER DEFAULT (unixepoch()),
  UNIQUE(wallet, transaction_hash)
);

CREATE INDEX IF NOT EXISTS idx_trades_wallet      ON trades(wallet);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp    ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_coin         ON trades(coin);
CREATE INDEX IF NOT EXISTS idx_trades_timeframe    ON trades(timeframe);
CREATE INDEX IF NOT EXISTS idx_trades_slug         ON trades(slug);

-- Track known wallets + last refresh for cron
CREATE TABLE IF NOT EXISTS wallets (
  wallet      TEXT PRIMARY KEY,
  label       TEXT DEFAULT '',
  last_refresh INTEGER DEFAULT 0,
  trade_count  INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unixepoch())
);

-- Per-wallet daily P&L snapshots for the time-series chart
CREATE TABLE IF NOT EXISTS daily_pnl (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet    TEXT NOT NULL,
  date      TEXT NOT NULL,       -- '2026-06-21'
  pnl       REAL NOT NULL DEFAULT 0,
  trades    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(wallet, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_wallet ON daily_pnl(wallet);
