#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"

if command -v rg >/dev/null 2>&1; then
  search() { rg -n --hidden "$@"; }
  search_i() { rg -n -i --hidden "$@"; }
else
  search() {
    local pattern="$1"
    shift
    grep -RInE "$pattern" "$@"
  }
  search_i() {
    local pattern="$1"
    shift
    grep -RInEi "$pattern" "$@"
  }
fi

FARM_PATHS=(
  "src/components/labs/the-farm"
  "src/lib/the-farm"
  "src/data/the-farm"
  "src/pages/labs/the-farm.astro"
  "contracts/farm-attestations"
)

scan_paths=()
for p in "${FARM_PATHS[@]}"; do
  if [ -e "$p" ]; then
    scan_paths+=("$p")
  fi
done

if [ ${#scan_paths[@]} -eq 0 ]; then
  echo "no THE FARM paths found"
  exit 1
fi

fail_if_found() {
  local pattern="$1"
  local label="$2"
  if search "$pattern" "${scan_paths[@]}"; then
    echo "FAIL: $label"
    exit 1
  fi
}

fail_if_found "setTimeout\\(" "setTimeout usage is forbidden in THE FARM logic"

if [ -d "src/lib/the-farm/verifiers" ] || [ -d "src/lib/the-farm/attest" ]; then
  targets=()
  [ -d "src/lib/the-farm/verifiers" ] && targets+=("src/lib/the-farm/verifiers")
  [ -d "src/lib/the-farm/attest" ] && targets+=("src/lib/the-farm/attest")
  if search "return[[:space:]]+true[[:space:]]*;" "${targets[@]}"; then
    echo "FAIL: verifier/attestation paths cannot short-circuit with 'return true'"
    exit 1
  fi
fi

if search_i "(fake|mock|dummy|placeholder)" "src/components/labs/the-farm" "src/lib/the-farm" "src/data/the-farm" 2>/dev/null; then
  echo "FAIL: forbidden stub wording in THE FARM verification/attestation logic"
  exit 1
fi

fail_if_found "Verified on Stellar" "forbidden copy 'Verified on Stellar' found"

echo "PASS: no stubs/no fake language/no forbidden copy"
