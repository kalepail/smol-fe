import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Address, nativeToScVal, SorobanDataBuilder, StrKey, xdr } from '@stellar/stellar-sdk/minimal';
import { Client as CometClient, Errors as CometErrors } from '../../ext/comet-sdk/dist/index.js';
import {
  ContractCallError,
  contractErrorCode,
  expectSimulatedTuple,
  readSimulatedCall,
} from '../../src/utils/contractResult.ts';
import { isSlippageError, SlippageExceededError } from '../../src/utils/slippage.ts';

/**
 * RPC-boundary regression (FE-1 pass 2, P1): when Comet refuses a swap with
 * ErrLimitOut (#20) / ErrLimitPrice (#23), the real SDK `AssembledTransaction`
 * does NOT throw from `build()` — `tx.result` is an `Err`, and destructuring it
 * as `[amountOut]` threw "not iterable" (the re-quote path never ran). These
 * tests drive the REAL comet-sdk client against a stubbed Soroban RPC.
 */
const contract = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte));
const POOL = contract(1);
const KALE = contract(2);
const SONG = contract(3);
const USER = contract(4);
const RPC_URL = 'https://rpc.e2e.invalid';
const PASSPHRASE = 'Test SDF Network ; September 2015';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Real stellar-rpc wording for a contract error raised during simulation. */
function hostError(code: number) {
  return (
    `HostError: Error(Contract, #${code})\n\nEvent log (newest first):\n` +
    `   0: [Diagnostic Event] contract:${POOL}, topics:[error, Error(Contract, #${code})], data:"escalating error to panic"\n` +
    `   1: [Diagnostic Event] topics:[fn_call, ${POOL}, swap_exact_amount_in], data:[...]`
  );
}

function stubRpc(simulate: (params: { transaction: string }) => unknown) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body.method);
    const result = body.method === 'simulateTransaction' ? simulate(body.params) : null;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  void RPC_URL;
  return calls;
}

function client() {
  return new CometClient({ contractId: POOL, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE });
}

const swap = (c: CometClient, minAmountOut: bigint) =>
  c.swap_exact_amount_in({
    token_in: SONG,
    token_amount_in: 49_000_000n,
    token_out: KALE,
    min_amount_out: minAmountOut,
    max_price: 170141183460469231731687303715884105727n,
    user: USER,
    trade_recipients: undefined,
  });

for (const [code, name] of [
  [20, 'ErrLimitOut'],
  [23, 'ErrLimitPrice'],
] as const) {
  test(`Comet #${code} (${name}) from simulateTransaction surfaces its contract code, never "not iterable"`, async () => {
    const calls = stubRpc(() => ({ error: hostError(code), events: [], latestLedger: 65_635_400 }));
    const tx = await swap(client(), 486n);
    assert.deepEqual(calls, ['simulateTransaction']);

    // The old code path: destructuring the SDK's Err threw and lost the code.
    assert.throws(() => {
      const [out] = tx.result as unknown as [bigint];
      return out;
    }, /not iterable/);

    const call = readSimulatedCall(tx, CometErrors);
    assert.equal(call.ok, false);
    if (call.ok) return;
    assert.equal(call.code, code);
    assert.equal(call.name, name);

    let thrown: unknown;
    try {
      expectSimulatedTuple(tx, CometErrors);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof ContractCallError);
    assert.equal(thrown.code, code);
    assert.equal(thrown.contractError, name);
    assert.equal(isSlippageError(thrown), true, 'routes to the re-quote path');
  });
}

test('non-slippage contract errors keep their code but do not trigger a re-quote', async () => {
  stubRpc(() => ({ error: hostError(29), events: [], latestLedger: 65_635_400 }));
  const tx = await swap(client(), 1n);
  assert.throws(
    () => expectSimulatedTuple(tx, CometErrors),
    (error: unknown) => error instanceof ContractCallError && error.code === 29 && !isSlippageError(error)
  );
});

test('a successful simulation unwraps the [amount_out, spot_price] tuple', async () => {
  const retval = xdr.ScVal.scvVec([
    nativeToScVal(4_850_000n, { type: 'i128' }),
    nativeToScVal(10_000_000n, { type: 'i128' }),
  ]);
  stubRpc(() => ({
    transactionData: new SorobanDataBuilder().build().toXDR('base64'),
    minResourceFee: '100',
    results: [{ auth: [], xdr: retval.toXDR('base64') }],
    events: [],
    latestLedger: 65_635_400,
  }));
  const tx = await swap(client(), 4_801_500n);
  const [amountOut, spot] = expectSimulatedTuple<readonly [bigint, bigint]>(tx, CometErrors);
  assert.equal(amountOut, 4_850_000n);
  assert.equal(spot, 10_000_000n);
  void Address;
});

test('readSimulatedCall: simulation error is read BEFORE result (result getter never touched)', () => {
  let touched = false;
  const tx = {
    simulation: { error: hostError(23) },
    get result() {
      touched = true;
      throw new Error('must not be read');
    },
  };
  const call = readSimulatedCall(tx, CometErrors);
  assert.equal(touched, false);
  assert.deepEqual(call.ok ? null : [call.code, call.name], [23, 'ErrLimitPrice']);
});

test('readSimulatedCall: an Err carrying only a name maps back to its code', () => {
  const err = { isErr: () => true, isOk: () => false, unwrap: () => assert.fail(), unwrapErr: () => ({ message: 'ErrLimitOut' }) };
  const call = readSimulatedCall({ simulation: {}, result: err }, CometErrors);
  assert.deepEqual(call.ok ? null : [call.code, call.name], [20, 'ErrLimitOut']);
  assert.equal(isSlippageError(new ContractCallError(call.ok ? assert.fail() : call)), true);
});

test('contractErrorCode / isSlippageError edge cases', () => {
  assert.equal(contractErrorCode('HostError: Error(Contract, #20)'), 20);
  assert.equal(contractErrorCode('Error(Contract,#23)'), 23);
  assert.equal(contractErrorCode('Error(WasmVm, InvalidAction)'), null);
  // A DOMException AbortError also has numeric code 20: never a slippage error.
  assert.equal(isSlippageError(new DOMException('aborted', 'AbortError')), false);
  // Wrapped (relay → submit → host) errors are classified through `cause`.
  assert.equal(isSlippageError(new Error('relay failed', { cause: new Error('Error(Contract, #20)') })), true);
  assert.equal(isSlippageError(new SlippageExceededError(1n)), true);
});
