/**
 * Canonical SMOL song identity (imports the Stellar SDK only — lazy-load).
 *
 * Only canonical ids are derivable: exactly 64 LOWERCASE hex characters.
 * Short ids ("1", "01") pad to the same salt and asset code, and hex case
 * changes the asset code, so they are ambiguous aliases and stay unresolved
 * until an authoritative mapping identifies the song (Report 31).
 *
 *   SAC  = Asset(id.slice(0, 12), SMOL_ISSUER).contractId(network)
 *   pool = contract deployed by the SMOL factory with salt = hex(id)
 */
import { Address, Asset, StrKey, hash, xdr } from '@stellar/stellar-sdk/minimal';
import type { SmolIdentity } from './ledgerReads.ts';

export const SMOL_ISSUER = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
export const CANONICAL_SMOL_ID = /^[0-9a-f]{64}$/;

const identityCache = new Map<string, SmolIdentity | null>();

function env(name: 'PUBLIC_SMOL_CONTRACT_ID' | 'PUBLIC_NETWORK_PASSPHRASE'): string | undefined {
  // Optional chaining keeps this module importable in Node unit tests.
  return import.meta.env?.[name];
}

export function deriveSmolIdentity(
  id: string,
  opts: { factory?: string; networkPassphrase?: string } = {}
): SmolIdentity | null {
  const factory = opts.factory ?? env('PUBLIC_SMOL_CONTRACT_ID');
  const network = opts.networkPassphrase ?? env('PUBLIC_NETWORK_PASSPHRASE');
  if (!factory || !network || !CANONICAL_SMOL_ID.test(id)) return null;
  const cacheKey = `${network}|${factory}|${id}`;
  if (identityCache.has(cacheKey)) return identityCache.get(cacheKey) ?? null;

  let identity: SmolIdentity | null = null;
  try {
    const assetCode = id.slice(0, 12);
    const sac = new Asset(assetCode, SMOL_ISSUER).contractId(network);
    const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({
        networkId: hash(Buffer.from(network)),
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(factory).toScAddress(),
            salt: Buffer.from(id, 'hex'),
          })
        ),
      })
    );
    identity = { id, padded: id, assetCode, sac, pool: StrKey.encodeContract(hash(preimage.toXDR())) };
  } catch {
    identity = null;
  }
  identityCache.set(cacheKey, identity);
  return identity;
}

/**
 * Ids in one batch whose derived SAC or pool coincides with a DIFFERENT id's
 * (e.g. two ids sharing their first 12 characters share one SAC). Every member
 * of a collision is ambiguous and must stay unresolved.
 */
export function findIdentityCollisions(identities: SmolIdentity[]): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const identity of identities) {
    for (const contract of [`sac:${identity.sac}`, `pool:${identity.pool}`]) {
      const ids = owners.get(contract) ?? new Set<string>();
      ids.add(identity.id);
      owners.set(contract, ids);
    }
  }
  const colliding = new Set<string>();
  for (const ids of owners.values()) {
    if (ids.size > 1) for (const id of ids) colliding.add(id);
  }
  return colliding;
}
