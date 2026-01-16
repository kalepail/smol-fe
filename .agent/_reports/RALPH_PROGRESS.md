# Ralph Loop: Mixtape Purchase Timeout

## Success Criteria
- [ ] Backend/Relayer communication does not time out (30s limit exceeded).
- [ ] "Support" button correctly initiates and completes purchase flow.
- [ ] No "Relayer submission failed" errors in console.

## Validators
- [x] Code Check: `passkey-kit` timeout settings (Confirmed 30s).
- [ ] Code Check: `services/api/mixtapes.ts` Axios/Fetch timeout settings.
- [x] Code Check: Implemented "Timeout Recovery" (`pollTransaction` + `try/catch` wrap).
- [ ] User Verification: Successful "Buy" test.

## Status Log
- **Iteration 1**: Investigating `src/utils/passkey-kit.ts` and `src/services/api/mixtapes.ts`. Found `BATCH_SIZE = 9` in `useMixtapePurchase`. Reduced to 3 to avoid backend 30s timeout. Also reduced `useMixtapeMinting` chunk size to 3.
- **Iteration 2**: Implemented **Timeout Recovery**. If relayer times out (30s) or fails, client now optimistically polls Stellar RPC (`pollTransaction`) to verify if the TX actually succeeded. This decouples client success from relayer HTTP response.


## Session: LabTech Implementation & StreamPay (2026-01-15)

### Achievements
- **LabTech Skill**: Installed (`.agent/skills/labtech/SKILL.md`).
- **Registry**: Created `labs/registry.json` acting as Single Source of Truth.
- **Backfill**: Created Manifests (`experiment.yml`) for all 6 experiments.
- **UI**: Added Readiness Badges (Triangles) to `/labs`.
- **StreamPay**:
  - Registered as `EXP-005` (ORANGE).
  - Fixed Type Errors (`Song_1`, `artist`).
  - Added Session Safeguards (`beforeunload`, `popstate`).
- **Hygiene**:
  - Fixed Global Player overlapping labs (`Layout.astro`).
  - Fixed `KaleOrFailCore` type errors.
  - **`npm run check` PASSED** (0 Errors).

### Hygiene Stats
- **Branch**: `main` (assumed)
- **Check Status**: GREEN (0 Errors).
- **Type Safety**: Improved (Domain Alignment).

---

## Session: Swapper Ohloss Alignment (2026-01-15)

### Ralph Loop: Swapper C-Address Swap Failures

**Success Criteria:**
- [ ] C-address swaps (XLM<->KALE) complete without simulation errors
- [ ] No "expected a 'Transaction'" type errors
- [ ] No "undefined wallet" crashes

### Fixes Deployed

| Commit | Issue | Fix |
|--------|-------|-----|
| `882634e` | `HostError #608` on EXACT_OUT swaps | Fixed `amountIn`/`amountOutMin` mapping based on `quote.tradeType` |
| `e803978` | `expected a 'Transaction', got: [object Object]` | Changed `@stellar/stellar-sdk` → `@stellar/stellar-sdk/minimal` |
| `29c05fc` | Potential `wallet undefined` crash | Added defensive reconnection guard before signing |

### DeepWiki Research Findings

**Verified against Tyler's repos (passkey-kit, ohloss):**
- passkey-kit imports from `@stellar/stellar-sdk/minimal` (line 2 of `kit.ts`)
- passkey-kit's `sign()` method internally calls `signAuthEntries()` → `signAuthEntry()`
- We do NOT need to manually replicate ohloss's XDR reconstruction — passkey-kit handles it

### Remaining Considerations

| Aspect | Current | Tyler's Pattern | Priority |
|--------|---------|-----------------|----------|
| TX Source | `NULL_ACCOUNT` | `deployerPublicKey` | LOW (relayer rewraps) |
| Sequence | `"0"` | From network | LOW (relayer rewraps) |

**Recommendation**: Monitor. If swaps fail with sequence errors, migrate to Tyler's pattern.

### Validators
- [x] `npm run check` passes
- [ ] Live swap test on noot.smol.xyz (pending Cloudflare rebuild)

