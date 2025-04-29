import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from '@stellar/stellar-sdk/minimal/contract';
import type { u32, i128, Option } from '@stellar/stellar-sdk/minimal/contract';
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
    12: {
        message: string;
    };
};
export type Storage = {
    tag: "Admin";
    values: void;
} | {
    tag: "FeeSAC";
    values: void;
} | {
    tag: "FeeAddress";
    values: void;
} | {
    tag: "ColorClaimFee";
    values: void;
} | {
    tag: "ColorOwnerRoyaltyRate";
    values: void;
} | {
    tag: "GlyphMineFee";
    values: void;
} | {
    tag: "GlyphAuthorRoyaltyRate";
    values: void;
} | {
    tag: "GlyphIndex";
    values: void;
} | {
    tag: "ColorOwner";
    values: readonly [u32];
} | {
    tag: "Glyph";
    values: readonly [u32];
} | {
    tag: "GlyphIndexHashMap";
    values: readonly [Buffer];
} | {
    tag: "GlyphOwner";
    values: readonly [u32];
} | {
    tag: "OfferSellGlyph";
    values: readonly [u32];
} | {
    tag: "OfferSellAsset";
    values: readonly [u32, string, i128];
} | {
    tag: "Royalties";
    values: readonly [string, string];
};
export type OfferBuy = {
    tag: "Asset";
    values: readonly [string, i128];
} | {
    tag: "Glyph";
    values: readonly [u32];
};
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
    update: ({ admin, fee_sac, fee_address, color_claim_fee, color_owner_royalty_rate, glyph_author_royalty_rate }: {
        admin: Option<string>;
        fee_sac: Option<string>;
        fee_address: Option<string>;
        color_claim_fee: Option<i128>;
        color_owner_royalty_rate: Option<i128>;
        glyph_author_royalty_rate: Option<i128>;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ hash }: {
        hash: Buffer;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a color_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    color_claim: ({ source, owner, color }: {
        source: string;
        owner: string;
        color: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a color_owner_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    color_owner_get: ({ color }: {
        color: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<string>>>;
    /**
     * Construct and simulate a color_owner_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    color_owner_transfer: ({ color, to }: {
        color: u32;
        to: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a glyph_mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    glyph_mint: ({ source, author, owner, colors, legend, width, title, story }: {
        source: string;
        author: string;
        owner: string;
        colors: Buffer;
        legend: Array<u32>;
        width: u32;
        title: string;
        story: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<u32>>>;
    /**
     * Construct and simulate a glyph_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    glyph_get: ({ glyph_index }: {
        glyph_index: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<Glyph>>>;
    /**
     * Construct and simulate a glyph_owner_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    glyph_owner_get: ({ glyph_index }: {
        glyph_index: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<string>>>;
    /**
     * Construct and simulate a glyph_owner_transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    glyph_owner_transfer: ({ glyph_index, to }: {
        glyph_index: u32;
        to: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a offer_sell_glyph transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_glyph: ({ sell, buy }: {
        sell: u32;
        buy: OfferBuy;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<Option<string>>>>;
    /**
     * Construct and simulate a offer_sell_asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_asset: ({ sell, buy }: {
        sell: OfferSellAsset;
        buy: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<Option<string>>>>;
    /**
     * Construct and simulate a offer_sell_glyph_remove transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_glyph_remove: ({ sell, buy }: {
        sell: u32;
        buy: Option<OfferBuy>;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a offer_sell_asset_remove transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_asset_remove: ({ sell, buy }: {
        sell: OfferSellAsset;
        buy: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<void>>>;
    /**
     * Construct and simulate a offer_sell_glyph_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_glyph_get: ({ sell, buy }: {
        sell: u32;
        buy: Option<OfferBuy>;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<Option<u32>>>>;
    /**
     * Construct and simulate a offer_sell_asset_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    offer_sell_asset_get: ({ sell, buy }: {
        sell: OfferSellAssetGet;
        buy: u32;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<Option<u32>>>>;
    /**
     * Construct and simulate a royalties_get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    royalties_get: ({ owner, sac }: {
        owner: string;
        sac: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<i128>>>;
    /**
     * Construct and simulate a royalties_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    royalties_claim: ({ owner, sac }: {
        owner: string;
        sac: string;
    }, options?: {
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
    }) => Promise<AssembledTransaction<Result<i128>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, fee_sac, fee_address, color_claim_fee, glyph_mine_fee, color_owner_royalty_rate, glyph_author_royalty_rate }: {
        admin: string;
        fee_sac: string;
        fee_address: string;
        color_claim_fee: i128;
        glyph_mine_fee: i128;
        color_owner_royalty_rate: i128;
        glyph_author_royalty_rate: i128;
    }, 
    /** Options for initalizing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        update: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        upgrade: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        color_claim: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        color_owner_get: (json: string) => AssembledTransaction<Result<string, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        color_owner_transfer: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        glyph_mint: (json: string) => AssembledTransaction<Result<number, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        glyph_get: (json: string) => AssembledTransaction<Result<Glyph, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        glyph_owner_get: (json: string) => AssembledTransaction<Result<string, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        glyph_owner_transfer: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_glyph: (json: string) => AssembledTransaction<Result<Option<string>, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_asset: (json: string) => AssembledTransaction<Result<Option<string>, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_glyph_remove: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_asset_remove: (json: string) => AssembledTransaction<Result<void, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_glyph_get: (json: string) => AssembledTransaction<Result<Option<number>, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        offer_sell_asset_get: (json: string) => AssembledTransaction<Result<Option<number>, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        royalties_get: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
        royalties_claim: (json: string) => AssembledTransaction<Result<bigint, import("@stellar/stellar-sdk/minimal/contract").ErrorMessage>>;
    };
}
