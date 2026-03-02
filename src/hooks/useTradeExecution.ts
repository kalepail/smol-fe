/**
 * FACTORY FRESH: Unified Trade Execution
 * @see https://deepwiki.com/repo/kalepail/smol-fe#trading
 * @see https://github.com/kalepail/ohloss/blob/main/ohloss-frontend/src/lib/swapService.ts
 * 
 * Executes trades via the Soroswap Aggregator.
 * Automatically handles quote fetching, transaction building, and Relayer submission.
 */
import {
  Contract,
  Networks,
  Address,
  nativeToScVal,
  Account,
  TransactionBuilder,
  xdr
} from '@stellar/stellar-sdk';
import { Buffer } from "buffer";
import type { QuoteResponse, RawTrade } from '../utils/soroswap';
import { AGGREGATOR_CONTRACT } from '../utils/soroswap';
import { signAndSend } from '../utils/transaction-helpers';

// NULL_ACCOUNT for building unsigned transactions (relayer will rewrap)
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

const PROTOCOL_IDS: Record<string, number> = {
  soroswap: 0,
  phoenix: 1,
  aqua: 2,
  comet: 3,
  sdex: 4
};

/**
 * Build a DexDistribution ScVal map.
 * CRITICAL: Fields must be in alphabetical order for Soroban!
 * bytes, parts, path, protocol_id
 */
function buildDexDistribution(dist: any) {
  const bytes = dist.pool_hashes || dist.poolHashes || [];
  const hashVec = bytes.map((h: string) => {
    const bytes = Buffer.from(h, 'hex');
    if (bytes.length !== 32) throw new Error("Pool hash must be 32 bytes");
    return xdr.ScVal.scvBytes(bytes);
  });

  const entries: xdr.ScMapEntry[] = [
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("bytes"),
      val: xdr.ScVal.scvVec(hashVec)
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("parts"),
      val: nativeToScVal(dist.parts, { type: 'u32' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("path"),
      val: nativeToScVal(dist.path.map((a: string) => new Address(a)))
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("protocol_id"),
      val: nativeToScVal(PROTOCOL_IDS[dist.protocol_id.toLowerCase()] ?? 0, { type: 'u32' })
    })
  ];

  return xdr.ScVal.scvMap(entries);
}

export function useTradeExecution() {
  async function executeSwap(params: {
    tokenIn: string,
    tokenOut: string,
    amount: bigint,
    userContractId: string,
    userKeyId: string,
    turnstileToken: string,
    slippageBps?: number
  }) {
    const { tokenIn, tokenOut, amount, userContractId, userKeyId, turnstileToken, slippageBps = 500 } = params;

    const quoteRes = await fetch('/api/swap/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenIn, tokenOut, amountIn: Number(amount) / 1e7, slippageBps }),
    });

    const quote = await quoteRes.json() as QuoteResponse;
    const rawTrade = quote.rawTrade as RawTrade;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const contract = new Contract(AGGREGATOR_CONTRACT);
    const op = contract.call('swap_exact_tokens_for_tokens',
      new Address(tokenIn).toScVal(),
      nativeToScVal(amount, { type: 'i128' }),
      new Address(tokenOut).toScVal(),
      nativeToScVal(BigInt(rawTrade.amountOutMin || '0'), { type: 'i128' }),
      nativeToScVal(rawTrade.distribution.map(buildDexDistribution)),
      new Address(userContractId).toScVal(),
      nativeToScVal(deadline, { type: 'u64' })
    );

    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), {
      fee: '10000000',
      networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE || Networks.PUBLIC,
    }).addOperation(op).setTimeout(300).build();

    const result = await signAndSend(tx, { keyId: userKeyId, turnstileToken });
    if (!result.success) throw new Error(result.error);
    return BigInt(rawTrade.amountOutMin || '0');
  }

  return { executeSwap };
}
