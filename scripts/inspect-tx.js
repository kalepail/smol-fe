
import { rpc, Horizon, scValToNative, xdr } from '@stellar/stellar-sdk';

const HASH = '8cae4476012accf0f776ee788df10538912f4d26cdcb674b953cf725ed52245f';
const HORIZON_URL = 'https://horizon.stellar.org';

async function main() {
    const server = new Horizon.Server(HORIZON_URL);
    const tx = await server.transactions().transaction(HASH).call();

    console.log('Fetching TX:', HASH);
    const envelope = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, 'base64');
    let innerTx;
    if (envelope.switch().name === 'envelopeTypeTxFeeBump') {
        innerTx = envelope.feeBump().tx().innerTx().v1().tx();
    } else {
        innerTx = envelope.v1().tx();
    }

    const ops = innerTx.operations();
    const op = ops[0];

    const func = op.body().invokeHostFunctionOp().hostFunction();
    const invokeDetails = func.invokeContract();

    const contractAddress = invokeDetails.contractAddress();
    console.log('Contract Address:', scValToNative(xdr.ScVal.scValTypeAddress(contractAddress)));

    const funcName = invokeDetails.functionName().toString();
    console.log('Function:', funcName);
}

main().catch(console.error);
