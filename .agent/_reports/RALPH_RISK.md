# Ralph Risk Report: Channels XDR Parsing Fix (2026-01-16)

## Change Summary
- Updated relayer Channels payload parsing to use `TransactionBuilder.fromXDR` with a fallback to the legacy public network passphrase string.

## Risks & Mitigations
- **Risk**: Incorrect parsing of fee-bump transactions could lead to missing operations.
  - **Mitigation**: Use inner transaction operations when present; keep existing single-operation validation.
- **Risk**: Incorrect network passphrase could still fail parsing for some wallets.
  - **Mitigation**: Try `Networks.PUBLIC` first, then fall back to the legacy string.
- **Risk**: User-facing error clarity.
  - **Mitigation**: Provide explicit error text advising refresh or alternate wallet.

## Checks Performed
- `pnpm run build` (pass)
- `pnpm test` (pass)
- `pnpm run check` (fails due to pre-existing repo type errors)

---

# Ralph Risk Report: Passkey Login Hotfix (2026-01-24)

## Change Summary
- Added SmartAccountKit wrapper for passkey auth with IndexedDB storage.
- Switched frontend login/signup to SmartAccountKit and added debug logging for /login.
- Added credentialed fetches to support challenge/session cookies.

## Risks & Mitigations
- **Risk**: Missing `PUBLIC_WEBAUTHN_VERIFIER_ADDRESS` will break SmartAccountKit init.
  - **Mitigation**: Added env validation and documentation to require the verifier contract address.
- **Risk**: Relayer auto-submit could fail if the proxy expects Turnstile headers.
  - **Mitigation**: Fallback to existing KaleFarm `send()` when auto-submit fails.
- **Risk**: Silent restore may clear stale credentials if session is missing.
  - **Mitigation**: Keeps explicit error logging and forces clean auth state for retry.

## Checks Performed
- `pnpm run check` (fails due to pre-existing repo type errors in SmolResults and Mixtape purchase flow)

## Update (2026-01-24)
- **Risk**: Transaction helper type loosening could hide incompatible SDK types.
  - **Mitigation**: Cast only at signing boundary and keep runtime behavior unchanged.

## Checks Performed
- `pnpm run check` (pass)
