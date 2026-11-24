/**
 * Reading a simulated Soroban contract call WITHOUT assuming it succeeded
 * (PURE: no Stellar SDK import — safe in unit tests and any chunk).
 *
 * When a contract call fails in simulation (e.g. Comet `ErrLimitOut` #20 /
 * `ErrLimitPrice` #23), `@stellar/stellar-sdk`'s `AssembledTransaction` does
 * NOT throw from `build()`: `tx.simulation` carries the raw RPC `error` string
 * and `tx.result` returns a rust-style `Err({ message: 'ErrLimitOut' })`.
 * Destructuring that `Err` as the expected tuple throws "is not iterable" and
 * loses the contract code, so callers must inspect the simulation first.
 */

const CONTRACT_ERROR_RE = /Error\(Contract,\s*#(\d+)\)/;

export type SimulatedCall<T> =
  | { ok: true; value: T }
  | { ok: false; code: number | null; name: string | null; message: string };

/** The parts of an SDK `AssembledTransaction` this reader touches. */
export interface SimulatedTxLike {
  readonly simulation?: unknown;
  readonly result: unknown;
}

interface RustResultLike {
  isErr(): boolean;
  isOk(): boolean;
  unwrap(): unknown;
  unwrapErr(): unknown;
}

function isRustResult(value: unknown): value is RustResultLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RustResultLike).isErr === 'function' &&
    typeof (value as RustResultLike).isOk === 'function' &&
    typeof (value as RustResultLike).unwrap === 'function' &&
    typeof (value as RustResultLike).unwrapErr === 'function'
  );
}

function messageOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message;
  }
  return String(value);
}

/** `"HostError: Error(Contract, #20) …"` → `20`; anything else → `null`. */
export function contractErrorCode(text: string): number | null {
  const match = text.match(CONTRACT_ERROR_RE);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Inspect `tx.simulation` (raw RPC error) BEFORE `tx.result`, then unwrap an
 * `Ok` / surface an `Err`. `errorNames` maps contract codes to their spec
 * names (e.g. comet-sdk `Errors`), so an `Err` carrying only a name can be
 * mapped back to its code and a raw code gets its name.
 */
export function readSimulatedCall<T>(
  tx: SimulatedTxLike,
  errorNames: Record<number, { message: string }> = {}
): SimulatedCall<T> {
  const nameOf = (code: number | null) => (code !== null ? (errorNames[code]?.message ?? null) : null);
  const codeOf = (name: string) => {
    for (const [code, entry] of Object.entries(errorNames)) if (entry.message === name) return Number(code);
    return null;
  };

  const simulation = tx.simulation;
  if (typeof simulation === 'object' && simulation !== null) {
    const error = (simulation as { error?: unknown }).error;
    if (typeof error === 'string' && error.length > 0) {
      const code = contractErrorCode(error);
      return { ok: false, code, name: nameOf(code), message: error };
    }
  }

  let result: unknown;
  try {
    result = tx.result;
  } catch (error) {
    const message = messageOf(error);
    const code = contractErrorCode(message);
    return { ok: false, code, name: nameOf(code), message };
  }

  if (isRustResult(result)) {
    if (result.isErr()) {
      const message = messageOf(result.unwrapErr());
      const code = contractErrorCode(message) ?? codeOf(message);
      return { ok: false, code, name: nameOf(code) ?? message, message };
    }
    result = result.unwrap();
  }
  return { ok: true, value: result as T };
}

/** A contract call that failed in simulation, with its contract code when known. */
export class ContractCallError extends Error {
  readonly code: number | null;
  readonly contractError: string | null;
  constructor(failure: { code: number | null; name: string | null; message: string }) {
    super(
      failure.code !== null
        ? `Contract call failed: Error(Contract, #${failure.code})${failure.name ? ` ${failure.name}` : ''}`
        : `Contract call failed: ${failure.message}`
    );
    this.name = 'ContractCallError';
    this.code = failure.code;
    this.contractError = failure.name;
  }
}

/** Unwrap an `[i128, i128]`-style tuple result, or throw `ContractCallError`. */
export function expectSimulatedTuple<T extends readonly unknown[]>(
  tx: SimulatedTxLike,
  errorNames?: Record<number, { message: string }>
): T {
  const call = readSimulatedCall<T>(tx, errorNames);
  if (!call.ok) throw new ContractCallError(call);
  if (!Array.isArray(call.value)) {
    throw new ContractCallError({ code: null, name: null, message: 'unexpected simulation result shape' });
  }
  return call.value;
}
