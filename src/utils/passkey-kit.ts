import { PasskeyKit, SACClient } from "passkey-kit";

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

import { RPC_URL } from "./rpc";
import { OzChannelsServer } from "./relayer-adapter";

export const account = new PasskeyKit({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    walletWasmHash: import.meta.env.PUBLIC_WALLET_WASM_HASH,
    timeoutInSeconds: 30,
});

// OZ Channels server for transaction submission
export const server = new OzChannelsServer({
    baseUrl: import.meta.env.PUBLIC_CHANNELS_BASE_URL || "https://channels.openzeppelin.com",
    apiKey: import.meta.env.PUBLIC_CHANNELS_API_KEY,
});

export const sac = new SACClient({
    rpcUrl: RPC_URL,
    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
});

export const kale = sac.getSACClient(
    import.meta.env.PUBLIC_KALE_SAC_ID || "CB23WRDQWGSP6YPMY4UV5C4OW5CBTXKYN3XEATG7KJEZCXMJBYEHOUOV"
);
