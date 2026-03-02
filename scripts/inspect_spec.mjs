import { Server, xdr, StrKey } from "@stellar/stellar-sdk";

const RPC_URL = "https://rpc.ankr.com/stellar_soroban";
const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

async function main() {
    const server = new Server(RPC_URL);
    const contractId = StrKey.decodeContract(AGGREGATOR_CONTRACT);

    // Get contract instance to find the WASM hash
    const instanceKey = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
            contract: xdr.ScAddress.scAddressTypeContract(contractId),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent()
        })
    );

    const res = await server.getLedgerEntries(instanceKey);
    if (!res.entries || res.entries.length === 0) {
        console.error("Contract not found");
        return;
    }

    const entry = res.entries[0];
    const instance = entry.val.contractData().val().instance();
    const wasmHash = instance.executable().wasmHash();
    console.log("WASM Hash:", wasmHash.toString("hex"));

    // Now get the WASM code itself to find the spec
    const wasmKey = xdr.LedgerKey.contractCode(
        new xdr.LedgerKeyContractCode({
            hash: wasmHash
        })
    );

    const wasmRes = await server.getLedgerEntries(wasmKey);
    if (!wasmRes.entries || wasmRes.entries.length === 0) {
        console.error("WASM code not found");
        return;
    }

    const wasmEntry = wasmRes.entries[0];
    const wasmCode = wasmEntry.val.contractCode().code();

    // The spec is actually stored in the WASM custom sections.
    // However, Stellar SDK might not have a built-in parser for the full spec from WASM raw bytes easily.
    // But we can check if there are any spec entries in the instance storage or related.

    // Actually, let's try a different approach: check the function names by trial and error if needed,
    // or look at the 'spec' in the contract instance if it exists.

    // In many cases, the spec is also uploaded as a separate contract data entry.
    // Let's try to find it.
}

main().catch(console.error);
