import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/minimal/contract';
import type {
  u32,
  i128,
  Option,
  ClientOptions as ContractClientOptions,
  MethodOptions,
} from '@stellar/stellar-sdk/minimal/contract';

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export interface Record {
  balance: i128;
  index: u32;
  scalar: i128;
  weight: i128;
}

export interface SwapFeeConfig {
  high_util_balance: i128;
  low_util_balance: i128;
  max_fee: i128;
  min_fee: i128;
  tracked_token: string;
}

export interface FeeRecipient {
  percent: i128;
  recipient: string;
}

export interface FeeRule {
  fee_asset: string;
  recipients: Array<FeeRecipient>;
}

export type DataKey = { tag: "Controller", values: void } | { tag: "SwapFeeConfig", values: void } | { tag: "AllTokenVec", values: void } | { tag: "AllRecordData", values: void } | { tag: "TokenShare", values: void } | { tag: "TotalShares", values: void } | { tag: "PublicSwap", values: void } | { tag: "Finalize", values: void } | { tag: "Freeze", values: void } | { tag: "FeeRule", values: void };

export type DataKeyToken = { tag: "Allowance", values: readonly [AllowanceDataKey] } | { tag: "Balance", values: readonly [string] } | { tag: "Nonce", values: readonly [string] } | { tag: "State", values: readonly [string] } | { tag: "Admin", values: void };

export interface AllowanceDataKey {
  from: string;
  spender: string;
}

export interface AllowanceValue {
  amount: i128;
  expiration_ledger: u32;
}

export const Errors = {
  1: { message: "ErrFinalized" },
  2: { message: "ErrNegative" },
  3: { message: "ErrMinFee" },
  4: { message: "ErrMaxFee" },
  5: { message: "ErrNotController" },
  6: { message: "ErrInvalidVectorLen" },
  7: { message: "AlreadyInitialized" },
  8: { message: "ErrIsBound" },
  9: { message: "ErrNotBound" },
  10: { message: "ErrMaxTokens" },
  11: { message: "ErrMinWeight" },
  12: { message: "ErrMaxWeight" },
  13: { message: "ErrMinBalance" },
  14: { message: "ErrFreezeOnlyWithdrawals" },
  15: { message: "ErrMinTokens" },
  16: { message: "ErrSwapFee" },
  17: { message: "ErrMaxInRatio" },
  18: { message: "ErrMathApprox" },
  19: { message: "ErrLimitIn" },
  20: { message: "ErrLimitOut" },
  21: { message: "ErrMaxOutRatio" },
  22: { message: "ErrBadLimitPrice" },
  23: { message: "ErrLimitPrice" },
  24: { message: "ErrTotalWeight" },
  25: { message: "ErrTokenAmountIsNegative" },
  26: { message: "ErrNotAuthorizedByAdmin" },
  27: { message: "ErrInsufficientAllowance" },
  28: { message: "ErrDeauthorized" },
  29: { message: "ErrInsufficientBalance" },
  30: { message: "ErrAddOverflow" },
  31: { message: "ErrSubUnderflow" },
  32: { message: "ErrDivInternal" },
  33: { message: "ErrMulOverflow" },
  34: { message: "ErrCPowBaseTooLow" },
  35: { message: "ErrCPowBaseTooHigh" },
  36: { message: "ErrInvalidExpirationLedger" },
  37: { message: "ErrNegativeOrZero" },
  38: { message: "ErrTokenInvalid" },
  39: { message: "ErrInvalidFeeRecipient" },
  40: { message: "ErrFeeRecipientCapExceeded" },
  41: { message: "ErrFeeRecipientDuplicate" },
  42: { message: "ErrFeeRecipientPercent" },
  43: { message: "ErrFeeRecipientSum" },
  44: { message: "ErrFeeAssetNotBound" },
  45: { message: "ErrFeeRuleNotConfigured" },
  46: { message: "ErrFeeRuleUnsupportedToken" },
  47: { message: "ErrFeeDistribution" }
}

