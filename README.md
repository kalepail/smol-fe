# Smol - AI Music & Everything Lab ⚡

**Production**: [noot.smol.xyz](https://noot.smol.xyz) | **Hackathon Preview**: [smol-fe-7jl.pages.dev](https://smol-fe-7jl.pages.dev) | **Docs**: [Information Architecture](docs/INDEX.md)


Smol is a decentralized high-fidelity application powered by **Stellar Smart Contracts** and **Zero-Knowledge Proofs (ZK)**. It combines generative AI music with on-chain verifiable gaming mechanics.

## 🎵 Smol Music: The Core Product
Smol is the premier destination for high-fidelity, AI-generated music on the Stellar network. Developed as an **officially maintained** high-fidelity fork of **[smol.xyz](https://smol.xyz)**, this repository retains all original ecosystem connections while introducing advanced organization, enhanced performance, and new experimental features.

-   🏆 **Kalepail-Approved Builds**: Stable, production-ready releases are deployed to **[noot.smol.xyz](https://noot.smol.xyz)**.
-   🧪 **Experimental Alpha**: The latest cutting-edge updates and "Everything Lab" features are first deployed to the **[Pages Dev Preview](https://smol-fe-7jl.pages.dev)**.
- **Generative AI Audio**: Produce high-fidelity, diverse musical variations at the click of a button.
- **On-Chain Minting**: Seamlessly transform generations into NFTs via our integrated Soroban smart contracts.
- **Social Tipping & Splits**: Support your favorite artists with direct tips in **XLM**, **KALE**, or **USDC**. For on-chain mixtapes, our contract-level splits ensure fair distribution between artists, curators, and minters.
- **Mixtape Builder**: Create and publish on-chain mixtapes to share your curated collections with the community.
- **Radio V2**: Experience a 24/7 stream of the latest and greatest community-minted songs.
- **Passkey Security**: Zero seed phrases. Authenticate and sign transactions securely using device biometrics via **PasskeyKit**.

## 🛡️ The Future: PasskeyKit & Smart Accounts
Smol is built on the belief that Web3 must be invisible to reach the next billion users. We achieve this through a state-of-the-art **Smart Account** architecture.
- **PasskeyKit Smart Wallets**: By leveraging WebAuthn, we've replaced confusing seed phrases with the biometrics users already trust (FaceID, TouchID). Your device *is* your key.
- **Onboarding Billions**: Our architecture removes the "Gas Gap". Users can join and start creating **for free** without ever needing to buy XLM or understand transaction fees.
- **No Trustline Hurdles**: Unlike traditional Stellar accounts, these Smart Wallets can receive any amount of any coin instantly **for free**. No manual trustline setup required for incoming payments—anybody can send assets to a Smol wallet and it just works.
- **Seamless Sending**: When enabled, these smart accounts can send assets out **for free** (via sponsored fee channels). Currently, built-in support is optimized for **XLM**, **KALE**, and **USDC**—adding support for new assets is easy, so reach out and let's talk about expanding the list!
- **Kale Relayer & OpenZeppelin**: We utilize the **Kale Relayer** in tandem with **OpenZeppelin GSN (Gas Station Network)** patterns to sponsor transaction fees. This allows the base product to feel like a high-speed "Web2" app while maintaining "Web3" sovereignty.
- **Programmable Accounts**: Every account is a smart contract, enabling complex features like multi-sig, recovery, and batching that standard accounts cannot touch.

## 🧪 Smol Labs: The Everything Lab
While **Smol** serves as our base product and AI music foundation, **Labs** is our "Everything Lab"—a high-fidelity R&D environment where we showcase the newest and greatest innovations on the **Stellar Network**. It is an active testing ground for:
- **Zero-Knowledge Proofs (ZK)**: On-chain verifiable gaming and privacy-preserving state settlement.
- **AI Music Automation**: Advanced generative audio pipelines and NFT minting experiments.
- **Stellar Innovations**: Soroban session keys, batch transitions, and next-gen smart contract patterns.
- **Personal Tools**: Custom developer utilities and experimental interfaces designed for anyone to play with and extend.

We use Labs to push the boundaries of what is possible on Stellar, transforming experimental ideas into verifiable, state-of-the-art decentralized experiences.

> [!NOTE]
> **Graduation Strategy**: Features and innovations perfected in the Everything Lab may graduate to the main Smol product or continue advancing as specialized tools within the Labs ecosystem.

## 🕹️ ZK Dungeon (Hackathon Mode)
A flagship experiment within the Labs section, participating in the **DoraHacks Stellar Hacks: ZK Gaming** hackathon.
- **Verifiable Strategy**: Uses **Noir**, **RISC0**, and **Circom** to generate zero-knowledge proofs of gameplay, verified on-chain via Stellar.
- **Multiplayer State Channels**: Proxied relay architecture for seamless peer-to-peer gaming.

## 🏗️ Core Technology
- **Framework**: Astro `5.x` + Svelte `5.x` (Runes)
- **Styling**: Tailwind CSS `4.x` (Design-Tokens first)
- **Blockchain**: Stellar/Soroban (Mainnet via PasskeyKit, Testnet via SWK)
- **Cryptography**: Zero-Knowledge Proofs (Noir, RISC0, Circom)
- **Architecture**: Server-side Astro Proxy for bypassing CORS during decentralized relay syncing.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v22+)
- **pnpm** (v10+)
- **Stellar Wallets Kit** / Freighter (for Testnet Labs)

### Installation
1. `git clone <repo>`
2. `pnpm install`
3. `pnpm dev`

### Environment
Copy `.env.example` to `.env`. For Hackathon testing on Testnet, ensure `PUBLIC_NETWORK_PASSPHRASE` is set to the Testnet string.

---

## 🛡️ Repository Governance
This repository follows a **Fail-Closed** documentation policy. All technical facts are governed by the **[STATE OF WORLD](docs/STATE_OF_WORLD.md)**.

- **Human Onboarding**: [START HERE](docs/START_HERE.md)
- **AI Agent Protocol**: [AGENTS.md](docs/AGENTS.md)
- **Verification Suite**: [TESTING.md](docs/TESTING.md)

## 🤝 Contributing
We prioritize **Velocity & Trust**. Please read our **[CONTRIBUTING.md](CONTRIBUTING.md)** and **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** before opening a PR.

## 🔒 Security
Security is paramount, especially regarding ZK G2 point serialization and Passkey signatures. See **[SECURITY.md](SECURITY.md)** for reporting vulnerabilities.

> [!TIP]
> ### ⚡ The Bleeding Edge
> The **[Dev Preview](https://smol-fe-7jl.pages.dev)** is updated in real-time. It is our high-velocity alpha channel where new experiments, ZK circuits, and UI patterns go live the moment they are conceived. Things may break, get better, or evolve dramatically day-by-day. We build in the open, we fix as we go, and we never stop moving. ☄️

*Built on Stellar. Secured by Smart Accounts.*

---

### 🧪 A Note on the Pioneer Spirit
This repository is a living, breathing experiment powered by autonomous AI agents. I (Antigravity) help maintain the docs, references, and logic. Because we build in the open and evolve in real-time, things might look a little different today than they did when they were first conceived. 

We strive for high-fidelity, "unbreakable" builds, but this is **vibe-coding** at the frontier. You might find a few rough edges, some instructions that have drifted, or logic that’s in the middle of a beautiful transformation. Stay graceful, keep it cool, and enjoy the high-velocity journey. If it works, it’s genius—if it doesn’t, it’s just the pioneer spirit at work. ✨
