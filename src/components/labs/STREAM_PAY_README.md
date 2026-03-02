
# Technical Note: Streaming with Passkeys
You are absolutely correct. Standard passkeys require biometric interaction for *every* signature, making true per-second signing impossible (UX-wise).

To achieve "StreamPay" on Stellar with Passkeys, we utilize **Session Keys (Ephemeral Signers)**:
1.  **Handshake**: User uses Passkey **ONCE** to authorize a temporary "Session Key" (Ed25519 keypair generated in browser memory).
2.  **Delegation**: The Smart Wallet (SAC) adds this Session Key as a limited-scope signer (or grants it allowance).
3.  **Streaming**: The browser uses the Session Key to silently sign micro-transactions or state updates in the background.
4.  **Cleanup**: The Session Key expires or is revoked on exit.

*For this EXP-005 prototype, we effectively simulate the "Usage" of this Session Key.*
