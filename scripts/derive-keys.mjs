
import { Mnemonic } from '@stellar/stellar-sdk';

const phrase = "share shadow nature eagle deer estate actor text bike guilt cake joke enough correct miss course viable phrase sniff route diagram drink biology airport";

try {
    const mnemonic = Mnemonic.fromPhrase(phrase);
    // In SDK v14, it might be Mnemonic.fromPhrase or new Mnemonic(phrase) depending on specific minor version/export.
    // Let's try the keypair derivation directly if possible or check prototype.
    // Actually, looking at docs, it's usually `const mnemonic = new Mnemonic(phrase); const keypair = mnemonic.getKeypair(0);`

    // Attempting standard instantiation first
    const m = new Mnemonic(phrase);
    const keypair = m.getKeypair(0);

    console.log("PUBLIC_KEY=" + keypair.publicKey());
    console.log("SECRET_KEY=" + keypair.secret());
} catch (e) {
    console.error("Error:", e.message);
    // Fallback import check
    try {
        console.log("Trying Mnemonic.fromPhrase...");
        const m = Mnemonic.fromPhrase(phrase);
        const keypair = m.getKeypair(0);
        console.log("PUBLIC_KEY=" + keypair.publicKey());
        console.log("SECRET_KEY=" + keypair.secret());
    } catch (e2) {
        console.error("Error 2:", e2.message);
    }
}
