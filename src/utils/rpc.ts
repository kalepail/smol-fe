/**
 * RPC Endpoint Management with Health Checking
 *
 * Provides intelligent RPC endpoint selection with health monitoring
 * and automatic failover to backup endpoints.
 */

export const RPC_OPTIONS = [
    import.meta.env.PUBLIC_RPC_URL,  // Defaults to Ankr from wrangler.toml
    "https://soroban-rpc.mainnet.stellar.org",  // Official Stellar RPC
    "https://stellar-mainnet.publicnode.com"  // PublicNode fallback
].filter(Boolean) as string[];

interface RpcHealthStatus {
    url: string;
    healthy: boolean;
    lastChecked: number;
    consecutiveFailures: number;
    averageLatency: number;
}

const rpcHealthMap = new Map<string, RpcHealthStatus>();
const HEALTH_CHECK_TIMEOUT = 5000; // 5s timeout for health checks
const HEALTH_CHECK_INTERVAL = 60000; // Re-check unhealthy endpoints every 60s
const MAX_CONSECUTIVE_FAILURES = 3; // Mark unhealthy after 3 failures

// Initialize health status for all RPC endpoints
RPC_OPTIONS.forEach(url => {
    rpcHealthMap.set(url, {
        url,
        healthy: true, // Assume healthy initially
        lastChecked: 0,
        consecutiveFailures: 0,
        averageLatency: 0,
    });
});

/**
 * Check health of a single RPC endpoint
 */
async function checkRpcHealth(url: string): Promise<boolean> {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getHealth',
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;

        if (response.ok) {
            const status = rpcHealthMap.get(url);
            if (status) {
                status.healthy = true;
                status.lastChecked = Date.now();
                status.consecutiveFailures = 0;
                status.averageLatency = status.averageLatency === 0
                    ? latency
                    : (status.averageLatency * 0.7 + latency * 0.3); // Exponential moving average
            }
            return true;
        }

        return false;
    } catch (error) {
        console.warn(`[RPC Health] ${url} failed health check:`, error);
        return false;
    }
}

/**
 * Record RPC failure
 */
export function recordRpcFailure(url: string): void {
    const status = rpcHealthMap.get(url);
    if (status) {
        status.consecutiveFailures++;
        if (status.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            status.healthy = false;
            console.warn(`[RPC Health] Marking ${url} as unhealthy after ${status.consecutiveFailures} failures`);
        }
    }
}

/**
 * Record RPC success
 */
export function recordRpcSuccess(url: string, latency?: number): void {
    const status = rpcHealthMap.get(url);
    if (status) {
        status.healthy = true;
        status.consecutiveFailures = 0;
        status.lastChecked = Date.now();
        if (latency !== undefined) {
            status.averageLatency = status.averageLatency === 0
                ? latency
                : (status.averageLatency * 0.7 + latency * 0.3);
        }
    }
}

/**
 * Get the best available RPC endpoint
 * Prefers healthy endpoints with lowest latency
 */
export function getBestRpcUrl(): string {
    const now = Date.now();

    // Filter to healthy endpoints or those due for re-check
    const available = Array.from(rpcHealthMap.values()).filter(status => {
        return status.healthy || (now - status.lastChecked) > HEALTH_CHECK_INTERVAL;
    });

    if (available.length === 0) {
        // All endpoints unhealthy, return primary anyway
        console.warn('[RPC Health] All endpoints unhealthy, using primary');
        return RPC_OPTIONS[0];
    }

    // Sort by health status (healthy first) then by latency (lowest first)
    available.sort((a, b) => {
        if (a.healthy !== b.healthy) {
            return a.healthy ? -1 : 1;
        }
        return a.averageLatency - b.averageLatency;
    });

    const best = available[0];
    console.log(`[RPC Health] Selected ${best.url} (latency: ${best.averageLatency.toFixed(0)}ms)`);
    return best.url;
}

/**
 * Get health status for all endpoints (for debugging)
 */
export function getRpcHealthStatus(): RpcHealthStatus[] {
    return Array.from(rpcHealthMap.values());
}

// Export primary RPC URL (will be used for PasskeyKit initialization)
export const RPC_URL = RPC_OPTIONS[0];

// Export dynamic RPC URL getter for operations that can failover
export const getRpcUrl = getBestRpcUrl;

export default RPC_URL;
