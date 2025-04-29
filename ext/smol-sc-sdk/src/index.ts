import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/minimal/contract';
import type {
  u32,
  i128,
  Option,
} from '@stellar/stellar-sdk/minimal/contract';

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const Errors = {
  1: { message: "AlreadyInitialized" },
  2: { message: "NotInitialized" },
  3: { message: "ColorOutOfRange" },
  4: { message: "ColorAlreadyClaimed" },
  5: { message: "ColorNotClaimed" },
  6: { message: "GlyphTooBig" },
  7: { message: "LegendUnordered" },
  8: { message: "GlyphAlreadyMinted" },
  9: { message: "GlyphNotMinted" },
  10: { message: "OfferDuplicate" },
  11: { message: "OfferNotFound" },
  12: { message: "NoRoyaltiesToClaim" }
}

export type Storage = { tag: "Admin", values: void } | { tag: "FeeSAC", values: void } | { tag: "FeeAddress", values: void } | { tag: "ColorClaimFee", values: void } | { tag: "ColorOwnerRoyaltyRate", values: void } | { tag: "GlyphMineFee", values: void } | { tag: "GlyphAuthorRoyaltyRate", values: void } | { tag: "GlyphIndex", values: void } | { tag: "ColorOwner", values: readonly [u32] } | { tag: "Glyph", values: readonly [u32] } | { tag: "GlyphIndexHashMap", values: readonly [Buffer] } | { tag: "GlyphOwner", values: readonly [u32] } | { tag: "OfferSellGlyph", values: readonly [u32] } | { tag: "OfferSellAsset", values: readonly [u32, string, i128] } | { tag: "Royalties", values: readonly [string, string] };
export type OfferBuy = { tag: "Asset", values: readonly [string, i128] } | { tag: "Glyph", values: readonly [u32] };
export type OfferSellAsset = readonly [string, string, i128];
export type OfferSellAssetGet = readonly [Option<string>, string, i128];

export interface Glyph {
  author: string;
  colors: Buffer;
  legend: Array<u32>;
  width: u32;
}

