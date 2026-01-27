import { rpc, xdr, Address, Contract } from '@stellar/stellar-sdk';

const RPC_URL = "https://rpc.ankr.com/stellar_soroban";
const CONTRACT_ID = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";

async function inspect() {
    const server = new rpc.Server(RPC_URL);

    // Fetch ledger entry for the contract code
    const ledgerKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: new Address(CONTRACT_ID).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent()
    }));

    const response = await server.getLedgerEntries(ledgerKey);
    if (!response.entries || response.entries.length === 0) {
        console.error("Contract not found");
        return;
    }

    const entry = response.entries[0];
    const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
    const instance = data.contractData().val().instance();
    const spec = instance.executable().wasmHash(); // This gives hash, we need the code entry

    console.log("WASM Hash:", spec.toString('hex'));

    // Actually, getLedgerEntries on the wasm hash is better
    const wasmKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({
        hash: spec
    }));

    const wasmResponse = await server.getLedgerEntries(wasmKey);
    const wasmEntry = xdr.LedgerEntryData.fromXDR(wasmResponse.entries[0].xdr, 'base64');
    const code = wasmEntry.contractCode().code();

    console.log("WASM Code Size:", code.length);

    // We can't easily parse the spec from raw WASM here without a parser
    // But we CAN check the 'stellar-sdk' Contract interface meta if it exists
    // actually, let's just use the 'Soroban-RPC' getContractData to find the spec meta if available
}

inspect();
