# Streamlit Multiselect "ALL" Filter Bug

## When to Use
When a Streamlit multiselect with `default=["ALL"]` doesn't filter data when the user selects a specific option.

## Root Cause
Streamlit keeps `default=["ALL"]` in the selection when the user picks additional options. So the selection becomes `["ALL", "BTC"]`. The naive filter check `if "ALL" not in selected_coins:` evaluates to False (since "ALL" IS in the list), skipping the filter entirely.

## Fix

After reading the multiselect value, strip `"ALL"` from the list when specific options are also present:

```python
selected = st.multiselect(
    "Coin",
    options=["ALL"] + available_coins,
    default=["ALL"],
)

if "ALL" in selected and len(selected) > 1:
    selected = [c for c in selected if c != "ALL"]

if "ALL" not in selected:
    filtered = filtered[filtered["coin"].isin(selected)]
```

## Why This Works
- If user only has `["ALL"]`: `len(selected) == 1`, skip stripping → filter doesn't apply → all data shown.
- If user picks specific options: `len(selected) > 1`, strip `"ALL"` → filter applies → only selected values shown.
- If user deselects everything: `selected == []`, `"ALL" not in selected` is True → empty result (expected).
