---
name: project-standards
description: Frontend and styling conventions for Smol FE. Use when writing new components or pages to ensure consistency.
---

# Project Standards Skill

Follow these conventions when developing for Smol FE.

## 1. Typography 🔡
- **Pixel Font**: Use `font-pixel` for all text in Labs and Arcade sections.
- **Headers**: `text-4xl` or `text-8xl` for main titles.
- **Colors**:
  - Primary Text: `#9ae600` (Terminal Green)
  - Accent: `#ff424c` (Labs Red)
  - Warning: `#FDDA24` (Biohazard Yellow)
  - Sky Blue: `#7dd3fc` (Moonlight accent)

## 2. API & Data Fetching 📡
- **RPC Calls**: ALWAYS use `src/utils/rpc.ts`. Do NOT use `PUBLIC_RPC_URL` directly.
- **Large Data**: Use client-side fetching (`onMount`) for heavy JSON snapshots.
  - Pattern: `let data = [];` -> `onMount(async () => { data = await fetch(...); });`
  - Avoid `Astro.props` for large datasets to prevent build-time OOMs.
- **Price/Quotes**: NEVER use simple spot price or order book mid-price.
  - **Rule**: Always fetch a Quote for the *exact amount* to account for realistic market depth and slippage.
  - **Tools**: Use Soroswap or xBull Aggregators (which route via multiple pools). Avoid raw Horizon/StellarExpert price feeds for execution.

## 3. Component Structure 🧩
- **Svelte 5**: Use runes (`$state`, `$derived`, `$effect`) for reactivity.
- **Astro**: Preferred for static pages and layouts.
- **Client Hydration**: Use `client:only="svelte"` for interactive components.

## 4. State Management 📊
- **Global Stores**: Located in `src/stores/`
  - `userState` — Authentication, contractId, keyId
  - `balanceState` — XLM and KALE balances
  - `audioState` — Playback state
  - `preferences` — User settings, themes

## 5. Environment Variables 🔧
```
PUBLIC_RPC_URL          → Stellar RPC endpoint
PUBLIC_NETWORK_PASSPHRASE → "Public Global Stellar Network ; September 2015"
PUBLIC_KALE_SAC_ID      → KALE token contract
PUBLIC_XLM_SAC_ID       → XLM wrapped contract
PUBLIC_TURNSTILE_SITE_KEY → Cloudflare Turnstile
PUBLIC_SOROSWAP_API_KEY → Soroswap API access
```

## 6. Labs Components 🧪
- **Location**: `src/components/labs/`
- **Naming**: PascalCase for components (e.g., `SwapperCore.svelte`)
- **Styling**: Glass morphism with `backdrop-blur`, dark slate backgrounds

## 7. Transaction Patterns 💳
- **One Wire**: ALWAYS use `signSendAndVerify` from `src/utils/transaction-helpers.ts`.
- **Relayer**: Use `send()` from `src/utils/passkey-kit.ts` (Handles Turnstile).
- **C Addresses**: Required for all smart account interactions.
- See `blockchain-transactions` skill for detailed Stellar/Soroban patterns.

## 8. Testing & Deployment 🚀
- **Build**: `pnpm build`
- **Lint**: `npx astro check` & `npx svelte-check`
- **Verification**: Run the **Agent Loop** pattern for any high-risk changes (Passkeys, TX flows).
- **Build**: `pnpm build`
- **Local Dev**: `pnpm dev` (requires HTTPS for passkeys)
- **Deployment**: PR to `kalepail/smol-fe:noot` branch for noot.smol.xyz

## 9. Troubleshooting 🔧
- **"client:only" Error**: Ensure component name matches import.
- **Build Hangs**: Move large data files from frontmatter to client-side fetch.
- **Passkey Errors**: Check rpId matches domain, ensure HTTPS.
- **Turnstile 401**: Domain not in sitekey allowlist in Cloudflare dashboard.
