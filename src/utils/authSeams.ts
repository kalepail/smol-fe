/**
 * E2E-only substitutes for the WebAuthn/passkey external boundaries in
 * useAuthentication. Production login/signup request building, POST /login
 * (with credentials: 'include'), userState updates, and cookie handling still
 * execute unmodified. Compiled out of every build without PUBLIC_E2E_SEAMS=1.
 */
export interface AuthSeamConnectResult {
  rawResponse: unknown;
  keyIdBase64: string;
  contractId: string;
}

export interface AuthSeamCreateResult extends AuthSeamConnectResult {
  signedTx: string;
}

export interface AuthSeams {
  connectWallet?: (options?: { rpId?: string }) => Promise<AuthSeamConnectResult>;
  createWallet?: (
    app: string,
    user: string,
    options?: { rpId?: string },
  ) => Promise<AuthSeamCreateResult>;
  send?: (signedTx: unknown) => Promise<unknown>;
}

export function e2eAuthSeams(): AuthSeams | undefined {
  if (import.meta.env.PUBLIC_E2E_SEAMS !== '1') return undefined;
  return (globalThis as { __smolAuthSeams?: AuthSeams }).__smolAuthSeams;
}
