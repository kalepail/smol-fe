import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/minimal/contract';
import type {
  i128,
  Option,
} from '@stellar/stellar-sdk/minimal/contract';

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export interface FeeRecipient {
  percent: i128;
  recipient: string;
}

export interface FeeRule {
  fee_asset: string;
  recipients: Array<FeeRecipient>;
}

export interface Client {
  /**
   * Construct and simulate a update transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update: ({ new_admin, new_comet_wasm, new_base_asset }: { new_admin: Option<string>, new_comet_wasm: Option<Buffer>, new_base_asset: Option<string> }, options?: {
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
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({ wasm_hash }: { wasm_hash: Buffer }, options?: {
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
   * Construct and simulate a coin_it transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  coin_it: ({ user, asset_bytes, salt, fee_rule }: { user: string, asset_bytes: Buffer, salt: Buffer, fee_rule: Option<FeeRule> }, options?: {
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
  }) => Promise<AssembledTransaction<readonly [string, string]>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, comet_wasm, base_asset }: { admin: string, comet_wasm: Buffer, base_asset: string },
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
    return ContractClient.deploy({ admin, comet_wasm, base_asset }, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec(["AAAAAQAAAAAAAAAAAAAADEZlZVJlY2lwaWVudAAAAAIAAAAAAAAAB3BlcmNlbnQAAAAACwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAAB0ZlZVJ1bGUAAAAAAgAAAAAAAAAJZmVlX2Fzc2V0AAAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAB9AAAAAMRmVlUmVjaXBpZW50",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKY29tZXRfd2FzbQAAAAAD7gAAACAAAAAAAAAACmJhc2VfYXNzZXQAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAGdXBkYXRlAAAAAAADAAAAAAAAAAluZXdfYWRtaW4AAAAAAAPoAAAAEwAAAAAAAAAObmV3X2NvbWV0X3dhc20AAAAAA+gAAAPuAAAAIAAAAAAAAAAObmV3X2Jhc2VfYXNzZXQAAAAAA+gAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAAAAAAAHY29pbl9pdAAAAAAEAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAALYXNzZXRfYnl0ZXMAAAAADgAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAAAAAAhmZWVfcnVsZQAAA+gAAAfQAAAAB0ZlZVJ1bGUAAAAAAQAAA+0AAAACAAAAEwAAABM="]),
      options
    )
  }
  public readonly fromJSON = {
    update: this.txFromJSON<null>,
    upgrade: this.txFromJSON<null>,
    coin_it: this.txFromJSON<readonly [string, string]>
  }
}