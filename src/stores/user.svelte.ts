/**
 * User authentication state using Svelte 5 runes
 */

export const userState = $state<{
  contractId: string | null;
  keyId: string | null;
}>({
  contractId: null,
  keyId: null,
});

// Derived state function
export function isAuthenticated(): boolean {
  return userState.contractId !== null && userState.keyId !== null;
}

/**
 * Set contract ID
 */
export function setContractId(id: string | null) {
  userState.contractId = id;
}

/**
 * Set key ID
 */
export function setKeyId(id: string | null) {
  userState.keyId = id;
}

/**
 * Set both contract and key ID
 */
export function setUserAuth(contractId: string | null, keyId: string | null) {
  userState.contractId = contractId;
  userState.keyId = keyId;
}

/**
 * Clear authentication
 */
export function clearUserAuth() {
  userState.contractId = null;
  userState.keyId = null;
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
