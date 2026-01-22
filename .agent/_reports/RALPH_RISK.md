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
