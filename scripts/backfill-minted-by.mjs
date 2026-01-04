#!/usr/bin/env node
/**
 * Backfill Minted_By from Mint Transactions
 * 
 * For each minted song, find its mint transaction and extract the minter
 * from param 2 of the invoke_host_function operation.
 * 
 * Usage: node scripts/backfill-minted-by.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { xdr, scValToNative } from '@stellar/stellar-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HORIZON_URL = 'https://horizon.stellar.org';
const SMOL_CONTRACT = 'CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA';
const SNAPSHOT_PATH = path.join(__dirname, '../public/data/smols-snapshot.json');

/**
 * Get operations for an account (the Mint_Token contract)
 */
async function getContractOperations(contractId, limit = 50) {
    try {
        // Get transactions that involve this contract as an effect
        const url = `${HORIZON_URL}/transactions?limit=${limit}&order=desc`;
        // Actually we need to search for transactions that created this token
        // Let's try the payments endpoint for the token
        return [];
    } catch (e) {
        return [];
    }
}

/**
 * Search for the mint transaction by looking at SMOL contract calls
 * that mention this song's token
 */
async function findMintTransaction(mintToken) {
    // The mint creates the Mint_Token, so we can search for transactions
    // that have this contract address in their results

    try {
        // Use the contract's first transaction as the creation tx
        // Soroban contracts are created by invoke_host_function
        const url = `${HORIZON_URL}/accounts/${mintToken}/transactions?limit=1&order=asc`;
        const res = await fetch(url);

        if (!res.ok) return null;

        const data = await res.json();
        const tx = data._embedded?.records?.[0];

        return tx?.hash || null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract minter from transaction's invoke_host_function params
 */
async function getMinterFromTx(txHash) {
    try {
        const res = await fetch(`${HORIZON_URL}/transactions/${txHash}/operations`);
        if (!res.ok) return null;

        const data = await res.json();
        const op = data._embedded?.records?.[0];

        if (!op || op.type !== 'invoke_host_function') return null;

        const params = op.parameters || [];
        if (params.length < 3) return null;

        // Param 2 contains the minter address
        const p2 = params[2];
        if (p2.type !== 'Address') return null;

        const val = xdr.ScVal.fromXDR(Buffer.from(p2.value, 'base64'));
        return scValToNative(val);
    } catch (e) {
        return null;
    }
}

async function main() {
    console.log('=== Backfill Minted_By from Transactions ===\n');

    // Load snapshot
    console.log('Loading snapshot...');
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw);
    console.log(`Snapshot has ${snapshot.length} items`);

    // Get minted items without Minted_By
    const needsMinter = snapshot.filter(s => s.Mint_Token && !s.Minted_By);
    console.log(`Items needing Minted_By: ${needsMinter.length}`);

    let updated = 0;
    let noTx = 0;
    let selfMinted = 0;
    let errors = 0;

    for (let i = 0; i < needsMinter.length; i++) {
        const smol = needsMinter[i];
        process.stdout.write(`\r[${i + 1}/${needsMinter.length}] ${smol.Title?.slice(0, 25).padEnd(25)}...`);

        try {
            // Find the mint transaction for this token
            const txHash = await findMintTransaction(smol.Mint_Token);

            if (!txHash) {
                noTx++;
                continue;
            }

            // Extract minter from transaction
            const minter = await getMinterFromTx(txHash);

            if (!minter) {
                errors++;
                continue;
            }

            // Check if self-minted
            const creator = smol.Address || smol.Creator;
            if (minter === creator) {
                selfMinted++;
                continue;
            }

            // Found a collector!
            smol.Minted_By = minter;
            updated++;
            console.log(`\n  ✓ ${smol.Title}: ${minter.slice(0, 10)}... (collected from ${creator?.slice(0, 10)}...)`);

        } catch (e) {
            errors++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n\n=== Summary ===`);
    console.log(`Updated with Minted_By: ${updated}`);
    console.log(`Self-minted: ${selfMinted}`);
    console.log(`No transaction found: ${noTx}`);
    console.log(`Errors: ${errors}`);

    // Save updated snapshot
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`\nSaved to ${SNAPSHOT_PATH}`);
}

main().catch(console.error);
