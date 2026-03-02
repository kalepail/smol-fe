// Treat blank env values as "unset" so they don't accidentally disable one-click mainnet flows.
const envMainnetRpcUrl = import.meta.env.PUBLIC_MAINNET_RPC_URL;
export const MAINNET_RPC_URL = typeof envMainnetRpcUrl === "string" && envMainnetRpcUrl.trim().length > 0 ? envMainnetRpcUrl : "";

export const MAINNET_NETWORK_PASSPHRASE =
    import.meta.env.PUBLIC_MAINNET_NETWORK_PASSPHRASE ?? 'Public Global Stellar Network ; September 2015';

// One-click mainnet attestation for Noir/RISC0. Can be overridden via env.
// If this changes, update docs/LABS_INTEGRITY.md and any deployment notes.
const DEFAULT_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET =
    "CDVJZSMI5KSRK7T6D6GGYVB6UPFCDQLAZAYRGXVJKDBOHLAZOPHHX2FR";

const envFarmAttestationsContractId = import.meta.env.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET;
export const FARM_ATTESTATIONS_CONTRACT_ID_MAINNET =
    typeof envFarmAttestationsContractId === "string" && envFarmAttestationsContractId.trim().length > 0
        ? envFarmAttestationsContractId
        : DEFAULT_FARM_ATTESTATIONS_CONTRACT_ID_MAINNET;

export const isMainnetConfigured = (): boolean => MAINNET_RPC_URL.trim().length > 0 && FARM_ATTESTATIONS_CONTRACT_ID_MAINNET.trim().length > 0;

// ── Testnet equivalents (hackathon mode) ────────────────────────────────────

export const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
export const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

const envFarmAttestationsContractIdTestnet = import.meta.env.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_TESTNET;
export const FARM_ATTESTATIONS_CONTRACT_ID_TESTNET =
    typeof envFarmAttestationsContractIdTestnet === "string" && envFarmAttestationsContractIdTestnet.trim().length > 0
        ? envFarmAttestationsContractIdTestnet
        : "";

export const isTestnetConfigured = (): boolean => FARM_ATTESTATIONS_CONTRACT_ID_TESTNET.trim().length > 0;
