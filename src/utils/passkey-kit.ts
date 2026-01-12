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

export const account = new PasskeyKit({
    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
});

export const server = new PasskeyServer({
    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    launchtubeUrl: import.meta.env.PUBLIC_LAUNCHTUBE_URL,
    launchtubeJwt: import.meta.env.PUBLIC_LAUNCHTUBE_JWT,
});

export const sac = new SACClient({
    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(
    import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
);