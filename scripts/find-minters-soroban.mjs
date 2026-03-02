#!/usr/bin/env node
/**
 * Soroban Minter Finder
 * 
 * This script uses Soroban RPC to find all coin_it invocations
 * and determine who minted each SMOL song.
 * 
 * Usage: node scripts/find-minters-soroban.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = 'https://rpc.lightsail.network/';
const SMOL_CONTRACT = 'CBRNUVLGFM5OYWAGZVGU7CTMP2UJLKZCLFY2ANUCK5UGKND6BBAA5PLA';
const SNAPSHOT_PATH = path.join(__dirname, '../src/data/smols-snapshot.json');

async function rpcCall(method, params = {}) {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        })
    });
    const data = await res.json();
    if (data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
    }
    return data.result;
}

async function getLatestLedger() {
    const result = await rpcCall('getLatestLedger');
    return result.sequence;
}

async function getEvents(startLedger, cursor = null) {
    const params = {
        startLedger,
        filters: [{
            type: 'contract',
            contractIds: [SMOL_CONTRACT]
        }],
        pagination: { limit: 100 }
    };
    if (cursor) {
        params.pagination.cursor = cursor;
    }
    return rpcCall('getEvents', params);
}

async function main() {
    console.log('=== Soroban Minter Finder ===\n');

    // Load snapshot
    console.log('Loading snapshot...');
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw);
    console.log(`Snapshot has ${snapshot.length} items`);

    // Get minted items
    const minted = snapshot.filter(s => s.Mint_Token);
    console.log(`Minted items: ${minted.length}`);

    // Create a map of Mint_Token -> smol
    const tokenToSmol = new Map();
    for (const smol of minted) {
        tokenToSmol.set(smol.Mint_Token, smol);
    }

    // Get latest ledger
    const latestLedger = await getLatestLedger();
    console.log(`Latest ledger: ${latestLedger}`);

    // Scan back through recent ledgers for events
    // Events are only available for ~7 days of history
    const startLedger = latestLedger - 2000; // Last 2-3 hours
    console.log(`Scanning from ledger ${startLedger} to ${latestLedger}...`);

    let allEvents = [];
    let cursor = null;
    let pageCount = 0;

    try {
        while (true) {
            pageCount++;
            process.stdout.write(`\rFetching page ${pageCount}... (${allEvents.length} events)`);

            const result = await getEvents(startLedger, cursor);
            const events = result.events || [];
            allEvents.push(...events);

            if (events.length < 100) break;
            cursor = result.cursor || null;
            if (!cursor) break;

            await new Promise(r => setTimeout(r, 100)); // Rate limit
        }
    } catch (e) {
        console.log(`\nEvent fetch stopped: ${e.message}`);
    }

    console.log(`\nTotal events found: ${allEvents.length}`);

    // Parse events to find minters
    // Looking for coin_it or coin_them invocations
    let mintersFound = 0;

    for (const event of allEvents) {
        try {
            // Event topics contain the function name and parameters
            const topics = event.topic || [];
            const value = event.value;

            // Log first few events to understand structure
            if (mintersFound < 3) {
                console.log(`\nEvent sample:`, JSON.stringify(event).substring(0, 300));
            }

            // Try to extract minter from event
            // The exact structure depends on how coin_it emits events

        } catch (e) {
            // Skip invalid events
        }
    }

    console.log(`\nMintersFound: ${mintersFound}`);

    // Alternative approach: Check each minted token's balance holders
    console.log('\n--- Alternative: Checking token holders ---');

    for (const smol of minted.slice(0, 5)) {
        console.log(`\nChecking ${smol.Title} (${smol.Mint_Token.slice(0, 10)}...):`);
        console.log(`  Creator: ${smol.Address}`);

        try {
            // Query token balance for the creator to confirm they hold tokens
            // If someone else holds tokens, they're the minter
            const ledgerKeys = [{
                type: 'contractData',
                contractId: smol.Mint_Token,
                key: 'Balance',
                durability: 'persistent'
            }];

            // This would need the proper XDR encoding which is complex
            // For now just log what we know
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }

    console.log('\n=== Summary ===');
    console.log('The Soroban event history is limited to ~7 days.');
    console.log('For older mint transactions, we need an alternative approach:');
    console.log('1. Query Stellar Expert historical data for each Mint_Token');
    console.log('2. Or check the backend database for mint transaction records');
}

main().catch(console.error);
