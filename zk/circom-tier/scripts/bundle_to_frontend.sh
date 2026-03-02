#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
OUT=artifacts/samples
VK=artifacts/verification_key.json
BUNDLE=artifacts/bundle.json

jq -n \
  --argjson vk "$(cat $VK)" \
  --argjson sprout "$(cat $OUT/proof_sprout.json)" \
  --argjson grower "$(cat $OUT/proof_grower.json)" \
  --argjson harvester "$(cat $OUT/proof_harvester.json)" \
  --argjson whale "$(cat $OUT/proof_whale.json)" \
  --argjson edge "$(cat $OUT/proof_edge.json)" \
  --argjson invalid "$(cat $OUT/proof_invalid.json)" \
  --argjson psprout "$(cat $OUT/public_sprout.json)" \
  --argjson pgrower "$(cat $OUT/public_grower.json)" \
  --argjson pharvester "$(cat $OUT/public_harvester.json)" \
  --argjson pwhale "$(cat $OUT/public_whale.json)" \
  --argjson pedge "$(cat $OUT/public_edge.json)" \
  --argjson pinvalid "$(cat $OUT/public_invalid.json)" \
  '{verificationKey:$vk,samples:{sprout:{proof:$sprout,public:$psprout},grower:{proof:$grower,public:$pgrower},harvester:{proof:$harvester,public:$pharvester},whale:{proof:$whale,public:$pwhale},edge:{proof:$edge,public:$pedge},invalid:{proof:$invalid,public:$pinvalid}}}' > "$BUNDLE"

