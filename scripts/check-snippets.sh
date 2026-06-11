#!/usr/bin/env bash
# scripts/check-snippets.sh — D-65 + UI-SPEC §Shiki Scope Gate CI snippet gate.
#
# Usage:
#   bash scripts/check-snippets.sh
#   DEAL_BIN=/path/to/deal bash scripts/check-snippets.sh
#
# Runs from the deal-lang.org repo root.
#
# D-65 Parse Gate:
#   For every .mdx file under src/content/docs/:
#     1. Extract all deal/dealx fenced blocks (skip error-expected blocks)
#        via scripts/extract_deal_blocks.py
#     2. Run `deal parse` on each extracted snippet
#     3. Accumulate failures; exit non-zero if any snippet fails to parse
#
# Shiki Scope Gate (UI-SPEC §Shiki Scope Gate, RESEARCH OQ-2):
#   Post-build check over dist/ HTML (requires a prior `npm run build`):
#   Any deal/dealx code block that renders with zero highlighted token spans
#   (all tokens are plain/unstyled) indicates the TextMate grammar did not
#   load. Detection heuristic: the Expressive Code renderer wraps code blocks
#   in <div data-language="deal"> or <div data-language="dealx">; inside,
#   highlighted tokens appear as <span class="..."> with non-empty class.
#   A block is flagged as "unhighlighted" when no such span exists inside the
#   code element — only bare text nodes or spans with empty/whitespace class.
#
# Counter robustness:
#   The failure counter is written to a temp file to avoid the classic
#   pipe-to-while subshell bug (a pipe creates a subshell; any variable
#   increments inside die when the subshell exits). This script accumulates
#   failures directly in the main shell without pipes.
#
# Exit codes:
#   0  — all snippets parse cleanly and Shiki scope gate passes
#   1  — one or more snippets failed to parse OR Shiki scope gate detected
#         an unhighlighted deal/dealx block
#   2  — internal error (missing extractor, deal binary not found, etc.)

set -euo pipefail

DEAL_BIN="${DEAL_BIN:-deal}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Pre-flight checks ───────────────────────────────────────────────────────

if ! command -v python3 >/dev/null 2>&1; then
    echo "check-snippets.sh: python3 not found in PATH" >&2
    exit 2
fi

EXTRACTOR="$SCRIPT_DIR/extract_deal_blocks.py"
if [ ! -f "$EXTRACTOR" ]; then
    echo "check-snippets.sh: extractor not found at $EXTRACTOR" >&2
    exit 2
fi

if ! "$DEAL_BIN" parse --help >/dev/null 2>&1; then
    if ! "$DEAL_BIN" --help >/dev/null 2>&1; then
        echo "check-snippets.sh: deal binary not found or not executable: $DEAL_BIN" >&2
        echo "  Set DEAL_BIN=/path/to/deal to override." >&2
        exit 2
    fi
fi

# ─── D-65 Parse Gate ─────────────────────────────────────────────────────────

echo "check-snippets.sh: D-65 parse gate — extracting and parsing deal/dealx snippets"
echo "  DEAL_BIN=$DEAL_BIN"

FAIL_COUNT=0
PASS_COUNT=0
SKIP_COUNT=0

# Find all MDX files. Use find for portability (globs don't recurse in all shells).
# Process files in sorted order for deterministic output.
while IFS= read -r mdx_file; do
    # Extract deal/dealx blocks from this MDX file (error-expected blocks skipped by extractor).
    # Collect snippet paths into an array (avoids pipe subshell bug — no pipe here).
    mapfile -t snippet_files < <(python3 "$EXTRACTOR" "$mdx_file")

    for snippet_file in "${snippet_files[@]}"; do
        if [ -z "$snippet_file" ]; then
            continue
        fi

        # Run deal parse on the snippet.
        if "$DEAL_BIN" parse "$snippet_file" >/dev/null 2>&1; then
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "FAIL: snippet from $mdx_file failed to parse: $snippet_file" >&2
            # Print the failing snippet for debugging.
            echo "--- snippet contents ---" >&2
            cat "$snippet_file" >&2
            echo "--- end snippet ---" >&2
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi

        # Clean up temp file.
        rm -f "$snippet_file"
    done
done < <(find "$REPO_ROOT/src/content/docs" -name "*.mdx" | sort)