export interface TokenMetadata {
  decimal: u32;
  name: string;
  symbol: string;
}

export interface Client {
  /**
   * Construct and simulate a gulp transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  gulp: ({ t }: { t: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a join_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  join_pool: ({ pool_amount_out, max_amounts_in, user }: { pool_amount_out: i128, max_amounts_in: Array<i128>, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a exit_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  exit_pool: ({ pool_amount_in, min_amounts_out, user }: { pool_amount_in: i128, min_amounts_out: Array<i128>, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a swap_exact_amount_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_exact_amount_in: ({ token_in, token_amount_in, token_out, min_amount_out, max_price, user, trade_recipients }: { token_in: string, token_amount_in: i128, token_out: string, min_amount_out: i128, max_price: i128, user: string, trade_recipients: Option<Array<FeeRecipient>> }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a swap_exact_amount_out transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  swap_exact_amount_out: ({ token_in, max_amount_in, token_out, token_amount_out, max_price, user, trade_recipients }: { token_in: string, max_amount_in: i128, token_out: string, token_amount_out: i128, max_price: i128, user: string, trade_recipients: Option<Array<FeeRecipient>> }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<readonly [i128, i128]>>

  /**
   * Construct and simulate a dep_tokn_amt_in_get_lp_tokns_out transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  dep_tokn_amt_in_get_lp_tokns_out: ({ token_in, token_amount_in, min_pool_amount_out, user }: { token_in: string, token_amount_in: i128, min_pool_amount_out: i128, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a dep_lp_tokn_amt_out_get_tokn_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  dep_lp_tokn_amt_out_get_tokn_in: ({ token_in, pool_amount_out, max_amount_in, user }: { token_in: string, pool_amount_out: i128, max_amount_in: i128, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a wdr_tokn_amt_in_get_lp_tokns_out transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  wdr_tokn_amt_in_get_lp_tokns_out: ({ token_out, pool_amount_in, min_amount_out, user }: { token_out: string, pool_amount_in: i128, min_amount_out: i128, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a wdr_tokn_amt_out_get_lp_tokns_in transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  wdr_tokn_amt_out_get_lp_tokns_in: ({ token_out, token_amount_out, max_pool_amount_in, user }: { token_out: string, token_amount_out: i128, max_pool_amount_in: i128, user: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a set_controller transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_controller: ({ manager }: { manager: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_freeze_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_freeze_status: ({ val }: { val: boolean }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a replace_fee_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  replace_fee_rule: ({ rule }: { rule: FeeRule }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a clear_fee_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  clear_fee_rule: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_total_supply: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_controller transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_controller: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_tokens: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a get_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_balance: ({ token }: { token: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_normalized_weight transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_normalized_weight: ({ token }: { token: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_spot_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_spot_price: ({ token_in, token_out }: { token_in: string, token_out: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_swap_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_swap_fee: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_swap_fee_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_swap_fee_config: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<SwapFeeConfig>>

  /**
   * Construct and simulate a get_fee_rule transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_fee_rule: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<Option<FeeRule>>>

  /**
   * Construct and simulate a get_spot_price_sans_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_spot_price_sans_fee: ({ token_in, token_out }: { token_in: string, token_out: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allowance: ({ from, spender }: { from: string, spender: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve: ({ from, spender, amount, expiration_ledger }: { from: string, spender: string, amount: i128, expiration_ledger: u32 }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({ id }: { id: string }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer: ({ from, to, amount }: { from: string, to: string, amount: i128 }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_from: ({ spender, from, to, amount }: { spender: string, from: string, to: string, amount: i128 }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn: ({ from, amount }: { from: string, amount: i128 }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a burn_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn_from: ({ spender, from, amount }: { spender: string, from: string, amount: i128 }, options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decimals: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: {
    /**
     * The fee to pay for the transaction. Default: BASE_FEE
     */
    fee?: number;

