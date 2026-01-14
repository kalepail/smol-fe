export const RPC_OPTIONS = [
    import.meta.env.PUBLIC_RPC_URL,
    "https://soroban-rpc.mainnet.stellar.org",
    "https://rpc.ankr.com/stellar_soroban",
    "https://stellar-mainnet.publicnode.com"
].filter(Boolean) as string[];

export const RPC_URL = RPC_OPTIONS[0];

export default RPC_URL;
