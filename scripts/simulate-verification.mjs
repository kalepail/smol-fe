const RPC_URL = "https://soroban-testnet.stellar.org";
const CONTRACT_ID = "CDPACZDP7LZ4BEHVG64EAEOOGNTJS5V4WB2JGMZ4I6FK2GCAYVO7LRCC"; // Public Tier Verifier Testnet
const FARMER = "GDBP4WOQVPJKEZWFPQFP4WUXES7ACORKIRN5SR5VM6YOYYAJDUNXZOFI";

async function simulate() {
    console.log("Starting script...");
    let sdk;
    try {
        sdk = await import('@stellar/stellar-sdk');
        console.log("Stellar SDK loaded");
    } catch (e) {
        console.error("Failed to load SDK:", e);
        return;
    }
    const { Keypair, Contract, rpc, xdr, Address, Account, Networks, TransactionBuilder, scValToNative, nativeToScVal } = sdk;
    console.log("SDK Keys:", Object.keys(sdk));
    console.log("RPC Object:", rpc);

    console.log(`🧪 Simulating verify_and_attest for: ${CONTRACT_ID}`);
    let server, contract;
    try {
        server = new rpc.Server(RPC_URL);
        console.log("RPC Server defined");
        contract = new Contract(CONTRACT_ID);
        console.log("Contract defined");
    } catch (e) {
        console.error("Setup failed:", e);
        return;
    }
    console.log("Contract defined");

    // Inputs from user logs
    const tier = 0;
    const commitment = Buffer.from("2f4d935e018c3fe825fad0650047209076c0625f6675ed9d9798aebc675a7ba1", "hex");

    // Proof strings from logs
    const pi_a_hex = "2daf2ed316ec628b3a16bb2b519618dae8a5fe9112605749d95aa72d4abeb8992f3ff96d235079c77af20a601dee2a9e6493fe2b13a41cc087a55cf4de4f2201";
    const pi_b_hex = "131872f8a1a3a06c922980e8bc648c1581f2d583b7d69c4279cf1439224f37a72ad4eda6892abcccc7a2fd39bef6fc74814e7dfbf13f72a96c1f98dcd04b121d2d0a6f5fd0f567db094af51c75544d0d952032139338f9af74252f1af2c5f37f1f8ec201a63976afbf52e42d2dc86ea1d4c62463375d139e41ab1027c5547e90";
    const pi_c_hex = "1f566b4f92c5c1034a68806f49f02deee4bd5be3f12016e654ea4899a16845c006889f2b0579ea3a2ba3dad97cadb58c13039cf9eeb8482afa6e5852d0ea04b7";

    const pi_a = Buffer.from(pi_a_hex, "hex");
    const pi_b = Buffer.from(pi_b_hex, "hex");
    const pi_c = Buffer.from(pi_c_hex, "hex");

    const proofStruct = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_a"), val: xdr.ScVal.scvBytes(pi_a) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_b"), val: xdr.ScVal.scvBytes(pi_b) }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_c"), val: xdr.ScVal.scvBytes(pi_c) }),
    ]);

    // SDK objects are available here
    const farmerAddress = new Address(FARMER);
    console.log("Simulating with Farmer:", farmerAddress.toString());

    // Arg 1: Farmer (Address)
    const op = contract.call("verify_and_attest",
        farmerAddress.toScVal(),
        nativeToScVal(tier, { type: "u32" }), // Tier 0
        nativeToScVal(commitment, { type: "bytes" }),
        proofStruct
    );

    const source = new Account(FARMER, "0");
    const tx = new TransactionBuilder(source, {
        fee: "100",
        networkPassphrase: "Test SDF Network ; September 2015"
    }).addOperation(op).setTimeout(30).build();

    const sim = await server.simulateTransaction(tx);

    console.log("\n--- Simulation Results ---");
    if (sim.error) {
        console.error("❌ Error:", sim.error);
    }

    if (sim.events) {
        console.log(`\nFound ${sim.events.length} diagnostic events:`);
        sim.events.forEach((event, i) => {
            try {
                const raw = xdr.ContractEvent.fromXDR(event.event, 'base64');
                const topics = raw.body().v0().topics().map(t => scValToNative(t));
                const data = scValToNative(raw.body().v0().data());

                if (topics[0] === "ZK_DEBUG") {
                    console.log(`🚩 [Event ${i}] ${topics[1]} | Data: ${JSON.stringify(data)}`);
                } else {
                    console.log(`🔹 [Event ${i}] Topics: ${JSON.stringify(topics)} | Data: ${JSON.stringify(data)}`);
                }
            } catch (e) {
                console.log(`🔹 [Event ${event.id}] (Opaque) ${event.topic.join(', ')}`);
            }
        });
    }
}

simulate().catch(console.error);
