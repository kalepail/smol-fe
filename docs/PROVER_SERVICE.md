<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-02-19
- VERIFICATION_METHOD: [Claim check]
-->
# Prover Service (Production)

The ZK Dungeon uses a prover service to generate proofs for:
- Room 2: Noir UltraHonk (on-chain compatible proof format)
- Room 3: RISC0 receipt -> Groth16 wrapper proof (on-chain compatible Groth16 format)

This is **not** runnable inside the Cloudflare adapter runtime. In production you run a separate prover service and the site proxies to it.

## Architecture

- Browser calls: `/api/dungeon/prover/*` (same origin)
- Cloudflare Pages (server) proxies to: `PROVER_URL` with `Authorization: Bearer $PROVER_API_KEY`
- Prover service runs: `node scripts/local-prover-server.mjs` on a Linux host (recommended) or Windows+WSL (dev)

## Cloudflare Pages Config

Set server-side env vars (not `PUBLIC_*`):

- `PROVER_URL` (required)
- `PROVER_API_KEY` (recommended)
- `PROVER_TIMEOUT_MS` (optional, default 300000)

Helper script (runs `wrangler pages secret put` for you):

```powershell
pnpm i
pwsh -File scripts/prover/set-pages-prover-secrets.ps1 -ProjectName smol-fe -ProverUrl "https://<your-prover-host>:8788" -ProverApiKey "<token>"
```

## Prover Service Config

On the prover host, run:

```bash
cd smol-fe
pnpm i

export PROVER_BIND=0.0.0.0
export PROVER_PORT=8788
export PROVER_API_KEY="your-long-random-token"

node scripts/local-prover-server.mjs
```

### Host Requirements (Linux recommended)

- Docker available (required for the RISC0 Groth16 shrink-wrap step)
- Rust toolchain (first build can take a while)
- For Noir: the repo’s Noir toolchain scripts under `zk/noir-dungeon-role-legacy`

## Health Check

- `GET /api/dungeon/prover/health` should return `{ "ok": true }` when configured.

## VM Bootstrap (Recommended)

There is a turnkey Ubuntu bootstrap + systemd unit in:

- `infra/prover/bootstrap-ubuntu.sh`
- `infra/prover/smol-prover.service`
- `infra/prover/smol-prover.env.example`

And an optional SSH deploy helper:

```powershell
pwsh -File scripts/prover/deploy-prover-ssh.ps1 -Host "<vm-ip-or-dns>" -User ubuntu -ProverApiKey "<token>"
```
