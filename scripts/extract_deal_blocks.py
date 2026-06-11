#!/usr/bin/env python3
"""
scripts/extract_deal_blocks.py — D-65 parse gate extractor.

Usage:
    python3 scripts/extract_deal_blocks.py <mdx_file> [<mdx_file> ...]

For each MDX file, extracts every fenced code block whose info-string starts
with 'deal' or 'dealx', EXCEPT blocks whose info-string includes the
'error-expected' meta tag (UI-SPEC §Fence Markers). Writes each extracted
block to a temp file and prints the temp file path to stdout (one per line).

The caller (check-snippets.sh) reads the printed paths and runs `deal parse`
on each.

Shiki scope gate (OQ-2 / UI-SPEC §Shiki Scope Gate):
    A separate check in check-snippets.sh scans the built dist/ HTML for
    deal/dealx code blocks that rendered with zero colored token spans — this
    indicates the grammar was not loaded by Shiki. See check-snippets.sh.

Error-expected convention (UI-SPEC §Fence Markers):
    ```deal error-expected   — CI SKIPS parse for this block
    ```dealx error-expected  — CI SKIPS parse for this block
    Any info-string that starts with 'deal' or 'dealx' AND contains
    'error-expected' as a word is skipped.

Blocks are processed in document order for deterministic output.

Exit code: 0 always (extraction is best-effort; parse errors are reported
by check-snippets.sh via the deal parse exit code, not here).
"""

import sys
import os
import re
import tempfile

# Regex to match opening fences: captures the full info-string after the backticks.
# Accepts 3+ backticks followed by an info-string (no trailing spaces required).
FENCE_OPEN_RE = re.compile(r'^(`{3,})(\S+(?:\s+\S+)*)?\s*$')


def extract_deal_blocks(mdx_path: str) -> list[str]:
    """
    Parse mdx_path and return a list of temp file paths, one per extracted block.

    Blocks whose info-string starts with 'deal' or 'dealx' AND does NOT contain
    'error-expected' are extracted. All others are skipped.
    """
    temp_files = []

    try:
        with open(mdx_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except OSError as e:
        print(f"extract_deal_blocks.py: cannot read {mdx_path}: {e}", file=sys.stderr)
        return []

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n').rstrip('\r')
        m = FENCE_OPEN_RE.match(line)
        if m:
            fence_char = m.group(1)   # the backtick run, e.g. '```'
            info_string = (m.group(2) or '').strip()
            lang = info_string.split()[0] if info_string else ''

            # Only process deal / dealx fences
            if lang.startswith('deal') or lang.startswith('dealx'):
                # Check for error-expected meta tag anywhere in the info-string
                words = info_string.split()
                is_error_expected = 'error-expected' in words

                # Consume block content until the closing fence (same char+length)
                block_lines = []
                i += 1
                while i < len(lines):
                    closing_line = lines[i].rstrip('\n').rstrip('\r')
                    # Closing fence: same fence character, at least as long as opening
                    if re.match(r'^`{' + str(len(fence_char)) + r',}\s*$', closing_line):
                        i += 1
                        break
                    block_lines.append(lines[i])
                    i += 1

                if not is_error_expected and block_lines:
                    # Determine file extension: deal or dealx
                    ext = '.dealx' if lang.startswith('dealx') else '.deal'

                    # Write block to a named temp file
                    fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix='deal_snippet_')
                    try:
                        with os.fdopen(fd, 'w', encoding='utf-8') as fout:
                            fout.writelines(block_lines)
                        temp_files.append(tmp_path)
                    except OSError as e:
                        print(f"extract_deal_blocks.py: cannot write temp file: {e}", file=sys.stderr)
                        try:
                            os.unlink(tmp_path)
                        except OSError:
                            pass
            else:
                # Non-deal fence: skip past its content
                i += 1
                while i < len(lines):
                    closing_line = lines[i].rstrip('\n').rstrip('\r')
                    if re.match(r'^`{' + str(len(fence_char)) + r',}\s*$', closing_line):
                        i += 1
                        break
                    i += 1
        else:
            i += 1

    return temp_files


def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <mdx_file> [<mdx_file> ...]", file=sys.stderr)
        return 1

    for mdx_path in sys.argv[1:]:
        for tmp_path in extract_deal_blocks(mdx_path):
            print(tmp_path)

    return 0


if __name__ == '__main__':
    sys.exit(main())
