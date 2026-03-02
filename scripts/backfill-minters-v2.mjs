#!/usr/bin/env node
/**
 * Backfill Minted_By using Asset Balance Changes
 * 
 * The minting transaction's asset_balance_changes contains:
 * - asset_code: First 12 chars of the Song ID
 * - from: The minter's address (who paid for the mint)
 * 
 * Strategy:
 * 1. Get transactions from legacy relayer's source account
 * 2. For each invoke_host_function operation
 * 3. Check asset_balance_changes for matching song ID prefix
 * 4. Extract the 'from' field as the minter
 * 
 * Usage: node scripts/backfill-minters-v2.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HORIZON_URL = 'https://horizon.stellar.org';
const LEGACY_RELAYER_SOURCE = 'GAALXAZVF6GW764VDOAD336OFCSW3HTQVPXGNAHXPJWWUO4PQ7D6VWBG';
const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');

async function fetchAllTransactions() {
    const allTxs = [];
    let url = `${HORIZON_URL}/accounts/${LEGACY_RELAYER_SOURCE}/transactions?limit=200&order=desc`;

    console.log('Fetching transactions from legacy relayer source...');

    while (url && allTxs.length < 2000) {
        console.log(`  Page... (${allTxs.length} txs so far)`);

        const res = await fetch(url);
        if (!res.ok) break;

        const data = await res.json();
        const records = data._embedded?.records || [];
        allTxs.push(...records);

        if (records.length < 200) break;

        url = data._links?.next?.href;
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Total transactions: ${allTxs.length}`);
    return allTxs;
}

async function processTransaction(tx, songIdPrefixMap) {
    try {
        const opsRes = await fetch(`${HORIZON_URL}/transactions/${tx.hash}/operations`);
        if (!opsRes.ok) return [];

        const opsData = await opsRes.json();
        const ops = opsData._embedded?.records || [];

        const results = [];

        for (const op of ops) {
            if (op.type !== 'invoke_host_function') continue;

            const changes = op.asset_balance_changes || [];

            for (const change of changes) {
                // The asset_code is the first 12 chars of the song ID
                const assetCode = change.asset_code;
                if (!assetCode || assetCode.length !== 12) continue;

                // Check if this matches any of our songs
                const smol = songIdPrefixMap.get(assetCode.toLowerCase());
                if (!smol) continue;

                // The 'from' field is the minter
                const minter = change.from;
                if (!minter) continue;

                // Skip self-minted
                if (minter === smol.Address || minter === smol.Creator) continue;

                results.push({
                    smol,
                    minter,
                    txHash: tx.hash
                });
            }
        }

        return results;
    } catch (e) {
        return [];
    }
}

async function main() {
    console.log('=== Backfill Minters v2 (Asset Balance Changes) ===\n');

    // Load snapshot
    console.log('Loading snapshot...');
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw);
    console.log(`Snapshot has ${snapshot.length} items`);

    // Get minted items and create a map by song ID prefix
    const minted = snapshot.filter(s => s.Mint_Token && !s.Minted_By);
    console.log(`Items needing Minted_By: ${minted.length}`);

    // Create map: first 12 chars of ID (lowercase) -> smol
    const songIdPrefixMap = new Map();
    for (const smol of minted) {
        const prefix = smol.Id.slice(0, 12).toLowerCase();
        songIdPrefixMap.set(prefix, smol);
    }

    // Fetch all transactions
    const transactions = await fetchAllTransactions();

    // Process transactions to find minters
    console.log('\nProcessing transactions for minters...');
    let updated = 0;

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];

        if (i % 20 === 0) {
            process.stdout.write(`\r[${i + 1}/${transactions.length}] Processing...`);
        }

        const results = await processTransaction(tx, songIdPrefixMap);

        for (const result of results) {
            result.smol.Minted_By = result.minter;
            updated++;
            console.log(`\n  ✓ ${result.smol.Title}: Collector ${result.minter.slice(0, 10)}...`);

            // Remove from map so we don't process again
            songIdPrefixMap.delete(result.smol.Id.slice(0, 12).toLowerCase());
        }

        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n\n=== Summary ===`);
    console.log(`Updated with Minted_By: ${updated}`);
    console.log(`Still missing: ${songIdPrefixMap.size}`);

    // Save updated snapshot
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`\nSaved to ${SNAPSHOT_PATH}`);
}

main().catch(console.error);
