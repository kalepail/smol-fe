import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from "../utils/storage";

// Initialize from localStorage if available (client-side only)
// These calls are SSR-safe as safeLocalStorageGet checks for window
const storedContractId = safeLocalStorageGet("smol:contractId");
const storedKeyId = safeLocalStorageGet("smol:keyId");

export const userState = $state<{
    contractId: string | null;
    keyId: string | null;
    walletConnected: boolean;
}>({
    contractId: storedContractId,
    keyId: storedKeyId,
    walletConnected: false,
});

/**
 * Derived state function
 */
export function isAuthenticated(): boolean {
    return userState.contractId !== null && userState.keyId !== null;
}

/**
 * Set contract ID
 */
export function setContractId(id: string | null) {
    userState.contractId = id;
    if (id) safeLocalStorageSet("smol:contractId", id);
    else safeLocalStorageRemove("smol:contractId");
}

/**
 * Set key ID
 */
export function setKeyId(id: string | null) {
    userState.keyId = id;
    if (id) safeLocalStorageSet("smol:keyId", id);
    else safeLocalStorageRemove("smol:keyId");
}

/**
 * Set both contract and key ID
 */
export function setUserAuth(contractId: string | null, keyId: string | null) {
    userState.contractId = contractId;
    userState.keyId = keyId;

    if (contractId) safeLocalStorageSet("smol:contractId", contractId);
    if (keyId) safeLocalStorageSet("smol:keyId", keyId);
}

/**
 * Get contract ID (read-only accessor)
 */
export function getContractId(): string | null {
    return userState.contractId;
}

/**
 * Get key ID (read-only accessor)
 */
export function getKeyId(): string | null {
    return userState.keyId;
}
