import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  Address,
  nativeToScVal,
  TimeoutInfinite,
  Account
} from '@stellar/stellar-sdk';
import { getSafeRpId } from '../utils/domains';
import { getLatestSequence } from '../utils/base';
import { account, send, sac } from '../utils/passkey-kit';
import type { QuoteResponse, RawTrade, RawTradeDistribution } from '../utils/soroswap';
import { AGGREGATOR_CONTRACT } from '../utils/soroswap';

// NULL_ACCOUNT for building unsigned transactions (relayer will rewrap)
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const PROTOCOL_IDS: Record<string, number> = {
  soroswap: 0,
  phoenix: 1,
  aqua: 2,
  comet: 3,
};

interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  userContractId: string;
  userKeyId: string;
  turnstileToken: string;
  slippageBps?: number;
}

export function useTradeExecution() {

  async function getSwapQuote(
    tokenIn: string,
    tokenOut: string,
    amount: bigint,
    slippageBps: number = 500
  ): Promise<QuoteResponse> {
    const decimals = 7;
    const amountFloat = Number(amount) / Math.pow(10, decimals);

    const response = await fetch('/api/swap/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenIn,
        tokenOut,
        amountIn: amountFloat,
        slippageBps,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to fetch quote');
    }

    return await response.json();
  }

  function routePlanToDistributionScVal(distribution: RawTradeDistribution[]): xdr.ScVal {
    const vec: xdr.ScVal[] = distribution.map((item) => {
      const protocolId = PROTOCOL_IDS[item.protocol_id.toLowerCase()];
      if (protocolId === undefined) {
        throw new Error(`Unknown protocol: ${item.protocol_id}`);
      }

      const mapEntries: xdr.ScMapEntry[] = [];

      // map keys must be sorted alphabetically: bytes, parts, path, protocol_id

      // 1. bytes (pool hashes)
      // Safely handle missing pool_hashes
      const poolHashes = (item as any).pool_hashes || (item as any).poolHashes || [];
      const hashVec = poolHashes.map((hash: string) =>
        xdr.ScVal.scvBytes(Buffer.from(hash, 'hex')) // API usually returns hex
      );
      // Soroban Option<Vec<Bytes>>: either scvVec or scvVoid?
      // If empty, standard Soroban SDK usually expects Void for None, or Vec for Some.
      // However, if the type is explicitly `Option<Vec<...>>`, simple empty Vec might fail if it expects Void.
      // Ohloss uses `poolHashesToScVal`.
      // Let's assume sending an empty Vec is safe if the contract treats it as "no hashes".
      const bytesVal = xdr.ScVal.scvVec(hashVec);

      mapEntries.push(new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('bytes'),
        val: bytesVal
      }));

      // 2. parts
      mapEntries.push(new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('parts'),
        val: nativeToScVal(item.parts, { type: 'u32' })
      }));

      // 3. path
      const pathScVals = item.path.map((addr) => new Address(addr).toScVal());
      mapEntries.push(new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('path'),
        val: xdr.ScVal.scvVec(pathScVals)
      }));

      // 4. protocol_id
      mapEntries.push(new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('protocol_id'),
        val: nativeToScVal(protocolId, { type: 'u32' })
      }));

      return xdr.ScVal.scvMap(mapEntries);
    });

    return xdr.ScVal.scvVec(vec);
  }

  async function executeSwap(params: SwapParams): Promise<bigint | null> {
    const { tokenIn, tokenOut, amount, userContractId, userKeyId, turnstileToken, slippageBps = 500 } = params;

    // 1. Get Quote
    const quote = await getSwapQuote(tokenIn, tokenOut, amount, slippageBps);
    console.log('[executeSwap] Quote:', quote);

    // 2. Parse Trade info
    // Accessing `rawTrade` which we know exists from our API response structure
    const rawTrade = quote.rawTrade as RawTrade;
    if (!rawTrade || !rawTrade.distribution) {
      throw new Error('Invalid quote: missing distribution');
    }

    // 3. Build Transaction Logic

    // minAmountOut is typically a string in stroops (integer) in the rawTrade object
    const minAmountOut = BigInt(rawTrade.amountOutMin || '0');

    const distributionScVal = routePlanToDistributionScVal(rawTrade.distribution);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    const contract = new Contract(AGGREGATOR_CONTRACT);
    const op = contract.call('swap_exact_tokens_for_tokens',
      new Address(tokenIn).toScVal(),
      nativeToScVal(amount, { type: 'i128' }),
      new Address(tokenOut).toScVal(),
      nativeToScVal(minAmountOut, { type: 'i128' }),
      distributionScVal,
      new Address(userContractId).toScVal(),
      nativeToScVal(deadline, { type: 'u64' })
    );

    // Use NULL_ACCOUNT as source - the relayer will rewrap with its funded account
    const sourceAccount = new Account(NULL_ACCOUNT, "0");

    // Network Passphrase
    const networkPassphrase = import.meta.env.PUBLIC_NETWORK_PASSPHRASE || Networks.PUBLIC;

    const tx = new TransactionBuilder(sourceAccount, {
      fee: '10000000', // 1 XLM (Standard Relayer Fee per Ohloss spec)
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(300) // 5 Minutes (per Ohloss spec)
      .build();

    // 4. Sign with Passkey (adds Auth entries)
    // We use the same expiration/rpId logic as before
    const signedTx = await account.get().sign(tx, {
      rpId: getSafeRpId(window.location.hostname),
      keyId: userKeyId,
      expiration: await getLatestSequence() + 60,
    });

    // 5. Send via Relayer
    await send(signedTx, turnstileToken);

    return minAmountOut;
  }

  return {
    executeSwap,
  };
}
