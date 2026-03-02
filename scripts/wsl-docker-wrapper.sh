#!/usr/bin/env bash
set -euo pipefail

# Docker Desktop on Windows can be invoked from WSL via `docker.exe`, but:
# - `risc0-groth16` calls `docker` (not `docker.exe`)
# - It passes WSL mount paths like `/mnt/c/...`, which Windows docker doesn't mount
#
# This wrapper lets WSL tooling call `docker` while translating `-v /mnt/<drive>/...:/...`
# into `-v <DRIVE>:\\...:/...` and then delegating to `docker.exe`.

translate_vol() {
  local spec="$1"
  local host="${spec%%:*}"
  local rest="${spec#*:}"

  if [[ "$host" =~ ^/mnt/([a-zA-Z])/(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]}"
    local tail="${BASH_REMATCH[2]}"
    drive="${drive^^}"
    # `/mnt/c/Users/Jeff` -> `C:\Users\Jeff`
    host="${drive}:\\${tail//\//\\}"
  fi

  printf '%s:%s' "$host" "$rest"
}

out=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--volume)
      out+=("$1")
      shift
      out+=("$(translate_vol "$1")")
      shift
      ;;
    *)
      out+=("$1")
      shift
      ;;
  esac
done

exec docker.exe "${out[@]}"

