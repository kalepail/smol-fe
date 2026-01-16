export const RPC_OPTIONS = [
    import.meta.env.PUBLIC_RPC_URL,  // Defaults to Ankr from wrangler.toml
    "https://soroban-rpc.mainnet.stellar.org",  // Official Stellar RPC
    "https://stellar-mainnet.publicnode.com"  // PublicNode fallback
].filter(Boolean) as string[];

export const RPC_URL = RPC_OPTIONS[0];

export default RPC_URL;
