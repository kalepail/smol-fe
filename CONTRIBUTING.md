# Contributing to Smol

Welcome! We are building the future of AI music and ZK Gaming on Stellar. ☄️

## 🏛️ SSOT Policy (Single Source of Truth)
This repo uses a **Fail-Closed** documentation policy.
-   The **[STATE OF WORLD](docs/STATE_OF_WORLD.md)** is the absolute law for ports, constants, and active contract IDs.
-   Any PR that introduces a change to core infrastructure MUST update the corresponding documentation in the same commit.

## 🛠️ Tech Stack
-   **Astro 5 + Svelte 5 (Runes)**: Ensure all new state logic uses runes (`$state`, `$derived`).
-   **Tailwind CSS 4**: Use modern design tokens.
-   **Stellar smart contracts**: Bindings are located in `ext/`.

## 🧪 Labs & Experiments
If you're adding a new game, puzzle, or tool to the Labs section:
1.  Follow the **[Labs Standard Architecture](docs/labs-standard-architecture.md)** (Local-first state, batched settlement).
2.  Ensure ZK logic is verifiable via `docs/TESTING.md` protocols.
3.  Register your experiment in `src/components/labs/registry.json`.

## 🚀 Pull Request Process
1.  **Sync First**: Always branch from `main`.
2.  **Verify**: Run `pnpm check` and check `pnpm build` before submission.
3.  **Documentation**: If it's a new feature, a new doc in `docs/` is required and must be linked in `docs/INDEX.md`.

## 🤖 AI Agents
If you are an AI assistant:
-   Read **[AGENTS.md](docs/AGENTS.md)** immediately.
-   Always check **[KNOWLEDGE_ITEMS](docs/KNOWLEDGE_ITEMS.md)** before proposing architectural changes.

Thanks for building with us!
