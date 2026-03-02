#!/usr/bin/env node
/**
 * Horizon Minter Cache Builder
 * 
 * This script fetches mint operations from Stellar Horizon to determine
 * who minted each SMOL song, then enriches the snapshot with Minted_By.
 * 
 * Based on SMOL_ECOSYSTEM_CACHE.md documentation:
 * - SMOL Issuer: GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL
 * - Parse asset_balance_changes where type: "mint"
 * - asset_code = First 12 chars of song ID
 * - to = Minter's address
 * 
 * Usage: node scripts/build-minter-cache.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SMOL_ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
const HORIZON_URL = 'https://horizon.stellar.org';
const SNAPSHOT_PATH = path.join(__dirname, '../public/data/GalacticSnapshot.json');
const CACHE_PATH = path.join(__dirname, '../public/data/minter-cache.json');

/**
 * Fetch all operations for the SMOL issuer account from Horizon
 * Uses pagination to get all results
 */
async function fetchAllOperations() {
    const allOperations = [];
    let url = `${HORIZON_URL}/accounts/${SMOL_ISSUER}/operations?limit=200&order=desc`;

    console.log('Fetching operations from Horizon...');

    while (url) {
        console.log(`  Fetching page... (${allOperations.length} operations so far)`);

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Horizon request failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        const records = data?._embedded?.records || [];
        allOperations.push(...records);

        // Check for next page
        const nextLink = data?._links?.next?.href;
        if (nextLink && records.length > 0) {
            url = nextLink;
        } else {
            url = null;
        }

        // Be polite to Horizon
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Total operations fetched: ${allOperations.length}`);
    return allOperations;
}

/**
 * Build minter cache from Horizon operations
 * Returns Map<asset_code, minter_address>
 */
function buildMinterCache(operations) {
    const cache = new Map();

    for (const op of operations) {
        // Check for change_trust operations that create trustlines
        // These indicate who "minted" (bought/received) the token
        if (op.type === 'change_trust' && op.asset_issuer === SMOL_ISSUER) {
            const assetCode = op.asset_code;
            const minter = op.source_account || op.trustor;
            if (assetCode && minter && !cache.has(assetCode)) {
                cache.set(assetCode, minter);
            }
        }

        // Also check for payment operations where someone receives SMOL tokens
        if (op.type === 'payment' && op.asset_issuer === SMOL_ISSUER) {
            const assetCode = op.asset_code;
            const minter = op.to;
            if (assetCode && minter && !cache.has(assetCode)) {
                cache.set(assetCode, minter);
            }
        }

        // Check for claimable_balance_claim (another way tokens can be received)
        if (op.type === 'claim_claimable_balance') {
            const assetCode = op.asset?.split(':')[0];
            const minter = op.source_account;
            if (assetCode && minter && op.asset?.includes(SMOL_ISSUER) && !cache.has(assetCode)) {
                cache.set(assetCode, minter);
            }
        }
    }

    console.log(`Minter cache built: ${cache.size} entries`);
    return cache;
}

/**
 * Enrich snapshot with Minted_By from cache
 */
async function enrichSnapshot(minterCache) {
    console.log('Loading snapshot...');
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    let snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot) && snapshot.songs) {
        snapshot = snapshot.songs;
    }

    console.log(`Snapshot has ${snapshot.length} items`);

    let enriched = 0;
    let selfMinted = 0;

    for (const smol of snapshot) {
        if (!smol.Id) continue;

        // Try different asset_code formats
        // The asset_code is typically derived from the song ID
        const assetCode12 = smol.Id.slice(0, 12).toUpperCase();
        const assetCode = smol.Mint_Token?.split(':')[0] || assetCode12;

        // Look up in cache
        let minter = minterCache.get(assetCode) || minterCache.get(assetCode12);

        // Also try if we have Mint_Token, extract the asset code from it
        if (!minter && smol.Mint_Token) {
            // Mint_Token might be a contract address - check if any cache entry matches
            for (const [code, addr] of minterCache) {
                if (smol.Mint_Token.includes(code)) {
                    minter = addr;
                    break;
                }
            }
        }

        if (minter) {
            // Only set Minted_By if minter is different from creator
            const creator = smol.Address || smol.Creator;
            if (minter !== creator) {
                smol.Minted_By = minter;
                enriched++;
            } else {
                selfMinted++;
            }
        }
    }

    console.log(`Enriched ${enriched} items with Minted_By`);
    console.log(`Self-minted (skipped): ${selfMinted}`);

    // Save updated snapshot
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`Saved enriched snapshot to ${SNAPSHOT_PATH}`);

    // Also save the cache for future use
    const cacheObject = Object.fromEntries(minterCache);
    await fs.writeFile(CACHE_PATH, JSON.stringify(cacheObject, null, 2));
    console.log(`Saved minter cache to ${CACHE_PATH}`);

    return { enriched, selfMinted, total: snapshot.length };
}

async function main() {
    console.log('=== Horizon Minter Cache Builder ===\n');

    try {
        // Fetch operations from Horizon
        const operations = await fetchAllOperations();

        // Build minter cache
        const minterCache = buildMinterCache(operations);

        // Enrich snapshot
        const stats = await enrichSnapshot(minterCache);

        console.log('\n=== Summary ===');
        console.log(`Total snapshot items: ${stats.total}`);
        console.log(`Collected (Minted_By set): ${stats.enriched}`);
        console.log(`Self-minted (not collected): ${stats.selfMinted}`);
        console.log('\nDone! Restart dev server to see Collected tab changes.');

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main();
