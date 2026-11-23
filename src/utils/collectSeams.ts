/**
 * E2E-only substitutes for the collect flow's EXTERNAL boundaries: transaction
 * assembly, the passkey prompt, the relay / POST /mint, and the optional
 * server snapshot. Production code paths (ordering, guards, persistence) still
 * run. Compiled out of every build that doesn't set PUBLIC_E2E_SEAMS=1, which
 * only the Playwright dev server does.
 */
export interface BoundarySeam {
  assemble?: () => Promise<unknown>;
  expiration?: () => Promise<number>;
  sign?: () => Promise<void>;
  relay?: (trackIds: string[]) => Promise<unknown>;
}

export interface CollectSeams {
  buy?: BoundarySeam;
  mint?: BoundarySeam;
  /** Use POST /chain/snapshot as if PUBLIC_CHAIN_SNAPSHOT=1. */
  serverSnapshot?: boolean;
}

export function e2eSeams(): CollectSeams | undefined {
  if (import.meta.env.PUBLIC_E2E_SEAMS !== '1') return undefined;
  return (globalThis as { __smolCollectSeams?: CollectSeams }).__smolCollectSeams;
}
