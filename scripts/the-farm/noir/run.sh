#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$ROOT/zk/noir-tier"

bash ./scripts/build.sh
bash ./scripts/generate_samples.sh
bash ./scripts/verify_samples.sh
bash ./scripts/bundle_to_frontend.sh
