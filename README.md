# Smol - AI Music Generator Frontend

A decentralized web application for generating AI music powered by Stellar blockchain smart contracts. Users can create songs from text prompts, mint them as NFTs, trade them on an automated market maker (AMM), organize tracks into mixtapes, and manage their music collection.

## Features

### 🎵 Music Generation
- **AI-powered song creation** from text prompts (up to 2,280 characters, or 380 for instrumentals)
- **Dual track generation** - AI creates two versions per prompt, choose your favorite
- **Instrumental mode** - Generate music without lyrics
- **Real-time generation tracking** - Monitor song creation progress (typically ~6 minutes)
- **Public/private songs** - Control visibility of your creations
- **Automatic retry** on failed generations

### 🎨 NFT & Trading
- **Mint songs as NFTs** - Convert your songs into tradeable blockchain assets
- **Built-in AMM trading** - Buy and sell song tokens directly in the app
- **Token balance tracking** - View your holdings for each minted song
- **PasskeyKit wallet integration** - Passwordless authentication using WebAuthn
- **Stellar blockchain** - All transactions on Stellar network using Soroban smart contracts

### 📀 Mixtapes
- **Create mixtapes** - Organize your favorite songs into custom playlists
- **Drag-and-drop builder** - Intuitive interface for arranging tracks
- **Share mixtapes** - Publish your mixtapes for others to discover
- **Browse collections** - Explore mixtapes created by the community

### 👤 Artist Profiles
- **Discography** - View all songs an artist has created/published
- **Minted** - Songs the artist created AND minted on-chain
- **Collection** - Songs the artist minted from other creators
- **Published/Collected badges** - Quick stats on artist activity
- **Genre tags** - Top genres derived from artist's discography

### 🎧 Playback & Discovery
- **Audio player** - Built-in player with progress tracking
- **Like system** - Save your favorite songs
- **Leaderboard** - Discover trending and popular songs
- **Filtered views** - Browse songs you've created or liked
- **Playlist mode** - Generate songs tagged to specific playlists

### 📻 AI Radio 2.0
- **Smart Generation** - Multi-tag fusion with weighted scoring and lyric analysis
- **Adaptive Vibe** - Order-based prioritization (e.g. "Jazz" + "Hip Hop" ≠ "Hip Hop" + "Jazz")
- **Freshness Guarantee** - Deduplication logic ensures fresh tracks every spin
- **Local Fallback** - Robust "fail-fast" local generation when AI is rate-limited

## Tech Stack

### Frontend Framework
- **[Astro 5](https://astro.build/)** - Modern meta-framework for content-focused sites
- **[Svelte 5](https://svelte.dev/)** - Reactive UI components with latest runes API
- **Server-side rendering** - Deployed on Cloudflare Pages

### Styling
- **[Tailwind CSS 4](https://tailwindcss.com/)** - Utility-first CSS via Vite plugin
- **SCSS** - Additional styling capabilities

### Blockchain & Web3
- **[Stellar SDK](https://stellar.github.io/js-stellar-sdk/)** - Interact with Stellar blockchain
- **[PasskeyKit](https://www.npmjs.com/package/passkey-kit)** - WebAuthn-based smart contract wallet
- **[Soroban](https://soroban.stellar.org/)** - Stellar smart contract platform
- **Local contract SDKs** - TypeScript bindings for Smol and Comet smart contracts

### Additional Libraries
- **svelte-dnd-action** - Drag-and-drop for mixtape builder
- **jimp** - Image processing
- **cookie/js-cookie** - Cookie management for authentication
- **tldts** - Domain parsing utilities

## Project Structure

```
smol-fe/
├── src/
│   ├── components/          # Svelte components
│   │   ├── audio/          # Audio player components
│   │   ├── layout/         # Navigation and layout components
│   │   ├── mixtape/        # Mixtape-related components
│   │   │   └── builder/    # Mixtape builder UI
│   │   ├── smol/           # Song card and grid components
│   │   └── ui/             # Reusable UI elements
│   ├── layouts/            # Astro layout templates
│   ├── pages/              # Astro pages (routes)
│   │   ├── mixtapes/       # Mixtape pages
│   │   └── playlist/       # Playlist pages
│   ├── services/           # Business logic and API clients
│   │   └── api/            # API service modules
│   ├── stores/             # Svelte 5 state stores (runes)
│   ├── styles/             # Global styles and Tailwind config
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
│       └── api/            # API utilities
├── ext/                    # External contract SDKs
│   ├── smol-sdk/          # Main Smol contract bindings
│   └── comet-sdk/         # Comet contract bindings
├── public/                # Static assets
└── astro.config.mjs       # Astro configuration
```

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **pnpm** (v10.18.0+) - Required package manager

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
PUBLIC_RPC_URL=                    # Stellar RPC endpoint
PUBLIC_NETWORK_PASSPHRASE=         # Network passphrase (testnet/mainnet)
PUBLIC_WALLET_WASM_HASH=           # PasskeyKit wallet WASM hash
PUBLIC_LAUNCHTUBE_URL=             # LaunchTube service URL
PUBLIC_LAUNCHTUBE_JWT=             # LaunchTube authentication token
PUBLIC_API_URL=                    # Backend API URL
PUBLIC_KALE_SAC_ID=                # KALE token SAC ID
PUBLIC_SMOL_CONTRACT_ID=           # Smol smart contract ID
```

See `.env` for production example values.

### Development

Start the dev server:
```bash
pnpm dev
```

The app runs at `https://app.smol.xyz` (configured in `astro.config.mjs`). You may need to update your hosts file:
```bash
echo "127.0.0.1 app.smol.xyz" | sudo tee -a /etc/hosts
```

### Type Checking

Run Svelte type checking:
```bash
pnpm check          # One-time check
pnpm check:watch    # Watch mode
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
