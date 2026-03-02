<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Agent, Dev
- NATURE: Procedure
- LAST_HARDENED: 2026-02-19
- VERIFICATION_METHOD: [Claim check]
-->
# Antigravity Agent Manual (smol-fe)

## 🗺️ Navigation
- **Map**: See [docs/INDEX.md](INDEX.md) for the full documentation tree.
- **Map of Danger**: See `docs/archive/AUDIT_NOTES.md` before touching core logic.

## 🚀 Quick Reference
- **Repo**: Svelte 5 (Runes), Astro 5, Tailwind 4.
- **State**: `src/stores/` (Global Runes).
- **Auth**: `passkey-kit` + Stellar (Soroban).
- **Data**: Hybrid Strategy (Snapshot (`public/data/GalacticSnapshot.json`) + Live Hydration).

## ⚠️ Prime Directives
1.  **Small Diffs**: One task, one focus. Verify often.
2.  **No Secrets**: `.env` and `wrangler.toml` are the only places for vars.
3.  **Agent Loop**: Use `/agent-loop` for high-risk auth/tx changes.
4.  **Fail-Closed Docs**: All technical facts are governed by `docs/STATE_OF_WORLD.md`. If a doc contradicts it, it is wrong.
5.  **Sanitized**: Do not commit PII (Names, IPs).
6.  **Everything Lab**: The `/labs` section is for innovation. If you build a new experiment, register it in `labs/registry.json`.

## 🧪 Knowledge Sources
- **ZK Gaming**: See `docs/LABS_INTEGRITY.md` for circuit and contract details.
- **Smart Accounts**: See `docs/PASSKEY_WALLET_TRANSACTION_AUDIT.md`.
