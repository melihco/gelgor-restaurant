#!/usr/bin/env bash
# Remove orphaned Remotion webpack bundles from macOS temp (~700MB each).
set -euo pipefail
TMP="${TMPDIR:-/tmp}"
count=0
for prefix in remotion-webpack-bundle- remotion-v4.0.; do
  while IFS= read -r -d '' dir; do
    rm -rf "$dir"
    count=$((count + 1))
  done < <(find "$TMP" -maxdepth 1 -type d -name "${prefix}*" -print0 2>/dev/null)
done
echo "Removed $count Remotion temp director(ies) under $TMP"
df -h /System/Volumes/Data 2>/dev/null | tail -1 || df -h / | tail -1
