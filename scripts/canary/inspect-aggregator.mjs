/**
 * Inspect the deployed Soroswap Aggregator contract's function signatures
 * by fetching its WASM and parsing the spec entries
 */

import { Server } from "@stellar/stellar-sdk/minimal/rpc";
import { xdr, StrKey } from "@stellar/stellar-sdk/minimal";

const RPC_URL = "https://rpc.ankr.com/stellar_soroban";
const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

async function main() {
    console.log("📋 Fetching aggregator contract info...");

    const server = new Server(RPC_URL);

    // Get contract code
    const contractId = StrKey.decodeContract(AGGREGATOR_CONTRACT);
    const ledgerKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
            contract: xdr.ScAddress.scAddressTypeContract(contractId),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent()
        })
    );

    const entries = await server.getLedgerEntries(ledgerKey);

    if (entries.entries && entries.entries.length > 0) {
        const entry = entries.entries[0];
        console.log("✅ Found contract instance");

        // Parse contract instance
        const contractInstance = entry.val.contractData().val().instance();
        console.log("   Executable type:", contractInstance.executable().switch().name);

        // Get the WASM hash
        if (contractInstance.executable().switch().name === "contractExecutableWasm") {
            const wasmHash = contractInstance.executable().wasmHash();
            console.log("   WASM hash:", wasmHash.toString("hex"));

            // Now we need to get the actual WASM to read its spec
            // The spec contains the function signatures
        }

        // Check for storage entries that might reveal function names
        const storage = contractInstance.storage();
        if (storage && storage.length > 0) {
            console.log("\n📦 Contract storage entries:");
            for (const item of storage) {
                console.log("   Key:", JSON.stringify(item.key().toXDR("base64").slice(0, 50)));
            }
        }
    } else {
        console.log("❌ Contract not found");
    }
}

main().catch(err => {
    console.error("💥 ERROR:", err.message);
    process.exit(1);
});
