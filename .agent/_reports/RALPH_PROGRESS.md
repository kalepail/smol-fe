# Ralph Loop: Mixtape Purchase Timeout

## Success Criteria
- [ ] Backend/Relayer communication does not time out (30s limit exceeded).
- [ ] "Support" button correctly initiates and completes purchase flow.
- [ ] No "Relayer submission failed" errors in console.

## Validators
- [ ] Code Check: `passkey-kit` timeout settings.
- [ ] Code Check: `services/api/mixtapes.ts` Axios/Fetch timeout settings.
- [ ] User Verification: Successful "Buy" test.

## Status Log
- **Iteration 1**: Investigating `src/utils/passkey-kit.ts` and `src/services/api/mixtapes.ts`. Found `BATCH_SIZE = 9` in `useMixtapePurchase`. Reduced to 3 to avoid backend 30s timeout. Also reduced `useMixtapeMinting` chunk size to 3. Pending User Verification.