export interface Client {
  /**
   * Construct and simulate a update transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update: ({ admin, fee_sac, fee_address, color_claim_fee, color_owner_royalty_rate, glyph_author_royalty_rate }: { admin: Option<string>, fee_sac: Option<string>, fee_address: Option<string>, color_claim_fee: Option<i128>, color_owner_royalty_rate: Option<i128>, glyph_author_royalty_rate: Option<i128> }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({ hash }: { hash: Buffer }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a color_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  color_claim: ({ source, owner, color }: { source: string, owner: string, color: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a color_owner_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  color_owner_get: ({ color }: { color: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a color_owner_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  color_owner_transfer: ({ color, to }: { color: u32, to: string }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a glyph_mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  glyph_mint: ({ source, author, owner, colors, legend, width, title, story }: { source: string, author: string, owner: string, colors: Buffer, legend: Array<u32>, width: u32, title: string, story: string }, options?: {
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
  }) => Promise<AssembledTransaction<Result<u32>>>

  /**
   * Construct and simulate a glyph_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  glyph_get: ({ glyph_index }: { glyph_index: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<Glyph>>>

  /**
   * Construct and simulate a glyph_owner_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  glyph_owner_get: ({ glyph_index }: { glyph_index: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a glyph_owner_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  glyph_owner_transfer: ({ glyph_index, to }: { glyph_index: u32, to: string }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a offer_sell_glyph transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_glyph: ({ sell, buy }: { sell: u32, buy: OfferBuy }, options?: {
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
  }) => Promise<AssembledTransaction<Result<Option<string>>>>

  /**
   * Construct and simulate a offer_sell_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_asset: ({ sell, buy }: { sell: OfferSellAsset, buy: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<Option<string>>>>

  /**
   * Construct and simulate a offer_sell_glyph_remove transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_glyph_remove: ({ sell, buy }: { sell: u32, buy: Option<OfferBuy> }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a offer_sell_asset_remove transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_asset_remove: ({ sell, buy }: { sell: OfferSellAsset, buy: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a offer_sell_glyph_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_glyph_get: ({ sell, buy }: { sell: u32, buy: Option<OfferBuy> }, options?: {
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
  }) => Promise<AssembledTransaction<Result<Option<u32>>>>

  /**
   * Construct and simulate a offer_sell_asset_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  offer_sell_asset_get: ({ sell, buy }: { sell: OfferSellAssetGet, buy: u32 }, options?: {
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
  }) => Promise<AssembledTransaction<Result<Option<u32>>>>

  /**
   * Construct and simulate a royalties_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  royalties_get: ({ owner, sac }: { owner: string, sac: string }, options?: {
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
  }) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a royalties_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  royalties_claim: ({ owner, sac }: { owner: string, sac: string }, options?: {
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
  }) => Promise<AssembledTransaction<Result<i128>>>
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, fee_sac, fee_address, color_claim_fee, glyph_mine_fee, color_owner_royalty_rate, glyph_author_royalty_rate }: { admin: string, fee_sac: string, fee_address: string, color_claim_fee: i128, glyph_mine_fee: i128, color_owner_royalty_rate: i128, glyph_author_royalty_rate: i128 },
    /** Options for initalizing a Client as well as for calling a method, with extras specific to deploying. */
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
    return ContractClient.deploy({ admin, fee_sac, fee_address, color_claim_fee, glyph_mine_fee, color_owner_royalty_rate, glyph_author_royalty_rate }, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAAPQ29sb3JPdXRPZlJhbmdlAAAAAAMAAAAAAAAAE0NvbG9yQWxyZWFkeUNsYWltZWQAAAAABAAAAAAAAAAPQ29sb3JOb3RDbGFpbWVkAAAAAAUAAAAAAAAAC0dseXBoVG9vQmlnAAAAAAYAAAAAAAAAD0xlZ2VuZFVub3JkZXJlZAAAAAAHAAAAAAAAABJHbHlwaEFscmVhZHlNaW50ZWQAAAAAAAgAAAAAAAAADkdseXBoTm90TWludGVkAAAAAAAJAAAAAAAAAApHbHlwaEluZGV4AAAAAAAKAAAAAAAAAA5PZmZlckR1cGxpY2F0ZQAAAAAACwAAAAAAAAANT2ZmZXJOb3RGb3VuZAAAAAAAAAwAAAAAAAAAEk5vUm95YWx0aWVzVG9DbGFpbQAAAAAADQ==",
        "AAAAAgAAAAAAAAAAAAAAB1N0b3JhZ2UAAAAADwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAGRmVlU0FDAAAAAAAAAAAAAAAAAApGZWVBZGRyZXNzAAAAAAAAAAAAAAAAAA1Db2xvckNsYWltRmVlAAAAAAAAAAAAAAAAAAAVQ29sb3JPd25lclJveWFsdHlSYXRlAAAAAAAAAAAAAAAAAAAMR2x5cGhNaW5lRmVlAAAAAAAAAAAAAAAWR2x5cGhBdXRob3JSb3lhbHR5UmF0ZQAAAAAAAAAAAAAAAAAKR2x5cGhJbmRleAAAAAAAAQAAAAAAAAAKQ29sb3JPd25lcgAAAAAAAQAAAAQAAAABAAAAAAAAAAVHbHlwaAAAAAAAAAEAAAAEAAAAAQAAAAAAAAARR2x5cGhJbmRleEhhc2hNYXAAAAAAAAABAAAD7gAAACAAAAABAAAAAAAAAApHbHlwaE93bmVyAAAAAAABAAAABAAAAAEAAAAAAAAADk9mZmVyU2VsbEdseXBoAAAAAAABAAAABAAAAAEAAAAAAAAADk9mZmVyU2VsbEFzc2V0AAAAAAADAAAABAAAABMAAAALAAAAAQAAAAAAAAAJUm95YWx0aWVzAAAAAAAAAgAAABMAAAAT",
        "AAAAAgAAAAAAAAAAAAAACE9mZmVyQnV5AAAAAgAAAAEAAAAAAAAABUFzc2V0AAAAAAAAAgAAABMAAAALAAAAAQAAAAAAAAAFR2x5cGgAAAAAAAABAAAABA==",
        "AAAAAQAAAAAAAAAAAAAADk9mZmVyU2VsbEFzc2V0AAAAAAADAAAAAAAAAAEwAAAAAAAAEwAAAAAAAAABMQAAAAAAABMAAAAAAAAAATIAAAAAAAAL",
        "AAAAAQAAAAAAAAAAAAAAEU9mZmVyU2VsbEFzc2V0R2V0AAAAAAAAAwAAAAAAAAABMAAAAAAAA+gAAAATAAAAAAAAAAExAAAAAAAAEwAAAAAAAAABMgAAAAAAAAs=",
        "AAAAAQAAAAAAAAAAAAAABUdseXBoAAAAAAAABAAAAAAAAAAGYXV0aG9yAAAAAAATAAAAAAAAAAZjb2xvcnMAAAAAAA4AAAAAAAAABmxlZ2VuZAAAAAAD6gAAAAQAAAAAAAAABXdpZHRoAAAAAAAABA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAcAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAHZmVlX3NhYwAAAAATAAAAAAAAAAtmZWVfYWRkcmVzcwAAAAATAAAAAAAAAA9jb2xvcl9jbGFpbV9mZWUAAAAACwAAAAAAAAAOZ2x5cGhfbWluZV9mZWUAAAAAAAsAAAAAAAAAGGNvbG9yX293bmVyX3JveWFsdHlfcmF0ZQAAAAsAAAAAAAAAGWdseXBoX2F1dGhvcl9yb3lhbHR5X3JhdGUAAAAAAAALAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAGdXBkYXRlAAAAAAAGAAAAAAAAAAVhZG1pbgAAAAAAA+gAAAATAAAAAAAAAAdmZWVfc2FjAAAAA+gAAAATAAAAAAAAAAtmZWVfYWRkcmVzcwAAAAPoAAAAEwAAAAAAAAAPY29sb3JfY2xhaW1fZmVlAAAAA+gAAAALAAAAAAAAABhjb2xvcl9vd25lcl9yb3lhbHR5X3JhdGUAAAPoAAAACwAAAAAAAAAZZ2x5cGhfYXV0aG9yX3JveWFsdHlfcmF0ZQAAAAAAA+gAAAALAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAARoYXNoAAAD7gAAACAAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAAAAAAALY29sb3JfY2xhaW0AAAAAAwAAAAAAAAAGc291cmNlAAAAAAATAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAABWNvbG9yAAAAAAAABAAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAAAAAAAPY29sb3Jfb3duZXJfZ2V0AAAAAAEAAAAAAAAABWNvbG9yAAAAAAAABAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAUY29sb3Jfb3duZXJfdHJhbnNmZXIAAAACAAAAAAAAAAVjb2xvcgAAAAAAAAQAAAAAAAAAAnRvAAAAAAATAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAKZ2x5cGhfbWludAAAAAAACAAAAAAAAAAGc291cmNlAAAAAAATAAAAAAAAAAZhdXRob3IAAAAAABMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAGY29sb3JzAAAAAAAOAAAAAAAAAAZsZWdlbmQAAAAAA+oAAAAEAAAAAAAAAAV3aWR0aAAAAAAAAAQAAAAAAAAABXRpdGxlAAAAAAAAEAAAAAAAAAAFc3RvcnkAAAAAAAAQAAAAAQAAA+kAAAAEAAAAAw==",
        "AAAAAAAAAAAAAAAJZ2x5cGhfZ2V0AAAAAAAAAQAAAAAAAAALZ2x5cGhfaW5kZXgAAAAABAAAAAEAAAPpAAAH0AAAAAVHbHlwaAAAAAAAAAM=",
        "AAAAAAAAAAAAAAAPZ2x5cGhfb3duZXJfZ2V0AAAAAAEAAAAAAAAAC2dseXBoX2luZGV4AAAAAAQAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAAAAAAAAUZ2x5cGhfb3duZXJfdHJhbnNmZXIAAAACAAAAAAAAAAtnbHlwaF9pbmRleAAAAAAEAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAAAAAAAQb2ZmZXJfc2VsbF9nbHlwaAAAAAIAAAAAAAAABHNlbGwAAAAEAAAAAAAAAANidXkAAAAH0AAAAAhPZmZlckJ1eQAAAAEAAAPpAAAD6AAAABMAAAAD",
        "AAAAAAAAAAAAAAAQb2ZmZXJfc2VsbF9hc3NldAAAAAIAAAAAAAAABHNlbGwAAAfQAAAADk9mZmVyU2VsbEFzc2V0AAAAAAAAAAAAA2J1eQAAAAAEAAAAAQAAA+kAAAPoAAAAEwAAAAM=",
        "AAAAAAAAAAAAAAAXb2ZmZXJfc2VsbF9nbHlwaF9yZW1vdmUAAAAAAgAAAAAAAAAEc2VsbAAAAAQAAAAAAAAAA2J1eQAAAAPoAAAH0AAAAAhPZmZlckJ1eQAAAAEAAAPpAAAD7QAAAAAAAAAD",
        "AAAAAAAAAAAAAAAXb2ZmZXJfc2VsbF9hc3NldF9yZW1vdmUAAAAAAgAAAAAAAAAEc2VsbAAAB9AAAAAOT2ZmZXJTZWxsQXNzZXQAAAAAAAAAAAADYnV5AAAAAAQAAAABAAAD6QAAA+0AAAAAAAAAAw==",
        "AAAAAAAAAAAAAAAUb2ZmZXJfc2VsbF9nbHlwaF9nZXQAAAACAAAAAAAAAARzZWxsAAAABAAAAAAAAAADYnV5AAAAA+gAAAfQAAAACE9mZmVyQnV5AAAAAQAAA+kAAAPoAAAABAAAAAM=",
        "AAAAAAAAAAAAAAAUb2ZmZXJfc2VsbF9hc3NldF9nZXQAAAACAAAAAAAAAARzZWxsAAAH0AAAABFPZmZlclNlbGxBc3NldEdldAAAAAAAAAAAAAADYnV5AAAAAAQAAAABAAAD6QAAA+gAAAAEAAAAAw==",
        "AAAAAAAAAAAAAAANcm95YWx0aWVzX2dldAAAAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAADc2FjAAAAABMAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAAPcm95YWx0aWVzX2NsYWltAAAAAAIAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAADc2FjAAAAABMAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAAMX19jaGVja19hdXRoAAAAAwAAAAAAAAASX3NpZ25hdHVyZV9wYXlsb2FkAAAAAAPuAAAAIAAAAAAAAAALX3NpZ25hdHVyZXMAAAAD6AAAA+oAAAAAAAAAAAAAAA5fYXV0aF9jb250ZXh0cwAAAAAD6gAAB9AAAAAHQ29udGV4dAAAAAABAAAD6QAAA+0AAAAAAAAAAw=="]),
      options
    )
  }
  public readonly fromJSON = {
    update: this.txFromJSON<Result<void>>,
    upgrade: this.txFromJSON<Result<void>>,
    color_claim: this.txFromJSON<Result<void>>,
    color_owner_get: this.txFromJSON<Result<string>>,
    color_owner_transfer: this.txFromJSON<Result<void>>,
    glyph_mint: this.txFromJSON<Result<u32>>,
    glyph_get: this.txFromJSON<Result<Glyph>>,
    glyph_owner_get: this.txFromJSON<Result<string>>,
    glyph_owner_transfer: this.txFromJSON<Result<void>>,
    offer_sell_glyph: this.txFromJSON<Result<Option<string>>>,
    offer_sell_asset: this.txFromJSON<Result<Option<string>>>,
    offer_sell_glyph_remove: this.txFromJSON<Result<void>>,
    offer_sell_asset_remove: this.txFromJSON<Result<void>>,
    offer_sell_glyph_get: this.txFromJSON<Result<Option<u32>>>,
    offer_sell_asset_get: this.txFromJSON<Result<Option<u32>>>,
    royalties_get: this.txFromJSON<Result<i128>>,
    royalties_claim: this.txFromJSON<Result<i128>>
  }
}