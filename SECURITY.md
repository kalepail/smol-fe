# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Main    | :white_check_mark: |

## Reporting a Vulnerability

We take the security of `smol-fe` and the underlying user assets seriously.

If you discover a security vulnerability within this project, particularly regarding:
-   **Authentication** (Passkey/WebAuthn bypasses)
-   **Transaction Signing** (Asset draining, unauthorized signing)
-   **Private Key Leakage** (Exposure of secrets)

Please **DO NOT** create a public GitHub issue.

Instead, please report it via:
1.  **Private Email**: maintainer@smol.xyz (replace with actual if available, or use GitHub Security Advisories if enabled).
2.  **GitHub Security Advisory**: If you have permissions, draft a security advisory in this repo.

## Critical Areas

Be extra cautious when modifying:
-   `src/utils/passkey-kit.ts`
-   `src/utils/mint.ts`
-   `src/stores/user.svelte.ts`

Always verify that `PUBLIC_WALLET_WASM_HASH` matches the expected hash for the environment.
