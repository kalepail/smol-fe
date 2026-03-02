# STATE OF WORLD
**Last verified:** 2026-02-19

This is the **Canonical Source of Truth** for the Smol Frontend environment and architecture. All other documentation must align with this file.

## 🏗️ Environment & Networking
| Key | Value | Canonical Docs |
| :--- | :--- | :--- |
| **Dev Port** | `4321` (HTTP/HTTPS via mkcert) | [DEVELOPER_SETUP](DEVELOPER_SETUP.md) |
| **Prod URL** | `https://noot.smol.xyz` | [README](../README.md) |
| **Dev URL** | `https://smol-fe-7jl.pages.dev/` | [DEVELOPER_SETUP](DEVELOPER_SETUP.md) |
| **Relay URL** | `https://api.kalefarm.xyz` | [README](../README.md) |
| **pnpm Version** | `10.x` | [README](../README.md) |
| **Node.js** | `22.x` | [README](../README.md) |

## ⛓️ Blockchain Connectivity
### Mainnet (Production)
| Asset/Contract | ID / Hash | Explorer |
| :--- | :--- | :--- |
| **Smol Contract** | `CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA) |
| **KALE Token** | `CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV) |
| **XLM Token** | `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA) |
| **Wallet WASM** | `ecd990f0b45ca6817149b6175f79b32efb442f35731985a084131e8265c4cd90` | - |
| **Aggregator** | `CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH) |
| **Tier Verifier (ZK)** | `CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M) |
| **Farm Attestations (ZK)** | `CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR) |

### Testnet (Hackathon / Labs)
| Asset/Contract | ID | Explorer |
| :--- | :--- | :--- |
| **Tier Verifier (ZK)** | `CDPACZDP7LZ4BEHVG64EAEOOGNTJS5V4WB2JGMZ4I6FK2GCAYVO7LRCC` | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDPACZDP7LZ4BEHVG64EAEOOGNTJS5V4WB2JGMZ4I6FK2GCAYVO7LRCC) |
| **RISC0 Verifier (ZK)** | `CDQCOSAQTGZLBOJ3OQSYVIFSLPMHIQPUJWS6RYKCEJUGDQGZNPIFVWLJ` | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDQCOSAQTGZLBOJ3OQSYVIFSLPMHIQPUJWS6RYKCEJUGDQGZNPIFVWLJ) |
| **Attestations (ZK)** | `CCZIYZUY4GDT4SZ66THR6KJBYECG7PVCMWFDESL4STYROOEJICIQB4JT` | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCZIYZUY4GDT4SZ66THR6KJBYECG7PVCMWFDESL4STYROOEJICIQB4JT) |

## 📦 Data Architecture
| Key | Path | Purpose |
| :--- | :--- | :--- |
| **Snapshot JSON** | [`/public/data/GalacticSnapshot.json`](../public/data/GalacticSnapshot.json) | Hybrid hydration data |
| **Snapshot Script** | [`/scripts/universal-snapshot.js`](../scripts/universal-snapshot.js) | Regenerates the snapshot |
| **Minter Cache** | [`/public/data/minter-cache.json`](../public/data/minter-cache.json) | Optimizes artist lookups |

## 🛡️ Authentication (Passkey Kit)
| Key | Value |
| :--- | :--- |
| **Method** | WebAuthn (Passkeys) |
| **Session Key** | `smol_token` (Cookie) |
| **Local Storage** | `smol:contractId`, `smol:keyId` |
| **Proxy Pattern** | Astro server-side proxy (`/api/dungeon/*`) for CORS bypass |

## 🎼 Product Logic
- **Tipping Tokens**: `KALE`, `XLM`, `USDC`
- **Default Tipping Split**: 30% Curator, 50% Artist, 20% Minter (Mixtapes only; manual for direct tips)
- **Zero-Knowledge Proofs**: Integrates Noir, RISC0, and Circom for on-chain state verification.
- **High-Fidelity Fork**: Officially maintained fork of `smol.xyz` with enhanced organization and performance.

## 🛠️ Stack Versions
- **Astro**: `5.14.x`
- **Svelte**: `5.39.x`
- **Tailwind CSS**: `4.1.x`

> [!IMPORTANT]
> Any document found to contradict the **STATE OF WORLD** is considered invalid and must be corrected immediately.

