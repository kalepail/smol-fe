import type { APIRoute } from 'astro';
import { getVIPAccess } from '../../../../utils/vip';

const ADMIN_ADDRESS = "CBS5Z6IVHGLFUGLYJ6TA4URP4VD67QRXKJ4ZBRH63RBMQ5PO7TC6GJU5";
const KALE_ISSUER = "GAKDNXUGEIRGESAXOPUHU7YNQNQN4RVD7ZS665HXBQJ4CEJJAXIUWE"; // Official KALE token issuer
const SMOL_MART_AMOUNTS = {
    PREMIUM_HEADER: 100000,
    GOLDEN_KALE: 69420.67,
    SHOWCASE_REEL: 1000000,
    VIBE_MATRIX: 250000
};

/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║              SMOL MART BADGE VERIFICATION API                      ║
 * ║                                                                    ║
 * ║  This API verifies SMOL MART upgrade ownership for any address.   ║
 * ║                                                                    ║
 * ║  HOW IT WORKS:                                                     ║
 * ║  1. Checks VIP_CONFIG via getVIPAccess (granular manual grants)    ║
 * ║  2. If not a VIP → queries Horizon for KALE payments              ║
 * ║  3. Returns { premiumHeader: bool, goldenKale: bool, showcaseReel: bool, vibeMatrix: bool } ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

// Simple in-memory cache (5 minute TTL)
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const GET: APIRoute = async ({ params }) => {
    const address = params.address;

    if (!address) {
        return new Response(JSON.stringify({ error: 'Address required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Check cache first
    const cached = cache.get(address);
    if (cached && cached.expires > Date.now()) {
        return new Response(JSON.stringify(cached.data), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Admin/VIP grant check (granular approval)
    const vipAccess = getVIPAccess(address);
    if (vipAccess) {
        cache.set(address, { data: vipAccess, expires: Date.now() + CACHE_TTL });
        return new Response(JSON.stringify(vipAccess), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Query Horizon for operations
    try {
        const result = { premiumHeader: false, goldenKale: false, showcaseReel: false, vibeMatrix: false };
        const limit = 200;
        const url = `https://horizon.stellar.org/accounts/${address}/operations?limit=${limit}&order=desc&include_failed=false`;

        const res = await fetch(url);
        if (!res.ok) {
            // Account might not exist or have no operations
            cache.set(address, { data: result, expires: Date.now() + CACHE_TTL });
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await res.json();
        const operations = data._embedded?.records || [];

        // Look for invoke_host_function operations
        for (const op of operations) {
            if (op.type !== 'invoke_host_function') continue;

            // Check if this is a transfer to admin with matching amounts
            // Parse the parameters if available
            if (op.parameters) {
                try {
                    const params = op.parameters;
                    // Look for transfer function calls
                    for (const param of params) {
                        if (param.type === 'Sym' && param.value === 'transfer') {
                            // Found a transfer, check other params for amount and recipient
                            // This is a simplified check - full XDR parsing is complex
                        }
                    }
                } catch (e) {
                    // ignore parse errors
                }
            }

            // Alternative: Check asset_balance_changes for KALE transfers to admin
            if (op.asset_balance_changes) {
                for (const change of op.asset_balance_changes) {
                    if (change.to === ADMIN_ADDRESS &&
                        change.asset_code === 'KALE' &&
                        change.asset_issuer === KALE_ISSUER) {
                        const amount = parseFloat(change.amount);
                        if (Math.abs(amount - SMOL_MART_AMOUNTS.PREMIUM_HEADER) < 0.1) {
                            result.premiumHeader = true;
                        }
                        if (Math.abs(amount - SMOL_MART_AMOUNTS.GOLDEN_KALE) < 0.1) {
                            result.goldenKale = true;
                        }
                        if (Math.abs(amount - SMOL_MART_AMOUNTS.SHOWCASE_REEL) < 0.1) {
                            result.showcaseReel = true;
                            result.premiumHeader = true; // Included in 1M bundle
                            result.goldenKale = true;   // Included in 1M bundle
                            result.vibeMatrix = true;     // Included in 1M bundle
                        }
                        if (Math.abs(amount - SMOL_MART_AMOUNTS.VIBE_MATRIX) < 0.1) {
                            result.vibeMatrix = true;
                        }
                    }
                }
            }
        }

        // Fetch user preferences to see if they've disabled any badges
        const prefs = await fetchUserPrefs(address);

        // Apply preferences filter (only show if owned AND enabled)
        const finalResult = {
            premiumHeader: result.premiumHeader && prefs.premiumHeaderEnabled,
            goldenKale: result.goldenKale && prefs.goldenKaleEnabled,
            showcaseReel: result.showcaseReel && prefs.showcaseReelEnabled,
            vibeMatrix: result.vibeMatrix && prefs.vibeMatrixEnabled
        };

        cache.set(address, { data: finalResult, expires: Date.now() + CACHE_TTL });
        return new Response(JSON.stringify(finalResult), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('[BadgeAPI] Verification failed', err);
        return new Response(JSON.stringify({ premiumHeader: false, goldenKale: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// Fetch user preferences from smol-workflow API
async function fetchUserPrefs(address: string): Promise<{
    premiumHeaderEnabled: boolean;
    goldenKaleEnabled: boolean;
    showcaseReelEnabled: boolean;
    vibeMatrixEnabled: boolean;
}> {
    try {
        const res = await fetch(`${import.meta.env.PUBLIC_API_URL}/prefs/${address}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        // Ignore errors, default to enabled
    }
    return { premiumHeaderEnabled: true, goldenKaleEnabled: true, showcaseReelEnabled: true, vibeMatrixEnabled: true };
}
