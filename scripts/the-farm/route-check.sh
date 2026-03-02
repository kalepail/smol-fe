#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

if command -v rg >/dev/null 2>&1; then
  search() { rg -n "$@"; }
else
  search() {
    local pattern="$1"
    shift
    grep -RInE "$pattern" "$@"
  }
fi

if [ ! -f "src/pages/labs/the-farm.astro" ]; then
  echo "FAIL: canonical route file src/pages/labs/the-farm.astro is missing"
  exit 1
fi

if ! search '"href"[[:space:]]*:[[:space:]]*"/labs/the-farm"' "labs/registry.json" >/dev/null; then
  echo "FAIL: labs registry does not point THE FARM to /labs/the-farm"
  exit 1
fi

other_pages=$(find src/pages -type f -iname "*the-farm*" | grep -v "src/pages/labs/the-farm.astro" || true)
if [ -n "$other_pages" ]; then
  echo "FAIL: unexpected THE FARM page routes found:"
  echo "$other_pages"
  exit 1
fi

page_hits=$(search "/the-farm" "src/pages" || true)
non_canonical_pages=$(printf "%s\n" "$page_hits" | grep -v "/labs/the-farm" || true)
if [ -n "$non_canonical_pages" ]; then
  echo "FAIL: non-canonical /the-farm page references found"
  echo "$non_canonical_pages"
  exit 1
fi

href_hits=$(search '"href"[[:space:]]*:[[:space:]]*"/[^"]*the-farm' "labs/registry.json" || true)
non_canonical_hrefs=$(printf "%s\n" "$href_hits" | grep -v '"/labs/the-farm"' || true)
if [ -n "$non_canonical_hrefs" ]; then
  echo "FAIL: non-canonical /the-farm href references found"
  echo "$non_canonical_hrefs"
  exit 1
fi

echo "PASS: canonical route /labs/the-farm only"
