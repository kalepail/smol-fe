# Ralph Loop: Cloudflare Worker 1101 Error

## Success Criteria
- [ ] https://smol-fe-7jl.pages.dev/ loads without Error 1101
- [ ] Homepage renders correctly with smol content

## Validators
1. **CF Build**: Deployment succeeds (no binding conflicts)
2. **Runtime Check**: `curl -s https://smol-fe-7jl.pages.dev/ | head -c 500` returns HTML, not error page

## Max Budget
- 5 iterations max
- If not fixed by iteration 5, switch to /triage

---

## Iteration 1

**Hypothesis**: The `@openzeppelin/relayer-plugin-channels` package imports `crypto` which gets externalized, causing CF Workers runtime failure

**Investigation**:
- Build logs warned: `crypto` module externalized from `@openzeppelin/relayer-plugin-channels`
- Grep found: Package is NOT imported anywhere in src/ - it's dead weight
- The `passkey-kit.ts` uses raw `fetch()` to OZ Channels API, doesn't need the SDK

**Change**: Removed `@openzeppelin/relayer-plugin-channels` from package.json

**Commit**: `46bef3e`

**Validator Results**: ❌ Still 1101 - proceeding to Iteration 2

---

## Iteration 2

**Hypothesis**: `passkey-kit.ts` creates `PasskeyKit` and `SACClient` at module load time (top-level `export const`). If any store/hook imports this, SSR will init these classes which may use crypto APIs that fail on CF Workers.

**Investigation**:
- `user.svelte.ts` imports `account` from passkey-kit at top-level
- `balance.svelte.ts` imports `kale`, `xlm` from passkey-kit at top-level
- Multiple hooks and Svelte components also import these

**Change**: Refactored `passkey-kit.ts` to use lazy-init pattern with `.get()` accessors. Updated all 16 callsites across 10 files.

**Files Changed** (19 total):
- `passkey-kit.ts` - lazy-init pattern
- `user.svelte.ts`, `balance.svelte.ts` - use `.get()`
- 6 hooks: `useAuthentication`, `useKaleTransfer`, `useMixtapeMinting`, `useMixtapePurchase`, `useMixtapeSupport`, `useTradeExecution`
- 7 Svelte components: `Account`, `Smol`, `SmolResults`, `RadioResults`, `ArtistResults`, `MintTradeModal`, `SwapperCore`, `TipArtistModal`
- `balance.ts` - fixed type annotation

**Commit**: `a378f21`

**Build**: ✓ Passed locally

**Validator Results**: ❌ Still 1101 (Commit `a378f21`) - proceeding to Iteration 3

---

## Iteration 3

**Hypothesis**: The lazy-init fix was good, but insufficient. The runtime error is likely due to missing Node.js polyfills (specifically `crypto`, `stream`, or `process`) required by `passkey-kit` or `stellar-sdk` deeper in the dependency tree, or by `jimp`.

**Investigation**:
- `astro.config.mjs` only included `buffer` polyfill.
- `jimp` dependency was present but likely unused/removable.

**Change**:
1. Expanded `astro.config.mjs` polyfills: `crypto`, `stream`, `util`, `process`, `vm`.
2. Removed `jimp` dependency via `pnpm remove jimp`.

**Files Changed**:
- `astro.config.mjs`
- `package.json` / `pnpm-lock.yaml`

**Commit**: `e4e4fa4`

**Build**: ✓ Passed locally

**Validator Results**: ✅ PASSED (Checked https://smol-fe-7jl.pages.dev/ - No 1101, Branding Loaded)

---

# SUCCESS
Verified persistent resolution of global 1101 error.



