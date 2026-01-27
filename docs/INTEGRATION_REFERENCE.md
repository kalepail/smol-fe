# 🔗 smol-fe ↔ smol-workflow Integration Reference

Quick reference for working across both repositories together.

## Repositories
| Repo | Purpose | Tech Stack |
|------|---------|------------|
| `tacticalnoot/smol-fe` | **Canonical Frontend** | Svelte 5, Astro, TailwindCSS |
| `kalepail/smol-fe` | Upstream Original | Svelte 5, Astro, TailwindCSS |
| `kalepail/smol-workflow` | Backend API | Hono, Cloudflare Workers, D1, R2, KV |

---

## API Endpoints (smol-workflow)

### Smols
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | Optional | List public smols (paginated) |
| GET | `/:id` | Optional | Get smol details |
| GET | `/created` | Required | User's created smols |
| GET | `/liked` | Required | User's liked smols |
| POST | `/` | Required | Create new smol (triggers AI workflow) |
| PUT | `/:id` | Required | Toggle public/private |
| DELETE | `/:id` | Required | Delete smol |

### Media
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/song/:id.mp3` | Stream audio (supports range requests) |
| GET | `/image/:id.png` | Serve image |
| GET | `/image/:id.png?scale=8` | Serve HD scaled image (uses Jimp NEAREST_NEIGHBOR) |

### Likes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/likes` | Get user's liked IDs |
| PUT | `/likes/:id` | Toggle like |

### Mixtapes
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/mixtapes` | List all mixtapes |
| GET | `/mixtapes/:id` | Get mixtape details |
| POST | `/mixtapes` | Create mixtape |

### Minting
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/mint/:id` | Mint single smol as Stellar token |
| POST | `/mint` | Batch mint |

---

## CORS & Audio

Backend has global CORS configured:
```typescript
cors({
  origin: (origin) => origin ?? '*',
  credentials: true,
})
```

**Frontend can use `crossorigin="anonymous"` on audio elements** - this enables:
- Web Audio API visualizers
- iOS Safari background playback (with proper play guards)

---

## Authentication Flow

1. Frontend uses passkeys via `POST /login`
2. Backend returns Auth Token
3. Frontend sends `Authorization: Bearer <authToken>` on authenticated requests
4. Auth Token payload contains `sub` (Stellar address)

---

## Environment Variables (smol-fe)

| Variable | Purpose |
|----------|---------|
| `PUBLIC_API_URL` | Backend API (e.g., `https://api.smol.xyz`) |
| `PUBLIC_AUDIO_PROXY_URL` | Optional audio proxy for CORS |
| `PUBLIC_RPC_URL` | Stellar RPC endpoint |
| `PUBLIC_NETWORK_PASSPHRASE` | Stellar network |
| `PUBLIC_KALE_SAC_ID` | $KALE token contract |
| `PUBLIC_SMOL_CONTRACT_ID` | SMOL NFT contract |

---

## Key Integration Points

### Image Scaling
- Frontend: `${API_URL}/image/${id}.png?scale=8` for HD
- Backend: Uses Jimp with `NEAREST_NEIGHBOR` to scale pixel art

### Audio Streaming
- Frontend: `<audio crossorigin="anonymous" src="${API_URL}/song/${id}.mp3">`
- Backend: Supports `Range` headers for seeking

### Visualizer
- Requires `crossorigin="anonymous"` on audio element
- Backend CORS allows Web Audio API to analyze audio data

---

## Live Data & Snapshots

The frontend uses a **Hybrid Strategy** for data:
1. **Initial Load**: Uses `GalacticSnapshot.json` (in `public/data/`) for instant rendering and SEO/static generation.
2. **Hydration**: Components (`ArtistResults`, `RadioBuilder`) fetch live data from `PUBLIC_API_URL` to update stats and add new songs.

### Updating the Snapshot
To refresh the static fallback data (recommended before deployments):

1. Ensure the API is accessible (Production `https://api.smol.xyz`).
2. Run the update tool:
   ```bash
   node scripts/universal-snapshot.js
   ```
   *Note: The script defaults to `https://api.smol.xyz`. Edit `API_URL` in the script to target localhost.*

This tool fetches all smols and **merges** them with the existing snapshot, preserving legacy fields (like `Tags` and `Minted_By`) that might be missing from the lightweight API response.

### Data Architecture
- **List Endpoint (`GET /`)**: Optimized for speed, returns lightweight objects (excludes `Address` to save bandwidth).
- **Detail Endpoint (`GET /:id`)**: Returns full object including `Address`, `Lyrics`, etc.
- **Snapshot Script**: Implements a **Hydration Fallback**. If the list endpoint returns items without addresses (e.g. new unminted items), the script automatically iterates through them and fetches the Detail Endpoint for each one to fill in the missing data. This ensures the snapshot is always 100% complete.
