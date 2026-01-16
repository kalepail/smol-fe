
import { Account } from "@stellar/stellar-sdk/minimal";

const VALID_G = "GBBM6BKZPEHWYO3E3YKRETPKQKSMRWWYD2EPBW87WKYQEJMJEOMTGMUF"; // Stellar.org test account
const C_ADDR = "CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM";

try {
    console.log("Testing VALID G:", VALID_G);
    const acc = new Account(VALID_G, "0");
    console.log("Success G");
} catch (e) {
    console.error("Failed G:", e.message);
}

try {
    console.log("Testing C Address:", C_ADDR);
    const acc = new Account(C_ADDR, "0");
    console.log("Success C");
} catch (e) {
    console.error("Failed C:", e.message);
}
