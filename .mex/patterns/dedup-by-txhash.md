---
name: dedup-by-txhash
description: Never deduplicate Polymarket activity rows by transactionHash — one on-chain tx can batch multiple fills in different markets
applies_to: data_loader.py
last_updated: 2026-06-20
---

# Dedup by transactionHash Destroys P&L

## Symptom
P&L shows a profit (e.g., +$47 all-time) even though the user consistently loses money. The number of rows returned by `fetch_all_activity()` is significantly less than the raw API response (e.g., 3800 vs 4000 with 200 removed as "duplicates").

## Root Cause
Polymarket batches multiple fills into a single on-chain transaction. A single `transactionHash` can contain:

- BUYs in 5 different markets (different `slug`, each with its own `usdcSize`)
- REDEEMs across 3 different markets with different payout amounts
- A mix of TRADE and REDEEM in the same tx

`deduplicate_rows()` grouped by `transactionHash` and kept only the **first** row per hash, silently discarding ALL other fills in the same batch. With 121 unique hashes having duplicates (200 occurrences total), ~$193 of P&L data was being thrown away.

## When Dedup IS Actually Duplicate
Truly identical rows (all columns equal — same txhash, type, side, slug, usdcSize, timestamp, matchPrice, etc.) are extremely rare. Even identical-looking rows may be distinct fills in the same batch. **Only dedup if every single column matches exactly.**

## The Fix
Remove the dedup step entirely from `get_activity()`. The data pipeline is:

```
API fetch → integrity check (required fields exist) → cache → dataframe
         ↛ NO dedup step
```

## To Verify
1. Clear cache (`cache/<wallet>.json`)
2. Fetch data: `rows, meta = get_activity(wallet)`
3. Check `meta["duplicates_removed"]` is 0
4. Row count should match the raw API total (4000 for this wallet during June 8-20)
5. Run P&L computation; all-time should show a loss that grows with more history

## Key Principle
**One transactionHash ≠ one row.** Each row represents an individual fill. Two rows with the same txhash but different slugs are two different trades. Never discard fills just because they share an on-chain batch.
