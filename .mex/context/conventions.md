---
name: conventions
description: How code is written in this project — naming, structure, patterns, and style. Load when writing new code or reviewing existing code.
triggers:
  - "convention"
  - "pattern"
  - "naming"
  - "style"
  - "how should I"
  - "what's the right way"
edges:
  - target: context/architecture.md
    condition: when a convention depends on understanding the system structure
last_updated: 2026-06-19
---

# Conventions

## Naming

- Files: snake_case naming (`data_loader.py`, `data_processor.py`)
- Functions: `snake_case`, verb-first (`fetch_activity_page`, `compute_per_market_pnl`)
- Private helpers: prefix `_` (`_extract_coin_from_slug`, `_cache_path`, `_fmt_usd`)
- Streamlit cached functions: prefix `_cached_` (`_cached_api_fetch`, `_cached_csv_load`)
- DataFrames: `df` for working data, `_display` suffix for UI-ready copies

## Structure

- Each module is self-contained: `data_loader.py` does I/O only, `data_processor.py` does transform/compute only, `app.py` does UI only
- No classes — plain functions and DataFrames. Streamlit session_state for UI state
- Module-level constants (not config files): `CACHE_DIR`, `CACHE_TTL`, `REQUEST_DELAY`, `MAX_PAGES`

## Verify Checklist

1. Run `uv run ruff check .` — must pass with All checks passed!
2. The dev server command `uv run streamlit run app` must start without import errors or tracebacks
3. All `@st.cache_data` functions have explicit `ttl` or `show_spinner`
4. No raw `print()` statements — use `st.info()`/`st.warning()`/`st.error()` for user-facing messages
<!-- How code is organised within files and across the codebase.
     Cover the things the agent is most likely to get wrong.
     Minimum 3 items. If you cannot find 3, write "[TO DETERMINE]" — do not pad with generic advice.
     Length: 3-7 items.
     Example:
     - Business logic lives in services/, never in route handlers
     - Each service file exports a single class
     - Tests live next to the file they test (`user.service.ts` → `user.service.test.ts`) -->

## Patterns
<!-- Recurring code patterns that must be followed consistently.
     Include concrete before/after examples for the most important ones.
     Minimum 2 patterns. If you cannot find 2, write "[TO DETERMINE]".
     Length: 2-5 patterns with examples.
     Example:
     Always use the Result type for error handling — never throw from the service layer:
     ```
     // Correct
     return { success: true, data: user }
     return { success: false, error: 'User not found' }

     // Wrong
     throw new Error('User not found')
     ``` -->

## Verify Checklist
<!-- A short checklist the agent runs against any code it writes in this project.
     These are the things most likely to go wrong based on this specific codebase.
     The agent should explicitly check each item before presenting output.
     Minimum 4 items. If you cannot find 4, write "[TO DETERMINE]".
     Length: 4-8 items.
     Example:
     Before presenting any code:
     - [ ] Business logic is not in route handlers
     - [ ] All database access goes through the repository layer
     - [ ] Error handling uses the Result type, not exceptions
     - [ ] New files follow the naming convention above -->
