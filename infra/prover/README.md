# Prover Deployment (Production)

This folder contains scripts to deploy the ZK Dungeon prover service to a Linux VM so Rooms 2–3 work in production without any user machine tooling.

## What This Enables

- `/labs/the-farm/zkdungeon` Room 2 (Noir UltraHonk): proof generation via prover service, then **real on-chain verification** via `farm-attestations -> ultrahonk-verifier`.
- `/labs/the-farm/zkdungeon` Room 3 (RISC0 -> Groth16): receipt generation + Groth16 shrink-wrap via prover service, then **real on-chain BN254 pairing check** (via `farm-attestations` Groth16 VK registry when available, otherwise dedicated verifier contract).

The website calls same-origin `/api/dungeon/prover/*` which proxies to the prover using `PROVER_URL` and `PROVER_API_KEY` (kept server-side in Cloudflare Pages).

## VM Requirements

- Ubuntu 22.04+ (recommended)
- 2+ vCPU (4+ recommended), 8GB RAM recommended (first builds can be heavy)
- Disk space: ~20GB+ (Rust build artifacts + docker layers)
- Inbound TCP: `8788` (or restrict to Cloudflare egress only, see notes)

## Quick Start (on the VM)

1. Copy `smol-prover.env.example` to `/etc/smol-prover.env` and edit values.
2. Run `bootstrap-ubuntu.sh` as root (installs Docker + Node + pnpm + Rust, clones repo, installs deps, enables service).

Files:
- `bootstrap-ubuntu.sh`
- `smol-prover.service`
- `smol-prover.env.example`

## Cloudflare Pages Wiring

After the prover is reachable, set Pages secrets:
- `PROVER_URL` (e.g. `https://prover.yourdomain.com`)
- `PROVER_API_KEY` (same as `/etc/smol-prover.env`)
- Optional: `PROVER_TIMEOUT_MS`

See `scripts/prover/set-pages-prover-secrets.ps1`.

## Security Notes

- The prover is CPU-expensive. Keep `PROVER_API_KEY` enabled.
- Prefer restricting inbound access to Cloudflare egress ranges or putting the prover behind a firewall / tunnel.
- The app’s proxy attaches the API key server-side; browsers never see it.

