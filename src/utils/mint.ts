import { Asset } from '@stellar/stellar-sdk/minimal';
import { Client as SmolClient } from 'smol-sdk';
import { signWithPasskey } from './passkeySign';
import { SMOL_ISSUER } from './smolChainIdentity';
export { MINT_POLL_INTERVAL, MINT_POLL_TIMEOUT } from './mintConstants';

export interface MintOptions {
  id: string;
  contractId: string;
  keyId: string;
  smolContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  creatorAddress: string;
  kaleSacId: string;
}

/** Fee split: creator 25% + minter 25%, or 50% when the creator mints their own song. */
export function buildMintFeeRule(creatorAddress: string, minterAddress: string, kaleSacId: string) {
  return creatorAddress === minterAddress
    ? { fee_asset: kaleSacId, recipients: [{ percent: 50_00000n, recipient: creatorAddress }] }
    : {
        fee_asset: kaleSacId,
        recipients: [
          { percent: 25_00000n, recipient: creatorAddress },
          { percent: 25_00000n, recipient: minterAddress },
        ],
      };
}

export async function createMintTransaction(options: MintOptions) {
  const { id, contractId, keyId, smolContractId, rpcUrl, networkPassphrase, creatorAddress, kaleSacId } = options;

  const salt = Buffer.from(id.padStart(64, '0'), 'hex');

  if (salt.length !== 32) {
    throw new Error('Invalid smol identifier for minting');
  }

  const smolClient = new SmolClient({
    contractId: smolContractId,
    rpcUrl,
    networkPassphrase,
  });

  const assetCode = id.padStart(64, '0').substring(0, 12);
  const asset = new Asset(assetCode, SMOL_ISSUER);

  let at = await smolClient.coin_it({
    user: contractId,
    asset_bytes: asset.toXDRObject().toXDR(),
    salt,
    fee_rule: buildMintFeeRule(creatorAddress, contractId, kaleSacId),
  });

  at = await signWithPasskey(at, { keyId });

  const xdrString = at.built?.toXDR();

  if (!xdrString) {
    throw new Error('Failed to build signed mint transaction');
  }

  return xdrString;
}

export async function submitMintTransaction(id: string, xdr: string, apiUrl: string) {
  const response = await fetch(
    `${apiUrl}/mint/${id}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ xdr }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to start mint workflow');
  }

  return response;
}
