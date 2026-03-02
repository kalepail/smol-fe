# Security Policy

## 🛡️ Commitment
We prioritize the integrity of user assets and the correctness of our Zero-Knowledge circuits.

## ⚡ Reporting a Vulnerability
If you discover a vulnerability, **do not open a public issue.** 

Please report it privately:
1.  **GitHub Security Advisory**: Draft a private advisory via the "Security" tab.
2.  **Email**: security@smol.xyz (Placeholder - please use GitHub Advisories for now).

## 🔍 Critical Context
We are particularly interested in reports involving:
-   **Auth Bypass**: Any way to circumvent Passkey (WebAuthn) signatures.
-   **Asset Draining**: Transaction signature malleability or unauthorized asset transfers.
-   **ZK Soundness**: Exploits in Noir/RISC0/Circom circuits that allow for fraudulent game state verification.
-   **Serialization Errors**: G2 point limb ordering or Field element decoding failures in Stellar smart contracts.

## 🛠️ Verification
Always verify that `PUBLIC_WALLET_WASM_HASH` and `PUBLIC_TIER_VERIFIER_CONTRACT_ID` in your `.env` match the verified hashes provided in the **[STATE OF WORLD](docs/STATE_OF_WORLD.md)**.
