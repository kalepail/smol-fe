# DoraHacks Submission: ZK Dungeon

**Project Name:** ZK Dungeon  
**Track:** ZK Gaming (Stellar Hacks)  
**Live Demo:** [https://smol-fe-7jl.pages.dev/labs/the-farm/zkdungeon](https://smol-fe-7jl.pages.dev/labs/the-farm/zkdungeon)  

## Elevator Pitch
ZK Dungeon is a decentralized, cryptographically verifiable rogue-lite experience demonstrating the power of zero-knowledge proofs and Stellar smart contracts. Players wager stakes, race through a dungeon, and generate client-side ZK proofs applied directly to the Stellar network.

## The Architecture
Rather than trusting a centralized game server, ZK Dungeon shifts computation to the client and verification to the blockchain. 
- **Off-chain Execution:** Players make moves and generate validity proofs locally.
- **On-chain Verification:** Proofs are submitted individually or batched to a Stellar smart contract, acting as a decentralized referee. This ensures game rules are strictly enforced, players cannot cheat, and dungeon generation seeds remain provably secure.

## Single-Player MVP & Future Roadmap
This prototype targets ZK gaming with a primary focus on the playable loop and the Stellar smart contract lifecycle (`start_game`, `end_game`). Currently, the game features a polished **Single-Player MVP (Hackathon Mode)** where the user plays against the "house."

**Design Note:** A true 2-player competitive mode is actively in progress. It utilizes standard Stellar-Game-Studio service patterns (similar to our proxy architecture) to connect users via serverless state channels before settling the finalized proof on-chain.

## Built With
- **Frontend:** Astro, Svelte, TypeScript, Cloudflare Pages
- **Blockchain:** Stellar Testnet, Stellar Smart Contracts (Soroban primitives)
- **Wallets:** Freighter (via Stellar Wallets Kit)
- **References:** Inspired by the [Stellar Game Studio Quickstart](https://dorahacks.io/hackathon/stellar-hacks-zk-gaming/quickstart-guide) and integrated using guidance from the [Stellar Dev Skills toolkit](https://github.com/stellar/stellar-dev-skill).
