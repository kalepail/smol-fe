import pkg from '@stellar/stellar-sdk';
const { Contract, rpc, scValToNative, xdr } = pkg;

const RPC_URL = "https://mainnet.sorobanrpc.com";
const CONTRACT_ID = "CAU7NET7FXSFBBRMLM6X7CJMVAIHMG7RC4YPCXG6G4YOYG6C3CVGR25M";

async function fetchEvents() {
    console.log(`🔍 Fetching diagnostic events for: ${CONTRACT_ID}`);
    const server = new rpc.Server(RPC_URL);

    // Get latest ledger to calculate start range
    const latestLedger = (await server.getLatestLedger()).sequence;

    const response = await server.getEvents({
        startLedger: latestLedger - 1000, // Look back ~1.5 hours
        filters: [{
            type: "contract",
            contractIds: [CONTRACT_ID]
        }]
    });

    console.log(`Found ${response.events.length} events.`);

    response.events.forEach(event => {
        try {
            const topics = event.topic.map(t => scValToNative(t));
            if (topics[0] === "ZK_DEBUG") {
                console.log(`🚩 [${event.ledger}] ${topics[1]}`);
            } else {
                console.log(`🔹 [${event.ledger}] ${topics[0]}`);
            }
        } catch (e) {
            console.log(`❓ Failed to parse event: ${e.message}`);
        }
    });
}

fetchEvents().catch(console.error);
