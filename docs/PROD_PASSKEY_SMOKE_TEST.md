# Production Passkey Smoke Test (noot.smol.xyz)

Use this checklist before/after deploying passkey/auth changes.

## Preconditions
1. Use a fresh browser profile (no cached passkeys or site data).
2. Ensure `PUBLIC_API_URL` and relayer proxy are pointed at production.

## Steps
1. Visit `https://noot.smol.xyz/onboarding/passkey?debug`.
2. Click **Create Account** (or **Connect Wallet** if a passkey already exists).
3. Confirm `/login` returns `200` and a session cookie is set.
4. Refresh the page — silent restore should keep the wallet connected.
5. Perform a minimal on-chain action (transfer or no-op call) using the relayer.
6. Logout / disconnect, then reconnect (confirm session issues are gone).

## Expected Results
- `/login` returns `200` (no 400).
- Session cookie persists after refresh.
- Relayed transaction succeeds.
- Debug mode shows auth errors with `debugId` when failures occur.
