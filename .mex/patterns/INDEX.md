# Pattern Index

Lookup table for all pattern files in this directory. Check here before starting any task — if a pattern exists, follow it.

<!-- This file is populated during setup (Pass 2) and updated whenever patterns are added.
     Each row maps a pattern file (or section) to its trigger — when should the agent load it?

     Format — simple (one task per file):
     | filename.md | One-line description of when to use this pattern |

     Format — anchored (multi-section file, one row per task):
     | filename.md#task-first-task | When doing the first task |
     | filename.md#task-second-task | When doing the second task |

     Example (from a Flask API project):
     | add-api-client.md | Adding a new external service integration |
     | debug-pipeline.md | Diagnosing failures in the request pipeline |
     | crud-operations.md#task-add-endpoint | Adding a new API route with validation |
     | crud-operations.md#task-add-model | Adding a new database model |

     Keep this table sorted alphabetically. One row per task (not per file).
     If you create a new pattern, add it here. If you delete one, remove it. -->

| Pattern | Use when |
|---------|----------|
| [streamlit-multiselect-all-filter.md](streamlit-multiselect-all-filter.md) | Streamlit multiselect with "ALL" default fails to filter when user picks a specific option |
| [dedup-by-txhash.md](dedup-by-txhash.md) | P&L inflated because dedup by transactionHash discards real fills batched in the same on-chain tx |
| [time-presets-api-fetch.md](time-presets-api-fetch.md) | Fetching API data over a specific time preset instead of default range |
| [time-window-asymmetry.md](time-window-asymmetry.md) | P&L inflated because time-window filtering at data-load layer excludes cost basis from outside the window |
