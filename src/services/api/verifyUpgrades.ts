
import { StrKey } from '@stellar/stellar-sdk/minimal';
import { unlockUpgrade } from '../../stores/upgrades.svelte.ts';
import { getVIPAccess } from '../../utils/vip';
import { findTokenTransfers } from '../../utils/event-scanner';

const ADMIN_ADDRESS = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
const SMOL_MART_AMOUNTS = {
    PREMIUM_HEADER: 100000,
    GOLDEN_KALE: 69420.67,
    SHOWCASE_REEL: 1000000,
    VIBE_MATRIX: 250000
};

/**
 * Scan account history to see if they already paid for upgrades.
 * This effectively "Restores Purchases" from the blockchain.
 */
export async function verifyPastPurchases(userAddress: string): Promise<void> {
    // Validate address is not empty or null
    if (!userAddress) return;

    // Validate address is a properly formatted Stellar contract address
    const trimmedAddress = userAddress.trim();
    if (!trimmedAddress) {
        console.warn('[SmolMart] Empty address provided to verifyPastPurchases');
        return;
    }

    // Validate it's a valid contract address (starts with C and proper format)
    if (!StrKey.isValidContract(trimmedAddress)) {
        console.warn('[SmolMart] Invalid contract address format:', trimmedAddress);
        return;
    }

    // VIP check - instant unlock for whitelisted addresses (granular)
    const vipAccess = getVIPAccess(trimmedAddress);
    if (vipAccess) {
        if (vipAccess.premiumHeader) unlockUpgrade('premiumHeader');
        if (vipAccess.goldenKale) unlockUpgrade('goldenKale');
        if (vipAccess.showcaseReel) unlockUpgrade('showcaseReel');
        if (vipAccess.vibeMatrix) unlockUpgrade('vibeMatrix');
        return;
    }

    try {
        const kaleContractId = import.meta.env.PUBLIC_KALE_SAC_ID;
        if (!kaleContractId) {
            console.error('[SmolMart] Missing PUBLIC_KALE_SAC_ID');
            return;
        }

        // Use RPC Events to find transfers (works for both Smart Wallets and G-accounts)
        const foundTransfers = await findTokenTransfers(
            trimmedAddress,
            ADMIN_ADDRESS,
            kaleContractId,
            {
                limit: 100 // Check last 100 transfer events between these addresses
            }
        );

        // Check if any transfer matches our target amounts
        for (const transfer of foundTransfers) {
            // Check for tolerance (e.g. 0.0000001 difference)
            const amount = transfer.amount;

            if (isApproximateMatch(amount, SMOL_MART_AMOUNTS.PREMIUM_HEADER)) {
                unlockUpgrade('premiumHeader');
                console.log('[SmolMart] Unlocked Premium Header');
            }

            if (isApproximateMatch(amount, SMOL_MART_AMOUNTS.GOLDEN_KALE)) {
                unlockUpgrade('goldenKale');
                console.log('[SmolMart] Unlocked Golden Kale');
            }

            if (isApproximateMatch(amount, SMOL_MART_AMOUNTS.SHOWCASE_REEL)) {
                unlockUpgrade('showcaseReel');
                // Bundle unlock
                unlockUpgrade('premiumHeader');
                unlockUpgrade('goldenKale');
                unlockUpgrade('vibeMatrix');
                console.log('[SmolMart] Unlocked Showcase Reel Bundle');
            }

            if (isApproximateMatch(amount, SMOL_MART_AMOUNTS.VIBE_MATRIX)) {
                unlockUpgrade('vibeMatrix');
                console.log('[SmolMart] Unlocked Vibe Matrix');
            }
        }

    } catch (err) {
        console.error('[SmolMart] Verification failed', err);
    }
}

function isApproximateMatch(val1: number, val2: number, tolerance = 0.1): boolean {
    return Math.abs(val1 - val2) < tolerance;
}
