# STATE OF WORLD
**Last verified:** 2026-01-27

This is the **Canonical Source of Truth** for the Smol Frontend environment and architecture. All other documentation must align with this file.

## 🏗️ Environment & Networking
| Key | Value | Canonical Docs |
| :--- | :--- | :--- |
| **Dev Port** | `4321` (HTTP/HTTPS via mkcert) | [DEVELOPER_SETUP](DEVELOPER_SETUP.md) |
| **Prod URL** | `https://noot.smol.xyz` | [README](../README.md) |
| **Dev URL** | `https://smol-fe-7jl.pages.dev/` | [DEVELOPER_SETUP](DEVELOPER_SETUP.md) |
| **API URL** | `https://api.smol.xyz` | [INTEGRATION_REFERENCE](INTEGRATION_REFERENCE.md) |
| **pnpm Version** | `10.18.1` | [README](../README.md) |
| **Node.js** | `22.21.1` | [README](../README.md) |

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
| **Localhost Auth** | Limited (use Cloudflare Pages for full testing) |

## 🎼 Product Logic
- **Tipping Tokens**: `KALE`, `XLM`, `USDC`
- **Default Tipping Split**: 30% Curator, 50% Artist, 20% Minter
- **Mixtape Chunk Size**: 5 tracks per batch (Transaction/Resource limits)

## 🛠️ Stack Versions
- **Astro**: `5.14.x`
- **Svelte**: `5.39.x`
- **Tailwind CSS**: `4.1.x`

> [!IMPORTANT]
> Any document found to contradict the **STATE OF WORLD** is considered invalid and must be corrected immediately.

