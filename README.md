<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](docs/STATE_OF_WORLD.md)
- AUDIENCE: Dev, User, Agent
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: Claim check, Link check
-->
# Smol - AI Music Generator Frontend
**Production URL**: [noot.smol.xyz](https://noot.smol.xyz) | **Dev Preview**: [smol-fe-7jl.pages.dev](https://smol-fe-7jl.pages.dev) | **Docs**: [Information Architecture](docs/INDEX.md)

A decentralized web application for generating AI music powered by Stellar blockchain smart contracts.

## 🏛️ Repository Governance
This repository follows a "Fail-Closed" documentation policy. All technical facts are governed by the **[STATE OF WORLD](docs/STATE_OF_WORLD.md)**.

## 🚀 Key Documentation Paths
- **Human Devs**: [START HERE](docs/START_HERE.md) → [DEVELOPER SETUP](docs/DEVELOPER_SETUP.md)
- **AI Agents**: [AGENTS.md](docs/AGENTS.md) → [REPO MAP](docs/REPO_MAP.md)
- **Verification**: [TESTING.md](docs/TESTING.md) → `pnpm docs:test`

## 🏗️ Tech Stack
- **Framework**: Astro `5.14.x` + Svelte `5.39.x` (Runes)
- **Styling**: Tailwind CSS `4.1.x`
- **Blockchain**: Stellar/Soroban via `PasskeyKit`
- **Relayer**: OpenZeppelin Channels / KaleFarm Relayer


## Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **pnpm** (v10.18.1+) - Required package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd smol-fe
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:

Create a `.env` file with the following variables:

```bash
# Core Connectivity (1/27/2026)
PUBLIC_RPC_URL="https://rpc.ankr.com/stellar_soroban"
PUBLIC_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
PUBLIC_API_URL="https://api.smol.xyz"

# Identity & Contract IDs
PUBLIC_WALLET_WASM_HASH="ecd990f0b45ca6817149b6175f79b32efb442f35731985a084131e8265c4cd90"
PUBLIC_SMOL_CONTRACT_ID="CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA"
PUBLIC_KALE_SAC_ID="CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
PUBLIC_XLM_SAC_ID="CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA"

# Execution & Services
PUBLIC_RELAYER_URL="https://api.kalefarm.xyz"
PUBLIC_RELAYER_API_KEY=            # Request from admin
PUBLIC_AGGREGATOR_CONTRACT_ID="CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH"
PUBLIC_SOROSWAP_API_KEY=           # Optional: your_soroswap_api_key
```

See `.env` for production example values.

### Development

Start the dev server:
```bash
The dev server runs on `http://localhost:4321`.

### Local Authentication
Passkeys are domain-bound. To test authentication:
- **Default**: Use `http://localhost:4321` for general development.
- **Recommended**: Deploy your fork to **Cloudflare Pages**. This is the easiest way to test Passkeys/Stellar on a `*.pages.dev` domain.
- **Advanced**: For local authentication workflows, see the **[Cookie Transfer](docs/DEVELOPER_SETUP.md#-localhost-authentication-the-cookie-transfer)** method in the developer setup guide.

### Type Checking

Run Svelte type checking:
```bash
pnpm check          # One-time check
pnpm check:watch    # Watch mode
```

### Repo Health
```bash
pnpm doctor         # Check environment sanity (Node, .env, etc.)
pnpm docs:check     # Validate documentation links and coverage
```

### Build

Build for production:
```bash
pnpm build
```

Preview production build:
```bash
pnpm preview
```

## Smart Contract SDKs

The project uses locally linked TypeScript SDKs generated from Soroban smart contracts:

### Smol SDK (`ext/smol-sdk/`)
Main contract for song minting, NFT creation, and AMM trading functionality.

### Comet SDK (`ext/comet-sdk/`)
Supporting contract for additional blockchain operations.

Both SDKs are auto-generated using Soroban CLI:
```bash
soroban contract bindings ts \
  --rpc-url <RPC_URL> \
  --network-passphrase "<PASSPHRASE>" \
  --contract-id <CONTRACT_ID> \
  --output-dir ./ext/<sdk-name>
```

To regenerate bindings after contract updates, see the README in each SDK directory.

## Key Architecture

### Authentication
- **PasskeyKit** manages smart contract wallets using WebAuthn (biometrics/security keys)
- **No seed phrases** - Users authenticate with device biometrics
- Wallet state stored in `userState` (src/stores/user.svelte.ts:5-11)

### State Management
Uses Svelte 5 runes for reactive state:
- **userState** - Authentication and wallet info (src/stores/user.svelte.ts:5-11)
- **audioState** - Music playback state (src/stores/audio.svelte.ts)
- **mixtapeState** - Mixtape builder state (src/stores/mixtape.svelte.ts)
- **balanceStore** - Token balance tracking (src/stores/balance.svelte.ts)

### API Integration
Backend API handles:
- Song generation workflow (POST /api)
- Song metadata and streaming (GET /api/:id)
- Image serving (/api/image/:id.png)
- Audio streaming (/api/song/:id.mp3)
- Mixtape CRUD operations (/api/mixtapes)
- Likes and social features

See `src/services/api/` for service layer implementations.

### Minting Flow
1. User creates and selects best song variant (src/components/Smol.svelte:211-216)
2. Click "Mint" triggers transaction creation (src/utils/mint.ts:24-148)
3. PasskeyKit signs transaction using WebAuthn
4. Transaction submitted to blockchain via backend (src/utils/mint.ts:153-168)
5. Poll for mint completion (AMM and token creation)
6. Trade modal becomes available when minted (src/components/Smol.svelte:174-177)

### Mixtape Builder
- Drag-and-drop interface using svelte-dnd-action (src/components/mixtape/builder/)
- Local draft saved in localStorage (src/services/localStorage.ts)
- Publish converts draft to on-chain mixtape (src/services/api/mixtapes.ts:42-71)

## Pages & Routes

- **/** - Home feed with latest public songs
- **/[id]** - Individual song detail and player
- **/create** - Song generation interface
- **/created** - User's created songs
- **/liked** - User's liked songs
- **/account** - Account management
- **/mixtapes** - Mixtape index
- **/mixtapes/[id]** - Mixtape detail and player
- **/playlist/[id]** - Playlist view

## Development Tips

### Working with Stores
Svelte 5 uses runes instead of traditional stores:
```ts
// Reading reactive state
const { contractId } = $derived(userState);

// Mutating state
userState.contractId = "new-id";
```

### Adding New Components
1. Create `.svelte` file in appropriate `src/components/` subdirectory
2. Use TypeScript with `<script lang="ts">`
3. Import and use in Astro pages with `client:visible` or `client:load`

### Updating Smart Contracts
1. Deploy new contract version
2. Update contract ID in `.env`
3. Regenerate SDK bindings (see SDK READMEs)
4. Update imports and types as needed

## Deployment

The app is configured for Cloudflare Pages deployment:
- Adapter: `@astrojs/cloudflare` (astro.config.mjs:14)
- Output: `server` mode for SSR (astro.config.mjs:12)
- Build command: `pnpm build`
- Output directory: `dist/`
- **Developer Preview**: [smol-fe-7jl.pages.dev](https://smol-fe-7jl.pages.dev)

## Contributing

### Code Style
- TypeScript for all logic
- Svelte 5 runes for reactivity
- Tailwind for styling
- Async/await for promises

### Naming Conventions
- Components: PascalCase (e.g., `SmolCard.svelte`)
- Utilities: camelCase (e.g., `getTokenBalance`)
- Types: PascalCase (e.g., `SmolDetailResponse`)
- Stores: camelCase with "State" suffix (e.g., `userState`)

## License

See LICENSE file for details.

## Support

For issues and feature requests, please open an issue on GitHub.
