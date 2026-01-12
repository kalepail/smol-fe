import { PasskeyKit, PasskeyServer, SACClient } from "passkey-kit";

const REQUIRED_ENV_VARS = [
    "PUBLIC_RPC_URL",
    "PUBLIC_NETWORK_PASSPHRASE",
    "PUBLIC_WALLET_WASM_HASH",
];

for (const key of REQUIRED_ENV_VARS) {
    if (!import.meta.env[key]) {
        console.error(`[PasskeyKit] Missing Environment Variable: ${key}`);
    }
}

// Robust RPC Selection Strategy
// 1. User Preference (Env Var)
// 2. High Performance Public Nodes (Quasar, Ankr)
// 3. Official SDF Node
const RPC_OPTIONS = [
    import.meta.env.PUBLIC_RPC_URL,
    "https://quasar.lightsail.network/",
    "https://rpc.ankr.com/stellar_soroban",
    "https://soroban-rpc.mainnet.stellar.org",
    "https://stellar-mainnet.publicnode.com"
].filter(Boolean) as string[];

// Use the first available defined URL
const RPC_URL = RPC_OPTIONS[0];

export const account = new PasskeyKit({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
});

export const server = new PasskeyServer({
    rpcUrl: RPC_URL,
    launchtubeUrl: import.meta.env.PUBLIC_LAUNCHTUBE_URL,
    launchtubeJwt: import.meta.env.PUBLIC_LAUNCHTUBE_JWT,
});

export const sac = new SACClient({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(
    import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
);