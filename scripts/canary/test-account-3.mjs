// Test with full SDK import to see if Account works
import { Keypair, Account } from "@stellar/stellar-sdk/minimal";

// Generate a fresh valid keypair and use its public key
const kp = Keypair.random();
const pubkey = kp.publicKey();
console.log("Generated pubkey:", pubkey);

try {
    const acc = new Account(pubkey, "0");
    console.log("Account created:", acc.accountId());
} catch (e) {
    console.error("Failed:", e.message);
}
