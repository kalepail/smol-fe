import pkg from '@stellar/stellar-sdk';
const { Contract, rpc, xdr } = pkg;

const RPC_URL = "https://mainnet.sorobanrpc.com";
const CONTRACT_ID = "CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M";

async function inspectOnChain() {
    console.log(`🔍 Inspecting on-chain contract: ${CONTRACT_ID}`);
    const server = new rpc.Server(RPC_URL);

    // 1. Get Ledger Entry for the contract
    const ledgerKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
        contract: new Contract(CONTRACT_ID).address().toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent()
    }));

    const response = await server.getLedgerEntries([ledgerKey]);
    if (!response.entries || response.entries.length === 0) {
        throw new Error("Contract not found on-chain");
    }

    const entry = response.entries[0];
    const contractData = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64').contractData();
    const instance = contractData.val().instance();
    const wasmHash = instance.executable().wasmHash().toString('hex');
    console.log(`✅ WASM Hash: ${wasmHash}`);

    // 2. Check Admin & Vkey via data entries
    const adminKey = xdr.ScVal.scvSymbol("Admin"); // If simple enum
    const vkeyKey = xdr.ScVal.scvSymbol("Vkey");

    // Try both scvSymbol and scvVec([scvSymbol])
    const keysToTest = [
        adminKey,
        xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Admin")]),
        vkeyKey,
        xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Vkey")])
    ];

    for (const key of keysToTest) {
        try {
            const dataKey = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
                contract: new Contract(CONTRACT_ID).address().toScAddress(),
                key: key,
                durability: xdr.ContractDataDurability.persistent()
            }));
            const res = await server.getLedgerEntries([dataKey]);
            if (res.entries?.length) {
                console.log(`✅ Found data for key: ${JSON.stringify(key)}`);
            }
        } catch (e) { }
    }

    // 2. Fetch WASM Metadata (Spec)
    // We can't easily fetch full WASM bytecode and parse it here without a WASM parser,
    // but the 'instance' metadata often contains clues.

    // Actually, let's just check the functions via a small simulation.
    console.log("🛠️ Testing function availability via simulation...");
    const account = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"; // Null address
    const contractObj = new Contract(CONTRACT_ID);

    const functionsToTest = ["verify_and_attest", "initialize", "attest_tier", "upgrade"];
    for (const fn of functionsToTest) {
        try {
            // Using empty arguments for simulation
            const op = contractObj.call(fn);
            const source = new pkg.Account(account, "0");
            const tx = new pkg.TransactionBuilder(source, {
                fee: "100",
                networkPassphrase: pkg.Networks.PUBLIC
            }).addOperation(op).setTimeout(30).build();

            const sim = await server.simulateTransaction(tx);
            if (sim.error && sim.error.includes("not found")) {
                console.log(`❌ Function [${fn}] NOT FOUND`);
            } else {
                console.log(`✅ Function [${fn}] PRESENT (Simulation returned: ${sim.error ? 'Error (expected)' : 'Success'})`);
                if (sim.error) console.log(`   Detail: ${sim.error.slice(0, 50)}...`);
            }
        } catch (e) {
            console.log(`❓ Function [${fn}] Check Error: ${e.message.slice(0, 50)}...`);
        }
    }
}

inspectOnChain().catch(console.error);
