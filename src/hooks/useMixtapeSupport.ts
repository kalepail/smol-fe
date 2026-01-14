import { getDomain } from 'tldts';
import { account, kale, send, sac } from '../utils/passkey-kit';
import { getLatestSequence, truncate } from '../utils/base';
import { userState } from '../stores/user.svelte';
import type { Smol } from '../types/domain';

const KALE_DECIMALS = 7;
const KALE_FACTOR = 10n ** BigInt(KALE_DECIMALS);

// 100 KALE per track
const PRICE_PER_TRACK_KALE = 100;

export interface SupportPaymentRecipient {
    address: string;
    amount: bigint;
    type: 'curator' | 'artist' | 'minter';
}

export interface SupportPaymentBreakdown {
    totalKale: number;
    totalUnits: bigint;
    curatorShare: bigint;
    artistShare: bigint;
    minterShare: bigint;
    curatorPercent: number;
    artistPercent: number;
    minterPercent: number;
    recipients: SupportPaymentRecipient[];
}

/**
 * Calculate payment breakdown for supporting a mixtape
 * Split: 50% artists (evenly), 30% curator, 20% minters (evenly among unique minters)
 * If no minters, their 20% goes to artists (70% total to artists)
 */
export function calculateSupportPayment(
    curatorAddress: string,
    tracks: Smol[]
): SupportPaymentBreakdown {
    const numTracks = tracks.length;
    const totalKale = numTracks * PRICE_PER_TRACK_KALE;
    const totalUnits = BigInt(totalKale) * KALE_FACTOR;

    if (numTracks === 0) {
        return {
            totalKale: 0,
            totalUnits: 0n,
            curatorShare: 0n,
            artistShare: 0n,
            minterShare: 0n,
            curatorPercent: 0,
            artistPercent: 0,
            minterPercent: 0,
            recipients: []
        };
    }

    // Base split weights: 30% curator, 50% artists, 20% minters
    const curatorShare = (totalUnits * 30n) / 100n;
    let artistPoolShare = (totalUnits * 50n) / 100n;
    let minterPoolShare = (totalUnits * 20n) / 100n;

    // Identify unique participants
    const artistAddresses = new Set<string>();
    const minterAddresses = new Set<string>();

    for (const track of tracks) {
        if (track.Address) artistAddresses.add(track.Address);
        // Fallback: if minted but no Minted_By, assume Artist still owns it
        if (track.Mint_Token) {
            const minter = track.Minted_By || track.Address;
            if (minter) minterAddresses.add(minter);
        }
    }

    let curatorPercent = 30;
    let artistPercent = 50;
    let minterPercent = 20;

    // If no minters, redistribute their share to artists
    if (minterAddresses.size === 0) {
        artistPoolShare += minterPoolShare;
        minterPoolShare = 0n;
        artistPercent += minterPercent;
        minterPercent = 0;
    }

    // calculate per-recipient shares
    const perArtistShare = artistAddresses.size > 0 ? artistPoolShare / BigInt(artistAddresses.size) : 0n;
    const perMinterShare = minterAddresses.size > 0 ? minterPoolShare / BigInt(minterAddresses.size) : 0n;

    // Handle rounding - give remainder to curator
    const distributedToArtists = perArtistShare * BigInt(artistAddresses.size);
    const distributedToMinters = perMinterShare * BigInt(minterAddresses.size);
    const remainder = totalUnits - curatorShare - distributedToArtists - distributedToMinters;
    const adjustedCuratorShare = curatorShare + remainder;

    // Build unique recipients list for UI breakdown
    const recipients: SupportPaymentRecipient[] = [
        { address: curatorAddress, amount: adjustedCuratorShare, type: 'curator' }
    ];

    for (const addr of artistAddresses) {
        recipients.push({ address: addr, amount: perArtistShare, type: 'artist' });
    }

    for (const addr of minterAddresses) {
        recipients.push({ address: addr, amount: perMinterShare, type: 'minter' });
    }

    return {
        totalKale,
        totalUnits,
        curatorShare: adjustedCuratorShare,
        artistShare: distributedToArtists,
        minterShare: distributedToMinters,
        curatorPercent,
        artistPercent,
        minterPercent,
        recipients
    };
}

/**
 * Build and send support payment transaction
 * Multi-payment TX: one payment per recipient
 */
turnstileToken: string,
    onProgress ?: (step: string) => void,
    getFreshToken ?: () => Promise<string>
): Promise < { success: boolean; txHash?: string; error?: string } > {
    if(!userState.contractId || !userState.keyId) {
    return { success: false, error: 'Wallet not connected' };
}

try {
    onProgress?.('Calculating payment...');
    const breakdown = calculateSupportPayment(curatorAddress, tracks);

    if (breakdown.totalUnits <= 0n) {
        return { success: false, error: 'No payment amount calculated' };
    }

    onProgress?.('Building transaction...');

    // Aggregate payments by address to avoid redundant ops
    const aggregated = new Map<string, bigint>();
    for (const r of breakdown.recipients) {
        if (r.amount > 0n) {
            aggregated.set(r.address, (aggregated.get(r.address) || 0n) + r.amount);
        }
    }

    // Send transfers sequentially (sub-optimal but valid API)
    let lastTxHash = 'multi-payment';
    const recipients = Array.from(aggregated);

    for (let i = 0; i < recipients.length; i++) {
        const [address, amount] = recipients[i];
        let currentToken = turnstileToken;

        if (i > 0 && getFreshToken) {
            onProgress?.('Verifying...');
            try {
                currentToken = await getFreshToken();
            } catch (e) {
                throw new Error('Verification failed for payment ' + (i + 1));
            }
        }

        onProgress?.(`Transferring to ${truncate(address, 4)}...`);
        let tx = await kale.get().transfer({
            from: userState.contractId,
            to: address,
            amount,
        });

        onProgress?.(`Awaiting signature for ${truncate(address, 4)}...`);
        const sequence = await getLatestSequence();
        tx = await account.get().sign(tx, {
            rpId: getDomain(window.location.hostname) ?? undefined,
            keyId: userState.keyId,
            expiration: sequence + 60,
        });

        onProgress?.(`Submitting transfer to ${truncate(address, 4)}...`);

        const result = await send(tx, currentToken);
        if (result?.hash) lastTxHash = result.hash;
    }

    onProgress?.('Complete!');

    return {
        success: true,
        txHash: lastTxHash
    };

} catch (error) {
    console.error('Support payment failed:', error);
    const message = error instanceof Error ? error.message : String(error);

    // Check for user cancellation
    if (
        message.toLowerCase().includes('abort') ||
        message.toLowerCase().includes('cancel') ||
        message.toLowerCase().includes('not allowed')
    ) {
        return { success: false, error: 'Payment cancelled' };
    }

    return { success: false, error: message };
}
}

/**
 * Format KALE amount for display
 */
export function formatKaleAmount(units: bigint): string {
    const whole = units / KALE_FACTOR;
    const fraction = units % KALE_FACTOR;

    if (fraction === 0n) {
        return whole.toString();
    }

    // Show up to 2 decimal places
    const fractionStr = fraction.toString().padStart(KALE_DECIMALS, '0').slice(0, 2);
    return `${whole}.${fractionStr}`;
}
