import { Keypair, Networks, WebAuth } from "@stellar/stellar-sdk";

export const VIP_HOME_DOMAIN = "smol.xyz";

const SERVER_KEYPAIR_GLOBAL = "__smolVipServerKeypair";

function getWebAuthDomain(request: Request): string {
  const url = new URL(request.url);
  return url.host;
}

function getNetworkPassphrase(): string {
  return import.meta.env.PUBLIC_NETWORK_PASSPHRASE || Networks.PUBLIC;
}

export function getVipNetworkPassphrase(): string {
  return getNetworkPassphrase();
}

export function getVipWebAuthDomain(request: Request): string {
  return getWebAuthDomain(request);
}

export function getVipServerKeypair(): Keypair {
  const envSecret = import.meta.env.VIP_SERVER_SECRET as string | undefined;
  if (envSecret) {
    return Keypair.fromSecret(envSecret);
  }

  // For local/dev: allow an ephemeral server key so Labs can run without config.
  // Production reviewers should set `VIP_SERVER_SECRET` as an environment secret.
  if (import.meta.env.DEV) {
    const g = globalThis as unknown as Record<string, unknown>;
    const existing = g[SERVER_KEYPAIR_GLOBAL] as Keypair | undefined;
    if (existing) return existing;
    const created = Keypair.random();
    g[SERVER_KEYPAIR_GLOBAL] = created;
    console.warn(
      "[vip] VIP_SERVER_SECRET missing; using an ephemeral server keypair for DEV only."
    );
    return created;
  }

  throw new Error("VIP server secret is not configured (set VIP_SERVER_SECRET).");
}

export function buildVipChallengeTxXdr(params: {
  request: Request;
  clientAddress: string;
  timeoutSeconds?: number;
}): string {
  const serverKeypair = getVipServerKeypair();
  const networkPassphrase = getVipNetworkPassphrase();
  const webAuthDomain = getVipWebAuthDomain(params.request);

  const timeout = params.timeoutSeconds ?? 300;
  return WebAuth.buildChallengeTx(
    serverKeypair,
    params.clientAddress,
    VIP_HOME_DOMAIN,
    timeout,
    networkPassphrase,
    webAuthDomain
  );
}

export function verifyVipChallengeTx(params: {
  request: Request;
  challengeXdr: string;
  clientAddress: string;
}): { ok: true } | { ok: false; error: string } {
  try {
    const serverKeypair = getVipServerKeypair();
    const networkPassphrase = getVipNetworkPassphrase();
    const webAuthDomain = getVipWebAuthDomain(params.request);

    // Throws on invalid / expired / wrong domain / missing signatures.
    WebAuth.verifyChallengeTxSigners(
      params.challengeXdr,
      serverKeypair.publicKey(),
      networkPassphrase,
      [params.clientAddress],
      VIP_HOME_DOMAIN,
      webAuthDomain
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid challenge transaction";
    return { ok: false, error: message };
  }
}
