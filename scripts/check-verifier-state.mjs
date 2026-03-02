import pkg from '@stellar/stellar-sdk';
const { Contract, rpc, scValToNative, Address, xdr } = pkg;

const RPC_URL = "https://mainnet.sorobanrpc.com";
const CONTRACT_ID = "CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M";

async function checkState() {
    console.log(`🔍 Checking state for contract: ${CONTRACT_ID}`);
    const server = new rpc.Server(RPC_URL);

    // 1. Check Admin
    try {
        const adminKey = xdr.ScVal.scvSymbol("Admin");
        const entry = await server.getContractData(CONTRACT_ID, adminKey);
        console.log("✅ Admin Entry Found:", scValToNative(entry.val));
    } catch (e) {
        console.error("❌ Admin Entry Not Found or Error:", e.message);
    }

    // 2. Check Vkey
    try {
        const vkeyKey = xdr.ScVal.scvSymbol("Vkey");
        const entry = await server.getContractData(CONTRACT_ID, vkeyKey);
        console.log("✅ Vkey Entry Found!");
        const vkey = scValToNative(entry.val);
        console.log("   Keys in Vkey:", Object.keys(vkey));
    } catch (e) {
        console.error("❌ Vkey Entry Not Found or Error:", e.message);
    }
}

checkState().catch(console.error);
