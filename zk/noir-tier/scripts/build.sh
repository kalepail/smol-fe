#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

mkdir -p artifacts/samples

nargo compile
bb write_vk -b "target/the_farm_noir.json" -o "artifacts"
