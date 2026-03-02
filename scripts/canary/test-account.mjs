
import { Account } from "@stellar/stellar-sdk/minimal";

try {
    const cAddress = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";
    console.log("Testing C address:", cAddress);
    const acc = new Account(cAddress, "0");
    console.log("Success:", acc.accountId());
} catch (e) {
    console.error("Failed:", e.message);
}

try {
    const gAddress = "GB72IQ63F6Y3K5J6V7J5Y6K7J5Y6K7J5Y6K7J5Y6K7J5Y6K7J5Y6K7J5"; // Dummy valid G address
    // Actually let's use a real looking one just in case length matters
    const realG = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K42RL7";
    console.log("Testing G address:", realG);
    const acc = new Account(realG, "0");
    console.log("Success:", acc.accountId());
} catch (e) {
    console.error("Failed:", e.message);
}
