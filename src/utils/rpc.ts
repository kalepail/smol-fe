export const RPC_OPTIONS = [
    import.meta.env.PUBLIC_RPC_URL,
    "https://rpc.eu-central-8.gateway.fm/v4/stellar/mainnet",
    "https://quasar.lightsail.network/",
    "https://rpc.ankr.com/stellar_soroban",
    "https://soroban-rpc.mainnet.stellar.org",
    "https://stellar-mainnet.publicnode.com"
].filter(Boolean) as string[];

export const RPC_URL = RPC_OPTIONS[0];

export default RPC_URL;
