const {
    Contract,
    Address,
    nativeToScVal,
    xdr,
    TransactionBuilder,
    Networks,
    Account
} = require("@stellar/stellar-sdk");
const { Server, Api } = require("@stellar/stellar-sdk/rpc");

const AGGREGATOR_CONTRACT = "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH";
const RPC_URL = "https://rpc.ankr.com/stellar_soroban";
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

async function testMethod(methodName, args) {
    console.log(`\n--- Testing ${methodName} with ${args.length} args ---`);
    const server = new Server(RPC_URL);
    const contract = new Contract(AGGREGATOR_CONTRACT);
    const sourceAccount = new Account(NULL_ACCOUNT, "0");

    const op = contract.call(methodName, ...args);
    const tx = new TransactionBuilder(sourceAccount, {
        fee: "1000000",
        networkPassphrase: Networks.PUBLIC
    }).addOperation(op).setTimeout(300).build();

    try {
        const sim = await server.simulateTransaction(tx);
        if (sim.error) {
            console.log(`Result: ${sim.error}`);
            // If it's a type mismatch or length mismatch, it shows in the error
        } else {
            console.log("Result: Success (Simulation)");
        }
    } catch (e) {
        console.log(`Result: Exception - ${e.message}`);
    }
}

async function run() {
    const tokenIn = "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV";
    const tokenOut = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
    const amount = nativeToScVal(1000000n, { type: "i128" });
    const limit = nativeToScVal(100n, { type: "i128" });
    const to = nativeToScVal(new Address("CAY6HXZGUP5W2OPCW4E7OOH2H37JR4GA4XP5XHQQQTH5L4JKJT64KCKF"));
    const deadline = nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 3600), { type: "u64" });

    const path = nativeToScVal([new Address(tokenIn), new Address(tokenOut)]);
    const distribution = xdr.ScVal.scvVec([
        xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("bytes"), val: xdr.ScVal.scvVoid() }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("parts"), val: nativeToScVal(1, { type: "u32" }) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("path"), val: path }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("protocol_id"), val: nativeToScVal(0, { type: "u32" }) })
        ])
    ]);

    // Test 5 args (Standard Router)
    // amount_in, amount_out_min, path, to, deadline
    await testMethod("swap_exact_tokens_for_tokens", [amount, limit, path, to, deadline]);

    // Test 5 args (Aggregator variant)
    // amount_in, amount_out_min, distribution, to, deadline
    await testMethod("swap_exact_tokens_for_tokens", [amount, limit, distribution, to, deadline]);

    // Test 6 args
    await testMethod("swap_exact_tokens_for_tokens", [amount, limit, distribution, to, deadline, nativeToScVal(0, { type: "u32" })]);

    // Test 7 args (The one that failed for the user)
    // tokenIn, tokenOut, amount, limit, distribution, to, deadline
    await testMethod("swap_exact_tokens_for_tokens", [
        nativeToScVal(new Address(tokenIn)),
        nativeToScVal(new Address(tokenOut)),
        amount,
        limit,
        distribution,
        to,
        deadline
    ]);

    // Test 7 args (The order from useTradeExecution.ts)
    // tokenIn, amount, tokenOut, limit, distribution, to, deadline
    await testMethod("swap_exact_tokens_for_tokens", [
        nativeToScVal(new Address(tokenIn)),
        amount,
        nativeToScVal(new Address(tokenOut)),
        limit,
        distribution,
        to,
        deadline
    ]);
}

run();
