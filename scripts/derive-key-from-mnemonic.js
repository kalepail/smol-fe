
import { Mnemonic } from '@stellar/stellar-sdk/minimal';

const phrase = "share shadow nature eagle deer estate actor text bike guilt cake joke enough correct miss course viable phrase sniff route diagram drink biology airport";

try {
    const mnemonic = new Mnemonic(phrase);
    const keypair = mnemonic.getKeypair(0); // Account 0 is usually the default

    console.log("Public Key:", keypair.publicKey());
    console.log("Secret Key:", keypair.secret());
} catch (e) {
    console.error("Error:", e.message);
    // Fallback if Mnemonic import fails or is different in this SDK version
    console.log("Attempting fallback...");
}
