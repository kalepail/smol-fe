<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Lighthouse | State Trace]
-->
# Performance & Optimizations

Low-memory and high-speed strategies governed by **[preferences.svelte.ts](../src/stores/preferences.svelte.ts)**.

---

## 🚀 Fast Mode (`src/stores/preferences.svelte.ts`)
Toggled via Settings (User Preference). Persists to `localStorage`.

### Features Disabled
| Feature | Thinking Mode | Fast Mode | Savings |
|---------|--------------|-----------|---------|
| **Visualizers** | Canvas (60fps) | Static CSS Bars | ~30 MB RAM |
| **Grid Images** | Preload 50+ | Lazy Load | ~100 MB RAM |
| **Particles** | 120+ animated | 60 static | ~20 MB RAM |
| **Rendering** | `requestAnimationFrame` | Zero RAF loops | CPU Idle |

**Implementation Pattern:**
```typescript
const sparkleCount = $derived(preferences.renderMode === 'fast' ? 8 : 20);
$effect(() => { if (preferences.renderMode === 'thinking') startAnimation(); });
```

---

## ⚡ Transaction & Auth Layer

### 1. Circuit Breaker (`passkey-kit.ts`)
Prevents hammering the relayer during outages.
- **Threshold**: 5 failures opens circuit.
- **Timeout**: 30s cooldown.
- **Half-Open**: Allows 1 test request after timeout.

### 2. Transaction Locking (`balance.svelte.ts`)
Prevents race conditions (double-spending).
- `acquireTransactionLock()` / `releaseTransactionLock()` wrappers.
- Skips balance updates if transaction is in-flight.

### 3. Auth Request Caching (`horizon.ts`)
Optimizes Horizon API calls.
- **Cache Key**: `transfers:${address}:${recipient}`.
- **TTL**: 5 minutes.
- **Result**: 50% reduction in auth startup time (1 call vs 2).

### 4. Typed Error System
Standardized errors for AI and User clarity:
- `NETWORK_ERROR` (Retryable)
- `VALIDATION_ERROR` (Fatal)
- `TRANSACTION_ERROR` (Variable)

### 5. RPC Health Monitor (`rpc.ts`)
Auto-failover for Stellar RPCs.
- Tracks latency and error rates.
- Automatically routes traffic to the healthiest endpoint.
