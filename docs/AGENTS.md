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
2.  **No Secrets**: `wrangler.toml` is the only place for vars.
3.  **Ralph Loop**: Use `/ralph-loop` for high-risk auth/tx changes.
4.  **Sanitized**: Do not commit PII (Names, IPs).
