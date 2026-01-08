import { getDomain } from 'tldts';
import { account, kale, server, sac } from '../utils/passkey-kit';
import { rpc } from '../utils/base';
import { userState } from '../stores/user.svelte';
import type { Smol } from '../types/domain';

const KALE_DECIMALS = 7;
const KALE_FACTOR = 10n ** BigInt(KALE_DECIMALS);

// 1 KALE per track
const PRICE_PER_TRACK_KALE = 1;

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

    // Base split: 50% artists, 30% curator, 20% minters
    const curatorShare = (totalUnits * 30n) / 100n; // 30%
    let artistPoolShare = totalUnits / 2n; // 50%
    let minterPoolShare = (totalUnits * 20n) / 100n; // 20%

    // Get unique artist addresses (excluding curator)
    const artistAddresses = new Set<string>();
    for (const track of tracks) {
        if (track.Address && track.Address !== curatorAddress) {
            artistAddresses.add(track.Address);
        }
    }

    // Get unique minter addresses (from Minted_By field, excluding curator and artists)
    const minterAddresses = new Set<string>();
    for (const track of tracks) {
        if (track.Minted_By &&
            track.Minted_By !== curatorAddress &&
            !artistAddresses.has(track.Minted_By)) {
            minterAddresses.add(track.Minted_By);
        }
    }

    // If no minters, redistribute their share to artists
    if (minterAddresses.size === 0) {
        artistPoolShare += minterPoolShare;
        minterPoolShare = 0n;
    }

    // If curator is the only participant, they get everything
    if (artistAddresses.size === 0 && minterAddresses.size === 0) {
        return {
            totalKale,
            totalUnits,
            curatorShare: totalUnits,
            artistShare: 0n,
            minterShare: 0n,
            recipients: [
                { address: curatorAddress, amount: totalUnits, type: 'curator' }
            ]
        };
    }

    // Calculate per-recipient shares
    const numArtists = artistAddresses.size;
    const numMinters = minterAddresses.size;

    const perArtistShare = numArtists > 0 ? artistPoolShare / BigInt(numArtists) : 0n;
    const perMinterShare = numMinters > 0 ? minterPoolShare / BigInt(numMinters) : 0n;

    // Handle rounding - give remainder to curator
    const distributedToArtists = perArtistShare * BigInt(numArtists);
    const distributedToMinters = perMinterShare * BigInt(numMinters);
    const remainder = totalUnits - curatorShare - distributedToArtists - distributedToMinters;
    const adjustedCuratorShare = curatorShare + remainder;

    // Build recipients list
    const recipients: SupportPaymentRecipient[] = [
        { address: curatorAddress, amount: adjustedCuratorShare, type: 'curator' }
    ];

    for (const artistAddress of artistAddresses) {
        recipients.push({
            address: artistAddress,
            amount: perArtistShare,
            type: 'artist'
        });
    }

    for (const minterAddress of minterAddresses) {
        recipients.push({
            address: minterAddress,
            amount: perMinterShare,
            type: 'minter'
        });
    }

    return {
        totalKale,
        totalUnits,
        curatorShare: adjustedCuratorShare,
        artistShare: distributedToArtists,
        minterShare: distributedToMinters,
        recipients
    };
}

/**
 * Build and send support payment transaction
 * Multi-payment TX: one payment per recipient
 */
export async function sendSupportPayment(
    curatorAddress: string,
    tracks: Smol[],
    onProgress?: (step: string) => void
): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!userState.contractId || !userState.keyId) {
        return { success: false, error: 'Wallet not connected' };
    }

    try {
        onProgress?.('Calculating payment...');
        const breakdown = calculateSupportPayment(curatorAddress, tracks);

        if (breakdown.totalUnits <= 0n) {
            return { success: false, error: 'No payment amount calculated' };
        }

        onProgress?.('Building transaction...');

        // Build multi-transfer transaction
        // We need to send to each recipient individually since kale.transfer only does one
        // For MVP, we'll do sequential transfers (not ideal but works)
        // TODO: Build a single TX with multiple ops using raw TransactionBuilder

        // For now, start with just the curator payment to test the flow
        // Then we'll iterate to add multi-payment

        let tx = await kale.transfer({
            from: userState.contractId,
            to: curatorAddress,
            amount: breakdown.curatorShare,
        });

        onProgress?.('Awaiting signature...');
        const { sequence } = await rpc.getLatestLedger();
        tx = await account.sign(tx, {
            rpId: getDomain(window.location.hostname) ?? undefined,
            keyId: userState.keyId,
            expiration: sequence + 60,
        });

        onProgress?.('Submitting transaction...');
        const result = await server.send(tx);

        // Now send to artists and minters (sequential for MVP)
        const otherRecipients = breakdown.recipients.filter(r => r.type !== 'curator');

        for (let i = 0; i < otherRecipients.length; i++) {
            const recipient = otherRecipients[i];
            const label = recipient.type === 'artist' ? 'artist' : 'minter';
            onProgress?.(`Paying ${label} ${i + 1}/${otherRecipients.length}...`);

            let recipientTx = await kale.transfer({
                from: userState.contractId,
                to: recipient.address,
                amount: recipient.amount,
            });

            const { sequence: recipientSeq } = await rpc.getLatestLedger();
            recipientTx = await account.sign(recipientTx, {
                rpId: getDomain(window.location.hostname) ?? undefined,
                keyId: userState.keyId,
                expiration: recipientSeq + 60,
            });

            await server.send(recipientTx);
        }

        onProgress?.('Complete!');

        return {
            success: true,
            txHash: result?.hash || 'multi-payment'
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
