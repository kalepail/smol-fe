
const StellarSdk = require('@stellar/stellar-sdk');

async function run() {
    console.log("Testing Stellar SDK Operations Parsing...");

    // 1. Create a dummy InvokeHostFunction transaction
    // We can't easily make a valid one without a lot of setup, 
    // so let's try to parse a raw XDR string if we had one, OR rely on the fact that we just want to see the shape of *any* operation.
    // Let's create a simpler Payment op first to see if it has .body() or is a plain object.

    try {
        const source = StellarSdk.Keypair.random();
        const dest = StellarSdk.Keypair.random();

        const tx = new StellarSdk.TransactionBuilder(
            new StellarSdk.Account(source.publicKey(), "1"),
            { fee: "100", networkPassphrase: "Test SDF Network ; September 2015" }
        )
            .addOperation(StellarSdk.Operation.payment({
                destination: dest.publicKey(),
                asset: StellarSdk.Asset.native(),
                amount: "10"
            }))
            .setTimeout(30)
            .build();

        const xdr = tx.toXDR();
        console.log("Generated XDR:", xdr);

        // 2. Parse it back
        const parsedTx = StellarSdk.TransactionBuilder.fromXDR(xdr, "Test SDF Network ; September 2015");

        console.log("Parsed Transaction Operations length:", parsedTx.operations.length);
        const op = parsedTx.operations[0];

        console.log("Operation keys:", Object.keys(op));
        console.log("Type:", op.type);
        console.log("Has .body()?", typeof op.body === 'function');

        // Check strict equality to 'payment'
        if (op.type === 'payment') {
            console.log("✅ It is a plain object with 'type' property.");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
