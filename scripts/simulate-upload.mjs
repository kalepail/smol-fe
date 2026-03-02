import { readFileSync } from 'fs';
import pkg from '@stellar/stellar-sdk';
const { Keypair, Operation, rpc, TransactionBuilder, Networks, xdr } = pkg;

const WASM_PATH = "contracts/tier-verifier/target/wasm32v1-none/release/tier_verifier.optimized.wasm";
const RPC_URL = "https://mainnet.sorobanrpc.com";
const PUBLIC_KEY = "GBRMQ3TG3CUQHLYTGES6MN2VOK4UNFHNDSPLL4MF2WFZTPXOPWKDB5TF";

async function simulateUpload() {
    console.log("🔍 Simulating WASM upload...");
    const server = new rpc.Server(RPC_URL);
    const wasm = readFileSync(WASM_PATH);

    // Create the upload operation
    const op = Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(wasm),
        auth: []
    });

    const account = await server.getAccount(PUBLIC_KEY);
    const tx = new TransactionBuilder(account, {
        fee: "1000",
        networkPassphrase: Networks.PUBLIC
    }).addOperation(op).setTimeout(30).build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
        console.error("❌ Simulation Error:", JSON.stringify(sim, null, 2));
        return;
    }

    console.log("\n--- Full Simulation Result ---");
    console.log(JSON.stringify(sim, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
        , 2));
}

simulateUpload().catch(console.error);
