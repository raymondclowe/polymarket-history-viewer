"""
Fix template literal escaping in html.js.

The file contains: export const HTML_PAGE = `...<script>...</script>...`;
Everything between <script> and </script> is meant for the BROWSER.
Any ${} or backtick in that region must be escaped so the outer template
literal passes them through literally to the browser.
"""
import re

FILE = "src/html.js"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Find the <script>...</script> boundaries
so_marker = "<script>"
sc_marker = "</script>"
so = content.index(so_marker) + len(so_marker)
sc = content.index(sc_marker)

prefix = content[:so]
script = content[so:sc]
suffix = content[sc:]

# Strategy: use sentinels to protect already-escaped patterns,
# then escape remaining unescaped ones, then restore.
SENTINEL_DOLLAR = "\x00SD\x00"
SENTINEL_TICK = "\x00ST\x00"

# Step 1: Protect already-escaped \${ and \`
script = script.replace("\\${", SENTINEL_DOLLAR)
script = script.replace("\\`", SENTINEL_TICK)

# Step 2: Escape remaining unescaped ${ and `
script = script.replace("${", "\\${")
script = script.replace("`", "\\`")

# Step 3: Restore the already-escaped ones
script = script.replace(SENTINEL_DOLLAR, "\\${")
script = script.replace(SENTINEL_TICK, "\\`")

fixed = prefix + script + suffix

with open(FILE, "w", encoding="utf-8") as f:
    f.write(fixed)

print("Escaping fixed in", FILE)
