# ZK Dungeon - DoraHacks Demo Script (120s)

## Overview
- **Target Duration:** EXACTLY 120.000 seconds
- **Focus:** Single-player Hackathon Mode (MVP), ZK mechanic in-browser, Stellar smart contract integration.
- **Tone:** Calm, technical, builder-to-judge.

---

## Shot List & Script

### Block 1: Intro & Context (0:00 - 0:15)
- **Visual:** Browser showing `https://smol-fe-7jl.pages.dev/labs/the-farm`. Cursor navigates to the "ZK Dungeon" section. The URL is clearly visible in the address bar.
- **Audio/Voiceover:** "Welcome to ZK Dungeon, a decentralized rogue-lite experience built for the DoraHacks Stellar ZK Gaming track. This demo showcases our single-player MVP in Hackathon Mode, running entirely on the Stellar Testnet."

### Block 2: Setup & Auth (0:15 - 0:35)
- **Visual:** Cursor clicks "Hackathon Mode" toggle. Click "Play Solo". Freighter wallet popup appears asking to sign/connect. User signs. 
- **Voiceover:** "We begin by connecting our Freighter wallet in testnet mode. In this solo instance, the player goes up against the house. Connecting the wallet initiates our game session and prepares the on-chain state."

### Block 3: The ZK Mechanic (0:35 - 1:05)
- **Visual:** Gameplay interface. Player selects a door. UI shows a "Generating Proof..." loading indicator (simulating or showing the local circuit execution).
- **Voiceover:** "Instead of relying on a centralized server to validate moves, ZK Dungeon targets verifiable zero-knowledge gaming. When a player makes a choice, a zero-knowledge proof is generated locally. This ensures the player's moves are valid without revealing the dungeon's underlying secrets."

### Block 4: On-Chain Verification (1:05 - 1:45)
- **Visual:** The proof generation completes. A Stellar transaction prompt appears in Freighter. User signs the transaction. Briefly flashes the browser network tab or an on-screen receipt showing `start_game` or move submission.
- **Voiceover:** "Once generated, this proof is submitted to the Stellar Testnet. A Stellar smart contract then verifies the proof on-chain. This combination of off-chain ZK execution and on-chain verification guarantees a provably fair game where rules are enforced by the network itself."

### Block 5: Game Completion & Outro (1:45 - 2:00)
- **Visual:** Player reaches the final floor or dies. End screen loads. Another wallet prompt to resolve the `end_game` / stake distribution. Screen fades to the End Card.
- **Voiceover:** "When the run concludes, the `end_game` transaction settles the stakes based on cryptographic proof of completion. True 2-player state channels are in progress based on Game Studio patterns, but the core ZK verification loop works today."
- **Visual (End Card):** 
  - Title: ZK Dungeon
  - Live Demo: https://smol-fe-7jl.pages.dev/labs/the-farm/zkdungeon
  - Quickstart: https://dorahacks.io/hackathon/stellar-hacks-zk-gaming/quickstart-guide
  - Big thanks to: https://github.com/stellar/stellar-dev-skill
  - "Demo Video Required (DoraHacks)"
