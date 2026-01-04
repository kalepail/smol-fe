#!/usr/bin/env node
/**
 * Token Holder-Based Minter Finder
 * 
 * For each minted song, query its SAC token holders via Horizon.
 * If someone other than the creator holds tokens, they're the minter.
 * 
 * Usage: node scripts/find-minters-horizon.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SNAPSHOT_PATH = path.join(__dirname, '../public/data/smols-snapshot.json');
const HORIZON_URL = 'https://horizon.stellar.org';

/**
 * Fetch accounts that hold a specific SAC token
 */
async function getTokenHolders(contractId) {
    // For Soroban SAC tokens, we need to query claimable balances or 
    // check the contract's storage directly
    // Alternative: Use Horizon's /accounts endpoint with asset_code filter

    // Since SAC tokens are wrapped Stellar assets, we might be able to
    // find them via the claimable_balances or trustlines

    // Try Stellar Expert's contract API first
    try {
        const url = `https://api.stellar.expert/explorer/public/contract/${contractId}/holders?limit=100`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return data._embedded?.records || [];
        }
    } catch (e) {
        // Fall through to alternative
    }

    // Fallback: Query Horizon for claimable balances with this asset
    try {
        const url = `${HORIZON_URL}/claimable_balances?asset=${contractId}&limit=100`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return data._embedded?.records?.map(r => ({
                account: r.claimants?.[0]?.destination,
                balance: r.amount
            })) || [];
        }
    } catch (e) {
        // Fall through
    }

    return [];
}

/**
 * Query Horizon for operations involving the SAC token contract
 */
async function getContractOperations(contractId) {
    try {
        const url = `${HORIZON_URL}/accounts/${contractId}/operations?limit=50&order=asc`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return data._embedded?.records || [];
        }
    } catch (e) {
        // Fall through
    }
    return [];
}

async function main() {
    console.log('=== Token Holder-Based Minter Finder ===\n');

    // Load snapshot
    console.log('Loading snapshot...');
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw);
    console.log(`Snapshot has ${snapshot.length} items`);

    // Get minted items without Minted_By
    const needsMinter = snapshot.filter(s => s.Mint_Token && !s.Minted_By);
    console.log(`Items needing Minted_By: ${needsMinter.length}`);

    let updated = 0;
    let noData = 0;
    let selfMinted = 0;

    for (let i = 0; i < needsMinter.length; i++) {
        const smol = needsMinter[i];
        process.stdout.write(`\r[${i + 1}/${needsMinter.length}] Checking ${smol.Title?.slice(0, 20)}...`);

        const creator = smol.Address;

        try {
            // Method 1: Get contract operations
            const ops = await getContractOperations(smol.Mint_Token);

            for (const op of ops) {
                // Look for the source_account that isn't the creator
                const source = op.source_account;
                if (source && source !== creator) {
                    smol.Minted_By = source;
                    updated++;
                    break;
                }

                // Check for payment operations
                if (op.type === 'payment' && op.to !== creator) {
                    smol.Minted_By = op.to;
                    updated++;
                    break;
                }
            }

            if (!smol.Minted_By) {
                // Method 2: Get token holders
                const holders = await getTokenHolders(smol.Mint_Token);

                for (const holder of holders) {
                    const account = holder.account || holder.address;
                    if (account && account !== creator) {
                        smol.Minted_By = account;
                        updated++;
                        break;
                    }
                }
            }

            if (!smol.Minted_By && ops.length > 0) {
                // All holders are the creator = self-minted
                selfMinted++;
            } else if (!smol.Minted_By) {
                noData++;
            }

        } catch (e) {
            // Skip on error
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n\n=== Summary ===`);
    console.log(`Updated with Minted_By: ${updated}`);
    console.log(`Self-minted (no external holder): ${selfMinted}`);
    console.log(`No data available: ${noData}`);

    // Save updated snapshot
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`\nSaved to ${SNAPSHOT_PATH}`);
}

main().catch(console.error);
