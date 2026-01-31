import type { APIRoute } from 'astro';
import { getVIPAccess } from '../../../../utils/vip';
import { StrKey } from '@stellar/stellar-sdk/minimal';
import { findTransfersToRecipient } from '../../../../utils/horizon';

const ADMIN_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
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

    // Validate address format
    const trimmed = address.trim();
    if (!trimmed || !StrKey.isValidContract(trimmed)) {
        return new Response(JSON.stringify({
            error: 'Invalid contract address format',
            premiumHeader: false,
            goldenKale: false,
            showcaseReel: false,
            vibeMatrix: false
        }), {
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

    // Query Horizon for operations using unified utility
    try {
        const result = { premiumHeader: false, goldenKale: false, showcaseReel: false, vibeMatrix: false };

        // Scan for transfers to admin address with specific amounts
        const purchaseAmounts = [
            SMOL_MART_AMOUNTS.PREMIUM_HEADER,
            SMOL_MART_AMOUNTS.GOLDEN_KALE,
            SMOL_MART_AMOUNTS.SHOWCASE_REEL,
            SMOL_MART_AMOUNTS.VIBE_MATRIX
        ];

        const foundTransfers = await findTransfersToRecipient(
            address,
            ADMIN_ADDRESS,
            purchaseAmounts,
            {
                limit: 200,
                maxPages: 1 // Scan last 200 operations
            }
        );

        // Map found transfers to badge ownership
        result.premiumHeader = foundTransfers.get(SMOL_MART_AMOUNTS.PREMIUM_HEADER) || false;
        result.goldenKale = foundTransfers.get(SMOL_MART_AMOUNTS.GOLDEN_KALE) || false;
        result.vibeMatrix = foundTransfers.get(SMOL_MART_AMOUNTS.VIBE_MATRIX) || false;

        // Showcase Reel is the ultimate bundle - if found, grant all badges
        if (foundTransfers.get(SMOL_MART_AMOUNTS.SHOWCASE_REEL)) {
            result.showcaseReel = true;
            result.premiumHeader = true;
            result.goldenKale = true;
            result.vibeMatrix = true;
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
