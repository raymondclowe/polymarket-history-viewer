## P&L Accuracy Fix — 2026-06-20

**Problem:** DEPOSIT/WITHDRAWAL/TRANSFER activity types were counted as P&L, inflating the dashboard.

**Fix in `data_processor.py`:**
- `api_rows_to_dataframe()`: DEPOSIT, WITHDRAWAL, WITHDRAW, TRANSFER → `signed_usdc = 0.0`. SPLIT → negative (money out). MERGE stays positive (income).
- `normalize_csv_dataframe()`: Added DEPOSIT, WITHDRAWAL, WITHDRAW, TRANSFER to `action_to_side` map.
- `_add_derived_columns()`: `_non_pnl_types` zeroes signed_usdc for DEPOSIT/WITHDRAWAL/TRANSFER. `non_trading_types` expanded to tag them as `__platform_credits__`.

**Impact:** API P&L corrected from +$20 (fake) to -$508 (real trade loss). CSV P&L corrected from -$22 to -$42.

**Still missing:** Opening balance / on-chain balance query — user had ~$30+ dropped to ~$10 with an additional deposit, so trade P&L alone can't reconcile wallet balance without knowing the starting balance.
