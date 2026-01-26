# Ralph Loop Progress: Passkey RP ID Fix

## Success Criteria
- [ ] `getSafeRpId` correctly handles `pages.dev` and `vercel.app` (returns full hostname).
- [ ] All usages of `getDomain` in authentication flows are replaced with `getSafeRpId`.
- [ ] Build passes.
- [ ] User confirms invalid RP ID error is resolved on deployment.

## Hypotheses
1.  **Hypothesis A**: `tldts.getDomain` returns `pages.dev` for `*.pages.dev` domains because `pages.dev` is a public suffix. WebAuthn spec forbids using public suffixes as RP IDs.
    -   **Status**: Confirmed. `pages.dev` is in the public suffix list.
2.  **Hypothesis B**: `useAuthentication.ts` was bypassing `getSafeRpId` (which I patched earlier) and calling `tldts` directly.
    -   **Status**: Confirmed. Code audit showed direct import.

## Validation Steps
### Iteration 1
- **Change**: Patched `src/utils/domains.ts` to explicitly handle `pages.dev`.
- **Result**: Failed. `useAuthentication.ts` wasn't using the utility.

### Iteration 2
- **Change**: Patched `src/hooks/useAuthentication.ts` to use `getSafeRpId`.
- **Validator**: run `test-rp-id.ts` (local unit test).
- **Result**: [PENDING]

### Verified Usages
- `KaleOrFailCore.svelte`: ✅ `getSafeRpId`
- `transaction-helpers.ts`: ✅ `getSafeRpId`
- `mint.ts`: ✅ `getSafeRpId`
- `useMixtapeMinting.ts`: ✅ `getSafeRpId`
- `useAuthentication.ts`: ✅ (Patched)
