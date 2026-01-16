
import fs from 'fs';
import { ArtifactWriter } from './artifacts/writeArtifacts.js';
import { SoroswapProvider } from './providers/soroswap.js';
import { XBullProvider } from './providers/xbull.js';
import { AquariusProvider } from './providers/aquarius.js';
import * as StellarSdk from "@stellar/stellar-sdk";
const { rpc, Networks, TransactionBuilder, Account } = StellarSdk.default || StellarSdk;
const Server = rpc.Server;

// Load Config
const CONFIG_PATH = './scripts/swap-audit/config.example.json';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

async function main() {
    const args = process.argv.slice(2);
    const getArg = (name) => {
        const idx = args.indexOf(name);
        return idx !== -1 ? args[idx + 1] : null;
    };

    const network = getArg('--network') || config.network;
    const direction = getArg('--direction');
    const amountIn = getArg('--amountIn') || "10000000";
    const providerName = getArg('--provider') || 'soroswap';

    console.log("🕵️  Ralph Swapper Audit Harness");
    console.log(`   Network: ${network}`);
    console.log(`   Direction: ${direction || 'NOT SPECIFIED'}`);
    console.log(`   Amount In: ${amountIn} stroops`);
    console.log(`   Provider: ${providerName}`);

    if (!direction) {
        console.error("❌ ERROR: --direction is required (xlm_to_kale | kale_to_xlm)");
        process.exit(1);
    }

    const artifacts = new ArtifactWriter();

    try {
        console.log("\n🔄 Step 1: Initialization...");
        const rpcServer = new Server(config.rpcUrl);

        // Select Provider
        let provider;
        if (providerName === 'soroswap') {
            provider = new SoroswapProvider(config);
        } else if (providerName === 'xbull') {
            provider = new XBullProvider(config);
        } else if (providerName === 'aquarius') {
            provider = new AquariusProvider(config);
        } else {
            throw new Error(`Unknown provider: ${providerName}`);
        }

        // Source Address (C-Address for smart wallet)
        const sourceAddress = (!config.smartAccount.cAddress || config.smartAccount.cAddress.includes("TODO"))
            ? config.aquarius.xlmAsset
            : config.smartAccount.cAddress;

        console.log(`   Source: ${sourceAddress}`);

        console.log("\n🔄 Step 2: Quote & Build...");
        const { tx, quote, error } = await provider.buildSwapXdr({
            direction,
            amountIn,
            fromAddress: sourceAddress,
            rpc: rpcServer
        });

        artifacts.write('quote.json', quote);

        if (error) {
            console.warn(`   ⚠️ Build Warning: ${error}`);
            artifacts.write('build_error.txt', error);
        }

        if (!tx) {
            console.log("\n⚠️ No TX built (provider may not support full XDR)");
            console.log("\n✅ Quote Complete (No Simulation).");
            process.exit(0);
        }

        // Handle both XDR string and Transaction object
        const txXdr = typeof tx === 'string' ? tx : tx.toXDR();
        console.log(`   Built Tx XDR: ${txXdr.substring(0, 20)}...`);
        artifacts.write('tx.unsponsored.xdr', txXdr);

        console.log("\n🔄 Step 3: Simulation (Pre-flight)...");
        console.log("   Simulating...");

        // Parse XDR if string
        const txObj = typeof tx === 'string'
            ? TransactionBuilder.fromXDR(tx, network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET)
            : tx;

        let simResponse = await rpcServer.simulateTransaction(txObj);

        if (simResponse.events) {
            console.log(`   Events: ${simResponse.events.length}`);
        }

        if (simResponse.error) {
            console.warn(`   ⚠️ Simulation Warning: ${simResponse.error}`);
        } else {
            console.log("   ✅ Simulation Success");
        }

        artifacts.write('tx.simulate.json', simResponse);

        console.log("\n✅ Cycle Complete (SWAP-002).");

    } catch (err) {
        console.error("\n❌ FATAL:", err.message);
        process.exit(1);
    }
}

main();