    /**
     * The maximum amount of time to wait for the transaction to complete. Default: DEFAULT_TIMEOUT
     */
    timeoutInSeconds?: number;

    /**
     * Whether to automatically simulate the transaction when constructing the AssembledTransaction. Default: true
     */
    simulate?: boolean;
  }) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { controller, tokens, weights, balances, min_fee, max_fee, tracked_token, low_util_balance, high_util_balance, initial_fee_rule }: { controller: string, tokens: Array<string>, weights: Array<i128>, balances: Array<i128>, min_fee: i128, max_fee: i128, tracked_token: string, low_util_balance: i128, high_util_balance: i128, initial_fee_rule: Option<FeeRule> },
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ controller, tokens, weights, balances, min_fee, max_fee, tracked_token, low_util_balance, high_util_balance, initial_fee_rule }, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec(["AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAoAAAAAAAAACmNvbnRyb2xsZXIAAAAAABMAAAAAAAAABnRva2VucwAAAAAD6gAAABMAAAAAAAAAB3dlaWdodHMAAAAD6gAAAAsAAAAAAAAACGJhbGFuY2VzAAAD6gAAAAsAAAAAAAAAB21pbl9mZWUAAAAACwAAAAAAAAAHbWF4X2ZlZQAAAAALAAAAAAAAAA10cmFja2VkX3Rva2VuAAAAAAAAEwAAAAAAAAAQbG93X3V0aWxfYmFsYW5jZQAAAAsAAAAAAAAAEWhpZ2hfdXRpbF9iYWxhbmNlAAAAAAAACwAAAAAAAAAQaW5pdGlhbF9mZWVfcnVsZQAAA+gAAAfQAAAAB0ZlZVJ1bGUAAAAAAA==",
        "AAAAAAAAAAAAAAAEZ3VscAAAAAEAAAAAAAAAAXQAAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAJam9pbl9wb29sAAAAAAAAAwAAAAAAAAAPcG9vbF9hbW91bnRfb3V0AAAAAAsAAAAAAAAADm1heF9hbW91bnRzX2luAAAAAAPqAAAACwAAAAAAAAAEdXNlcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAJZXhpdF9wb29sAAAAAAAAAwAAAAAAAAAOcG9vbF9hbW91bnRfaW4AAAAAAAsAAAAAAAAAD21pbl9hbW91bnRzX291dAAAAAPqAAAACwAAAAAAAAAEdXNlcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAUc3dhcF9leGFjdF9hbW91bnRfaW4AAAAHAAAAAAAAAAh0b2tlbl9pbgAAABMAAAAAAAAAD3Rva2VuX2Ftb3VudF9pbgAAAAALAAAAAAAAAAl0b2tlbl9vdXQAAAAAAAATAAAAAAAAAA5taW5fYW1vdW50X291dAAAAAAACwAAAAAAAAAJbWF4X3ByaWNlAAAAAAAACwAAAAAAAAAEdXNlcgAAABMAAAAAAAAAEHRyYWRlX3JlY2lwaWVudHMAAAPoAAAD6gAAB9AAAAAMRmVlUmVjaXBpZW50AAAAAQAAA+0AAAACAAAACwAAAAs=",
        "AAAAAAAAAAAAAAAVc3dhcF9leGFjdF9hbW91bnRfb3V0AAAAAAAABwAAAAAAAAAIdG9rZW5faW4AAAATAAAAAAAAAA1tYXhfYW1vdW50X2luAAAAAAAACwAAAAAAAAAJdG9rZW5fb3V0AAAAAAAAEwAAAAAAAAAQdG9rZW5fYW1vdW50X291dAAAAAsAAAAAAAAACW1heF9wcmljZQAAAAAAAAsAAAAAAAAABHVzZXIAAAATAAAAAAAAABB0cmFkZV9yZWNpcGllbnRzAAAD6AAAA+oAAAfQAAAADEZlZVJlY2lwaWVudAAAAAEAAAPtAAAAAgAAAAsAAAAL",
        "AAAAAAAAAAAAAAAgZGVwX3Rva25fYW10X2luX2dldF9scF90b2tuc19vdXQAAAAEAAAAAAAAAAh0b2tlbl9pbgAAABMAAAAAAAAAD3Rva2VuX2Ftb3VudF9pbgAAAAALAAAAAAAAABNtaW5fcG9vbF9hbW91bnRfb3V0AAAAAAsAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAfZGVwX2xwX3Rva25fYW10X291dF9nZXRfdG9rbl9pbgAAAAAEAAAAAAAAAAh0b2tlbl9pbgAAABMAAAAAAAAAD3Bvb2xfYW1vdW50X291dAAAAAALAAAAAAAAAA1tYXhfYW1vdW50X2luAAAAAAAACwAAAAAAAAAEdXNlcgAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAAgd2RyX3Rva25fYW10X2luX2dldF9scF90b2tuc19vdXQAAAAEAAAAAAAAAAl0b2tlbl9vdXQAAAAAAAATAAAAAAAAAA5wb29sX2Ftb3VudF9pbgAAAAAACwAAAAAAAAAObWluX2Ftb3VudF9vdXQAAAAAAAsAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAgd2RyX3Rva25fYW10X291dF9nZXRfbHBfdG9rbnNfaW4AAAAEAAAAAAAAAAl0b2tlbl9vdXQAAAAAAAATAAAAAAAAABB0b2tlbl9hbW91bnRfb3V0AAAACwAAAAAAAAASbWF4X3Bvb2xfYW1vdW50X2luAAAAAAALAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAOc2V0X2NvbnRyb2xsZXIAAAAAAAEAAAAAAAAAB21hbmFnZXIAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAARc2V0X2ZyZWV6ZV9zdGF0dXMAAAAAAAABAAAAAAAAAAN2YWwAAAAAAQAAAAA=",
        "AAAAAAAAAAAAAAAQcmVwbGFjZV9mZWVfcnVsZQAAAAEAAAAAAAAABHJ1bGUAAAfQAAAAB0ZlZVJ1bGUAAAAAAA==",
        "AAAAAAAAAAAAAAAOY2xlYXJfZmVlX3J1bGUAAAAAAAAAAAAA",
        "AAAAAAAAAAAAAAAQZ2V0X3RvdGFsX3N1cHBseQAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbnRyb2xsZXIAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAKZ2V0X3Rva2VucwAAAAAAAAAAAAEAAAPqAAAAEw==",
        "AAAAAAAAAAAAAAALZ2V0X2JhbGFuY2UAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAVZ2V0X25vcm1hbGl6ZWRfd2VpZ2h0AAAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAOZ2V0X3Nwb3RfcHJpY2UAAAAAAAIAAAAAAAAACHRva2VuX2luAAAAEwAAAAAAAAAJdG9rZW5fb3V0AAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAMZ2V0X3N3YXBfZmVlAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAATZ2V0X3N3YXBfZmVlX2NvbmZpZwAAAAAAAAAAAQAAB9AAAAANU3dhcEZlZUNvbmZpZwAAAA==",
        "AAAAAAAAAAAAAAAMZ2V0X2ZlZV9ydWxlAAAAAAAAAAEAAAPoAAAH0AAAAAdGZWVSdWxlAA==",
        "AAAAAAAAAAAAAAAXZ2V0X3Nwb3RfcHJpY2Vfc2Fuc19mZWUAAAAAAgAAAAAAAAAIdG9rZW5faW4AAAATAAAAAAAAAAl0b2tlbl9vdXQAAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABQAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAEYnVybgAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAJYnVybl9mcm9tAAAAAAAAAwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "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",
        "AAAAAQAAAAAAAAAAAAAAEEFsbG93YW5jZURhdGFLZXkAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAAT",
        "AAAAAQAAAAAAAAAAAAAADkFsbG93YW5jZVZhbHVlAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABA==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAALwAAAAAAAAAMRXJyRmluYWxpemVkAAAAAQAAAAAAAAALRXJyTmVnYXRpdmUAAAAAAgAAAAAAAAAJRXJyTWluRmVlAAAAAAAAAwAAAAAAAAAJRXJyTWF4RmVlAAAAAAAABAAAAAAAAAAQRXJyTm90Q29udHJvbGxlcgAAAAUAAAAAAAAAE0VyckludmFsaWRWZWN0b3JMZW4AAAAABgAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAAHAAAAAAAAAApFcnJJc0JvdW5kAAAAAAAIAAAAAAAAAAtFcnJOb3RCb3VuZAAAAAAJAAAAAAAAAAxFcnJNYXhUb2tlbnMAAAAKAAAAAAAAAAxFcnJNaW5XZWlnaHQAAAALAAAAAAAAAAxFcnJNYXhXZWlnaHQAAAAMAAAAAAAAAA1FcnJNaW5CYWxhbmNlAAAAAAAADQAAAAAAAAAYRXJyRnJlZXplT25seVdpdGhkcmF3YWxzAAAADgAAAAAAAAAMRXJyTWluVG9rZW5zAAAADwAAAAAAAAAKRXJyU3dhcEZlZQAAAAAAEAAAAAAAAAANRXJyTWF4SW5SYXRpbwAAAAAAABEAAAAAAAAADUVyck1hdGhBcHByb3gAAAAAAAASAAAAAAAAAApFcnJMaW1pdEluAAAAAAATAAAAAAAAAAtFcnJMaW1pdE91dAAAAAAUAAAAAAAAAA5FcnJNYXhPdXRSYXRpbwAAAAAAFQAAAAAAAAAQRXJyQmFkTGltaXRQcmljZQAAABYAAAAAAAAADUVyckxpbWl0UHJpY2UAAAAAAAAXAAAAAAAAAA5FcnJUb3RhbFdlaWdodAAAAAAAGAAAAAAAAAAYRXJyVG9rZW5BbW91bnRJc05lZ2F0aXZlAAAAGQAAAAAAAAAXRXJyTm90QXV0aG9yaXplZEJ5QWRtaW4AAAAAGgAAAAAAAAAYRXJySW5zdWZmaWNpZW50QWxsb3dhbmNlAAAAGwAAAAAAAAAPRXJyRGVhdXRob3JpemVkAAAAABwAAAAAAAAAFkVyckluc3VmZmljaWVudEJhbGFuY2UAAAAAAB0AAAAAAAAADkVyckFkZE92ZXJmbG93AAAAAAAeAAAAAAAAAA9FcnJTdWJVbmRlcmZsb3cAAAAAHwAAAAAAAAAORXJyRGl2SW50ZXJuYWwAAAAAACAAAAAAAAAADkVyck11bE92ZXJmbG93AAAAAAAhAAAAAAAAABFFcnJDUG93QmFzZVRvb0xvdwAAAAAAACIAAAAAAAAAEkVyckNQb3dCYXNlVG9vSGlnaAAAAAAAIwAAAAAAAAAaRXJySW52YWxpZEV4cGlyYXRpb25MZWRnZXIAAAAAACQAAAAAAAAAEUVyck5lZ2F0aXZlT3JaZXJvAAAAAAAAJQAAAAAAAAAPRXJyVG9rZW5JbnZhbGlkAAAAACYAAAAAAAAAFkVyckludmFsaWRGZWVSZWNpcGllbnQAAAAAACcAAAAAAAAAGkVyckZlZVJlY2lwaWVudENhcEV4Y2VlZGVkAAAAAAAoAAAAAAAAABhFcnJGZWVSZWNpcGllbnREdXBsaWNhdGUAAAApAAAAAAAAABZFcnJGZWVSZWNpcGllbnRQZXJjZW50AAAAAAAqAAAAAAAAABJFcnJGZWVSZWNpcGllbnRTdW0AAAAAACsAAAAAAAAAE0VyckZlZUFzc2V0Tm90Qm91bmQAAAAALAAAAAAAAAAXRXJyRmVlUnVsZU5vdENvbmZpZ3VyZWQAAAAALQAAAAAAAAAaRXJyRmVlUnVsZVVuc3VwcG9ydGVkVG9rZW4AAAAAAC4AAAAAAAAAEkVyckZlZURpc3RyaWJ1dGlvbgAAAAAALw==",
        "AAAABQAAAAAAAAAAAAAAB0FwcHJvdmUAAAAAAQAAAAdhcHByb3ZlAAAAAAQAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAARZXhwaXJhdGlvbl9sZWRnZXIAAAAAAAAEAAAAAAAAAAE=",
        "AAAABQAAAAAAAAAAAAAAFlRyYW5zZmVyV2l0aEFtb3VudE9ubHkAAAAAAAEAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=",
        "AAAABQAAAAAAAAAAAAAACFRyYW5zZmVyAAAAAQAAAAh0cmFuc2ZlcgAAAAQAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAt0b19tdXhlZF9pZAAAAAPoAAAABgAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAABEJ1cm4AAAABAAAABGJ1cm4AAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAAEk1pbnRXaXRoQW1vdW50T25seQAAAAAAAQAAAARtaW50AAAAAgAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAABE1pbnQAAAABAAAABG1pbnQAAAADAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAAC3RvX211eGVkX2lkAAAAA+gAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAACENsYXdiYWNrAAAAAQAAAAhjbGF3YmFjawAAAAIAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAA=",
        "AAAAAQAAAAAAAAAAAAAADVRva2VuTWV0YWRhdGEAAAAAAAADAAAAAAAAAAdkZWNpbWFsAAAAAAQAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZzeW1ib2wAAAAAABA="]),
      options
    )
  }
  public readonly fromJSON = {
    gulp: this.txFromJSON<null>,
    join_pool: this.txFromJSON<null>,
    exit_pool: this.txFromJSON<null>,
    swap_exact_amount_in: this.txFromJSON<readonly [i128, i128]>,
    swap_exact_amount_out: this.txFromJSON<readonly [i128, i128]>,
    dep_tokn_amt_in_get_lp_tokns_out: this.txFromJSON<i128>,
    dep_lp_tokn_amt_out_get_tokn_in: this.txFromJSON<i128>,
    wdr_tokn_amt_in_get_lp_tokns_out: this.txFromJSON<i128>,
    wdr_tokn_amt_out_get_lp_tokns_in: this.txFromJSON<i128>,
    set_controller: this.txFromJSON<null>,
    set_freeze_status: this.txFromJSON<null>,
    replace_fee_rule: this.txFromJSON<null>,
    clear_fee_rule: this.txFromJSON<null>,
    get_total_supply: this.txFromJSON<i128>,
    get_controller: this.txFromJSON<string>,
    get_tokens: this.txFromJSON<Array<string>>,
    get_balance: this.txFromJSON<i128>,
    get_normalized_weight: this.txFromJSON<i128>,
    get_spot_price: this.txFromJSON<i128>,
    get_swap_fee: this.txFromJSON<i128>,
    get_swap_fee_config: this.txFromJSON<SwapFeeConfig>,
    get_fee_rule: this.txFromJSON<Option<FeeRule>>,
    get_spot_price_sans_fee: this.txFromJSON<i128>,
    allowance: this.txFromJSON<i128>,
    approve: this.txFromJSON<null>,
    balance: this.txFromJSON<i128>,
    transfer: this.txFromJSON<null>,
    transfer_from: this.txFromJSON<null>,
    burn: this.txFromJSON<null>,
    burn_from: this.txFromJSON<null>,
    decimals: this.txFromJSON<u32>,
    name: this.txFromJSON<string>,
    symbol: this.txFromJSON<string>
  }
}