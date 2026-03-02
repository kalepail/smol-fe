# Stellar Development Skill for Claude Code

A comprehensive Claude Code skill for modern Stellar development (January 2026 best practices).

Inspired by [solana-dev-skill](https://github.com/solana-foundation/solana-dev-skill).

> [!NOTE]
> This skill was AI-generated using [Claude Code](https://claude.ai/code) and is currently under manual review. We welcome contributions! Please submit PRs, open issues, or provide feedback to help improve this resource for the Stellar ecosystem.

## Overview

This skill provides Claude Code with deep knowledge of the current Stellar development ecosystem:

- **Smart Contracts**: Soroban (Rust SDK, WebAssembly)
- **Client SDKs**: stellar-sdk (JavaScript), Python, Go, Rust
- **APIs**: Stellar RPC (preferred), Horizon (legacy)
- **Assets**: Stellar Assets, Stellar Asset Contract (SAC)
- **Wallets**: Freighter, Stellar Wallets Kit, Smart Accounts (passkeys)
- **Testing**: Local Quickstart, Testnet, Unit tests
- **Security**: Soroban-specific patterns, audit checklists
- **Ecosystem**: DeFi protocols, developer tools, community projects

## Installation

### Quick Install

```bash
# Clone and install
git clone https://github.com/kalepail/stellar-dev-skill
cd stellar-dev-skill
./install.sh
```

### Manual Install

```bash
# Copy skill files to Claude Code skills directory
mkdir -p ~/.claude/skills/stellar-dev
cp -r skill/* ~/.claude/skills/stellar-dev/
```

### Project-Specific Install

```bash
# Install for current project only
./install.sh --project
```

## Skill Structure

```
skill/
├── SKILL.md                    # Main skill definition (required)
├── contracts-soroban.md        # Soroban smart contract development
├── frontend-stellar-sdk.md     # Frontend integration patterns
├── testing.md                  # Testing strategies
├── stellar-assets.md           # Asset issuance and management
├── api-rpc-horizon.md          # API access (RPC/Horizon)
├── security.md                 # Security checklist
├── common-pitfalls.md          # Common issues and solutions
├── ecosystem.md                # DeFi protocols, wallets, tools, projects
└── resources.md                # Curated reference links
```

## Usage

Once installed, Claude Code will automatically use this skill when you ask about:

- Soroban smart contract development
- Stellar dApp frontend work
- Wallet connection and signing flows
- Transaction building and submission
- Stellar Asset issuance and trustlines
- Local testing and deployment
- Security best practices

### Example Prompts

```
"Help me write a Soroban smart contract for a token"
"Set up a Next.js app with Freighter wallet connection"
"How do I deploy a contract to Stellar Testnet?"
"Create unit tests for my Soroban contract"
"What's the difference between Stellar Assets and Soroban tokens?"
"Review this contract for security issues"
"How do I query contract state using the RPC?"
```

## Stack Decisions

This skill encodes opinionated best practices:

| Layer | Default Choice | Alternative |
|-------|---------------|-------------|
| Smart Contracts | Soroban (Rust) | - |
| Client SDK | stellar-sdk (JS) | Python, Go, Rust SDKs |
| API | Stellar RPC | Horizon (legacy) |
| Tokens | Stellar Assets + SAC | Soroban custom tokens |
| Wallet | Freighter | Stellar Wallets Kit |
| Smart Accounts | Smart Account Kit | Passkey Kit (legacy) |
| Local Testing | Quickstart Docker | Testnet |
| Contract Libraries | OpenZeppelin Stellar | Custom |

## Content Sources

This skill incorporates best practices from:

- [Stellar Developer Documentation](https://developers.stellar.org/docs)
- [Soroban SDK](https://github.com/stellar/rs-soroban-sdk)
- [Stellar SDK (JavaScript)](https://github.com/stellar/js-stellar-sdk)
- [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)
- [Stellar Protocol](https://github.com/stellar/stellar-protocol)
- [CoinFabrik Scout](https://github.com/CoinFabrik/scout-soroban) - Security patterns

## Key Stellar Concepts

### Soroban vs Classic Stellar
- **Classic Stellar**: Built-in operations (payments, trustlines, offers)
- **Soroban**: Programmable smart contracts (Rust → WebAssembly)
- **SAC**: Bridge allowing Soroban contracts to interact with Stellar Assets

### API Migration (Horizon → RPC)
- **Stellar RPC**: Preferred for new projects, Soroban-focused
- **Horizon**: Deprecated but maintained, full historical data
- **Note**: RPC only stores 7 days of history

### Storage in Soroban
- **Instance**: Shared config, tied to contract lifetime
- **Persistent**: User data, survives archival
- **Temporary**: Caches, cheapest, auto-deleted

## Progressive Disclosure

The skill uses Claude Code's progressive disclosure pattern. The main `SKILL.md` provides core guidance, and Claude reads the specialized markdown files only when needed for specific tasks.

## Contributing

Contributions are welcome! Please ensure any updates reflect current Stellar ecosystem best practices.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Guidelines
- Keep information current (check stellar.org/developers for updates)
- Focus on practical, actionable guidance
- Include code examples where helpful
- Cite official documentation when possible

## Resources

- [Stellar Developers](https://developers.stellar.org)
- [Stellar Discord](https://discord.gg/stellar)
- [Stellar Stack Exchange](https://stellar.stackexchange.com)
- [SDF Blog](https://stellar.org/blog)

## License

MIT License - see [LICENSE](LICENSE) for details.
