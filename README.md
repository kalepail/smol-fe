# 🎵 SMOL: The AI Music Revolution

> **Generate. Mint. Trade. Vibe.**  
> The future of decentralized AI music is here. Built on **Stellar**, powered by **AI**, and designed for **You**.

![Smol Banner](https://img.shields.io/badge/Status-Live_Beta-success?style=for-the-badge) ![Stellar](https://img.shields.io/badge/Blockchain-Stellar_Soroban-purple?style=for-the-badge) ![Framework](https://img.shields.io/badge/Frontend-Astro_%2B_Svelte_5-orange?style=for-the-badge)

## 🚀 What is Smol?

Smol is a next-gen web application where **AI meets the Blockchain**. It's not just a music generator; it's a complete ecosystem for digital artists and collectors.

*   **Create:** Turn text prompts into full songs (lyrics + audio) in minutes using advanced AI.
*   **Mint:** Immortalize your tracks as **NFTs** on the Stellar blockchain with a single click.
*   **Trade:** Buy, sell, and swap song tokens instantly via our built-in **AMM (Automated Market Maker)**.
*   **Vibe:** Explore music through the **Vibe Matrix**, a 3D tag-based discovery engine.

---

## ✨ Key Features

### 🎹 AI Music Studio
*   **Text-to-Audio:** Describe your vibe ("Cyberpunk jazz with rain sounds") and get 2 unique track variations.
*   **Lyric Generation:** AI writes the verses and choruses for you (or go Instrumental).
*   **Fail-Safe:** Automatic retry and local fallback generation ensure the music never stops.

### 🥬 The Kale Economy & Trading
*   **$KALE:** The lifeblood of the ecosystem. Tip artists, buy tracks, and power upgrades.
*   **Instant Liquidity:** Every song has its own liquidity pool. dynamic pricing based on demand.
*   **Passkey Wallet:** No seed phrases! Login securely with FaceID, TouchID, or YubiKey via **PasskeyKit**.

### 🌌 Vibe Matrix & Discovery
*   **Tag Graph:** Navigate a galaxy of related genres and moods.
*   **Smart Radio:** "Play Pop" actually plays Pop + related genres like Synthwave and Disco.
*   **Blind Spots:** Discover hidden gems outside your usual rotation.

### 👤 Artist Profiles 2.0
*   **Dynamic Discography:** Showcase your Created, Minted, and Collected tracks.
*   **Golden Kale:** Unlock premium profile badges and "Gold Member" status.
*   **Socials:** Tip artists directly with $KALE.

---

## 🛠️ Supercharged Tech Stack

We use the bleeding edge of web tech to deliver a native-app feel on the web.

| Layer | Technology | Why? |
| :--- | :--- | :--- |
| **Framework** | **Astro 5** | Blazing fast static shell + dynamic islands. |
| **UI Library** | **Svelte 5** | Runes API for granular, incredibly fast reactivity. |
| **Styling** | **Tailwind CSS 4** | Utility-first, optimized via Vite. |
| **Blockchain** | **Soroban (Stellar)** | Smart contracts for minting, trading, and logic. |
| **Auth** | **PasskeyKit** | Biometric, non-custodial wallet access. |
| **Deploy** | **Cloudflare Pages** | Global edge distribution. |

---

## ⚡ Quick Start

### Prerequisites
*   Node.js v18+
*   pnpm (v10+)

### 1. Clone & Install
```bash
git clone https://github.com/your-repo/smol-fe.git
cd smol-fe
pnpm install
```

### 2. Environment Setup
Create a `.env` file (ask the dev team for the magic keys 🔑):
```bash
PUBLIC_RPC_URL="https://soroban-testnet.stellar.org"
PUBLIC_API_URL="https://api.smol.xyz"
# ...plus contract IDs for KALE and SMOL
```

### 3. Blast Off 🚀
```bash
pnpm dev
# Opens locally at http://localhost:4321
```

---

## 🏗️ Architecture Highlights

### State Management (Runes)
We ditched traditional stores for **Svelte 5 Runes**. State is universal and reactivity is fine-grained.
*   `userState`: Wallet connection & auth.
*   `audioState`: Global player capability (persists across navigation).
*   `balanceStore`: Real-time token tracking.

### The Hybrid Hydration Strategy
We mix **Static Data (Snapshots)** with **Live Chain Data**:
1.  App loads instantly with a pre-built JSON snapshot of thousands of songs.
2.  Background workers hydrate "New Mints" from the blockchain.
3.  Vibe Matrix computes relationships locally in the browser (no heavy backend needed!).

---

## 🤝 Contributing

Got a wild idea?
1.  Fork it.
2.  Branch it (`git checkout -b feature/neon-mode`).
3.  Code it.
4.  Pull Request it.

*Style Guide: TypeScript + Svelte 5 + Tailwind. Keep it clean, keep it fast.*

---

## 📜 License

MIT. Built with ❤️ for the **Stellar Community**.
