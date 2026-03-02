
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const SMOL_ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    console.log(`Scanning Smol Issuer ${SMOL_ISSUER} for mints (Limit 50)...`);

    const response = await server.operations()
        .forAccount(SMOL_ISSUER)
        .order('desc')
        .limit(50)
        .call();

    console.log(`Found ${response.records.length} operations.`);
    let found = false;

    for (const record of response.records) {
        // We are looking for PAYMENT from Issuer to User (Minting)
        // Or specific mint ops if protocol supported, but usually it's payment.

        if (record.type === 'payment') {
            if (record.from === SMOL_ISSUER) {
                console.log('---------------------------------------------------');
                console.log(`*** FOUND MINT (Payment from Issuer)! ***`);
                console.log(`Time: ${record.created_at}`);
                console.log(`Tx: ${record.transaction_hash}`);
                console.log(`Minter (To): ${record.to}`);
                console.log(`Asset: ${record.asset_code}`);
                console.log(`Amount: ${record.amount}`);
                found = true;
            }
        }
        // Also check if type is 'create_account' (unlikely for smols)
        // Or if strictly 'change_trust' with liquidity pool? No.
    }

    if (!found) console.log('No mint payments found in last 50 operations.');
}

main().catch(console.error);
