# Antigravity Agent Manual (smol-fe)

## 🗺️ Repo Map (Read First)
See `docs/REPO_MAP.md` for a high-level architecture overview, hotspots, and danger zones.

## 🚀 Setup & Commands
- **Install**: `pnpm install`
- **Dev**: `pnpm run dev` (Starts Astro dev server)
- **Build**: `pnpm run build` (Cloudflare Pages adapter)
- **Typecheck**: `pnpm run check` (Svelte-check)
- **Lint**: No dedicated lint script found; respect existing formatting.

## ⚠️ Global Constraints (Non-Negotiable)
1.  **Small Diffs**: Focus on one task at a time. No "drive-by" refactoring.
2.  **Verify**: Always run `pnpm run check` before committing complex changes.
3.  **No Secrets**: Never commit `.env` or paste tokens in artifacts.
4.  **Ralph Loop**: For Auth/Tx/Ambiguity, use the `/ralph-loop` workflow (see `.agent/rules/60_ralph_loop.md`).

## 🛡️ Security
- **Relayer/Auth**: managed via `passkey-kit` and `OpenZeppelin`.
- **Secrets**: stored in `wrangler.toml` (vars) or Cloudflare dashboard.
- **Allowed Domains**:
    - `antigravity.google`
    - `docs.astro.build`
    - `svelte.dev`
    - `developers.cloudflare.com`

## 🐛 Debugging
- **Logs**: Check browser console for Svelte/Client errors. Check terminal output for SSR errors.
- **Common Issues**:
    - `503 Service Unavailable` on audio fetch -> Backend/Storage issue.
    - `Launchtube not configured` -> Review `src/services/api/transact.ts` & Relayer config.

## 🔄 After Every Task
1.  Update `scripts/ralph/prd.json` (mark current story passes=true).
2.  Append to `scripts/ralph/progress.txt` (what changed, what was learned).
3.  Commit with semantic message: `feat: [P0-X] - description`.