echo "check-snippets.sh: parse gate — passed=$PASS_COUNT failed=$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "check-snippets.sh: FAIL — $FAIL_COUNT snippet(s) did not parse" >&2
    exit 1
fi

# ─── Shiki Scope Gate ────────────────────────────────────────────────────────
#
# Detection heuristic (RESEARCH OQ-2 / UI-SPEC §Shiki Scope Gate):
#
# Expressive Code renders a code block for deal/dealx as an HTML structure like:
#   <figure class="... expressive-code ...">
#     <pre data-language="deal">
#       <code>
#         <div class="ec-line"><span style="...">text</span></div>
#         ...
#       </code>
#     </pre>
#   </figure>
#
# When the Shiki grammar loads correctly, token spans have style attributes
# with color values (e.g., style="color:#79c0ff"). When the grammar is NOT
# loaded (fallback plain text), code elements contain plain text or spans with
# only the base color (no scope-specific colors).
#
# Our heuristic: search for <pre data-language="deal"> or
# <pre data-language="dealx"> blocks in the built HTML. If any such block
# exists where ALL <span> elements inside <code> carry NO style attribute
# (pure plain text), the grammar did not load.
#
# This check only runs if dist/ exists (i.e., after `npm run build`).

DIST_DIR="$REPO_ROOT/dist"
if [ ! -d "$DIST_DIR" ]; then
    echo "check-snippets.sh: dist/ not found — skipping Shiki scope gate (run 'npm run build' first)"
    echo "check-snippets.sh: PASS"
    exit 0
fi

echo "check-snippets.sh: Shiki scope gate — scanning $DIST_DIR for unhighlighted deal/dealx blocks"

SHIKI_FAIL=0

# Find all HTML files in dist/.
while IFS= read -r html_file; do
    # Look for deal or dealx code blocks with zero highlighted spans.
    # Strategy: find <pre data-language="deal"...> or <pre data-language="dealx"...>
    # then check whether the following <code> block contains any <span style=
    # A block is flagged if it has a <pre data-language="deal"...> but the corresponding
    # <code> element contains NO spans with a style attribute (zero Shiki tokens applied).
    #
    # We use Python for robust HTML parsing (awk/grep is fragile for multi-line HTML).
    python3 - "$html_file" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find all <pre data-language="deal" ...> or <pre data-language="dealx" ...> blocks.
# Use a simple pattern: find the data-language attribute, then look for the next <code>...</code>.
# This is intentionally conservative — false negatives are acceptable; false positives are not.

pre_pattern = re.compile(
    r'<pre[^>]*\bdata-language="(deal|dealx)"[^>]*>(.*?)</pre>',
    re.DOTALL | re.IGNORECASE
)

for m in pre_pattern.finditer(content):
    lang = m.group(1)
    pre_body = m.group(2)

    # Find the <code>...</code> inside this pre.
    code_m = re.search(r'<code[^>]*>(.*?)</code>', pre_body, re.DOTALL | re.IGNORECASE)
    if not code_m:
        continue

    code_body = code_m.group(1)

    # Count spans WITH a style attribute (these are Shiki-colored tokens).
    styled_spans = len(re.findall(r'<span\s[^>]*\bstyle\s*=', code_body, re.IGNORECASE))

    if styled_spans == 0:
        print(f"SHIKI_FAIL: {path} has a {lang} block with zero styled token spans (grammar not loaded?)")
        sys.exit(1)

sys.exit(0)
PYEOF
    result=$?
    if [ $result -ne 0 ]; then
        SHIKI_FAIL=$((SHIKI_FAIL + 1))
    fi
done < <(find "$DIST_DIR" -name "*.html" | sort)

if [ "$SHIKI_FAIL" -gt 0 ]; then
    echo "check-snippets.sh: FAIL — Shiki scope gate: $SHIKI_FAIL HTML file(s) have unhighlighted deal/dealx blocks" >&2
    echo "  This indicates the TextMate grammar was not loaded by Shiki." >&2
    echo "  Check astro.config.mjs: grammars must be passed as parsed JSON objects," >&2
    echo "  not as { path: '...' } (removed in Shiki v1.0)." >&2
    exit 1
fi

echo "check-snippets.sh: Shiki scope gate — PASS"
echo "check-snippets.sh: PASS"
exit 0
