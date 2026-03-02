#!/usr/bin/env bash
set -euo pipefail

# SMOL prover bootstrap for Ubuntu 22.04+.
# Installs Docker + Node + pnpm + Rust, clones SMOL-FE, installs deps, and runs the prover as a systemd service.
#
# Usage:
#   sudo bash infra/prover/bootstrap-ubuntu.sh
#
# Prereqs:
# - /etc/smol-prover.env exists (copy from infra/prover/smol-prover.env.example)
#

if [[ "$(id -u)" != "0" ]]; then
  echo "ERROR: run as root (use sudo)" >&2
  exit 1
fi

if [[ ! -f /etc/smol-prover.env ]]; then
  echo "ERROR: missing /etc/smol-prover.env" >&2
  echo "Copy infra/prover/smol-prover.env.example to /etc/smol-prover.env and edit it first." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[bootstrap] apt update + base deps..."
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git jq openssl \
  build-essential pkg-config libssl-dev \
  unzip \
  python3 \
  bash

echo "[bootstrap] install Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "[bootstrap] install Node.js 22 + pnpm (corepack)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@latest --activate

echo "[bootstrap] install Rust toolchain..."
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs | bash -s -- -y
fi

# rustup installs into /root by default when run under sudo/root.
export PATH="/root/.cargo/bin:${PATH}"
rustup target add wasm32v1-none >/dev/null 2>&1 || true

echo "[bootstrap] clone/update repo..."
REPO_URL="${SMOL_FE_REPO_URL:-https://github.com/tacticalnoot/SMOL-FE.git}"
REPO_REF="${SMOL_FE_REPO_REF:-main}"

mkdir -p /opt
if [[ ! -d /opt/smol-fe/.git ]]; then
  git clone --depth 50 "${REPO_URL}" /opt/smol-fe
fi
cd /opt/smol-fe
git fetch --all --prune
git checkout "${REPO_REF}"
git pull --ff-only || true

echo "[bootstrap] install dependencies..."
pnpm i --frozen-lockfile

echo "[bootstrap] ensure Noir toolchain (repo script)..."
if [[ -f scripts/ensure-noir-toolchain.sh ]]; then
  bash scripts/ensure-noir-toolchain.sh || true
fi

echo "[bootstrap] install systemd service..."
cp -f infra/prover/smol-prover.service /etc/systemd/system/smol-prover.service
systemctl daemon-reload
systemctl enable --now smol-prover.service

echo "[bootstrap] done."
echo "Prover healthcheck:"
echo "  curl -s http://127.0.0.1:8788/health | jq ."

