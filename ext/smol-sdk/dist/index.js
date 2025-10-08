import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from '@stellar/stellar-sdk/minimal/contract';
if (typeof window !== 'undefined') {
    //@ts-ignore Buffer exists
    window.Buffer = window.Buffer || Buffer;
}
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, comet_wasm, base_asset }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, comet_wasm, base_asset }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAQAAAAAAAAAAAAAADEZlZVJlY2lwaWVudAAAAAIAAAAAAAAAB3BlcmNlbnQAAAAACwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEw==",
            "AAAAAQAAAAAAAAAAAAAAB0ZlZVJ1bGUAAAAAAgAAAAAAAAAJZmVlX2Fzc2V0AAAAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAB9AAAAAMRmVlUmVjaXBpZW50",
            "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAKY29tZXRfd2FzbQAAAAAD7gAAACAAAAAAAAAACmJhc2VfYXNzZXQAAAAAABMAAAAA",
            "AAAAAAAAAAAAAAAGdXBkYXRlAAAAAAADAAAAAAAAAAluZXdfYWRtaW4AAAAAAAPoAAAAEwAAAAAAAAAObmV3X2NvbWV0X3dhc20AAAAAA+gAAAPuAAAAIAAAAAAAAAAObmV3X2Jhc2VfYXNzZXQAAAAAA+gAAAATAAAAAA==",
            "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAAl3YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
            "AAAAAAAAAAAAAAAMc3dhcF90aGVtX2luAAAABQAAAAAAAAAEdXNlcgAAABMAAAAAAAAAD2NvbWV0X2FkZHJlc3NlcwAAAAPqAAAAEwAAAAAAAAAKdG9rZW5zX291dAAAAAAD6gAAABMAAAAAAAAAD3Rva2VuX2Ftb3VudF9pbgAAAAALAAAAAAAAAA5mZWVfcmVjaXBpZW50cwAAAAAD6AAAA+oAAAfQAAAADEZlZVJlY2lwaWVudAAAAAA=",
            "AAAAAAAAAAAAAAAJY29pbl90aGVtAAAAAAAABAAAAAAAAAAEdXNlcgAAABMAAAAAAAAAC2Fzc2V0X2J5dGVzAAAAA+oAAAAOAAAAAAAAAAVzYWx0cwAAAAAAA+oAAAPuAAAAIAAAAAAAAAAJZmVlX3J1bGVzAAAAAAAD6gAAA+gAAAfQAAAAB0ZlZVJ1bGUAAAAAAQAAA+oAAAPtAAAAAgAAABMAAAAT",
            "AAAAAAAAAAAAAAAHY29pbl9pdAAAAAAEAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAALYXNzZXRfYnl0ZXMAAAAADgAAAAAAAAAEc2FsdAAAA+4AAAAgAAAAAAAAAAhmZWVfcnVsZQAAA+gAAAfQAAAAB0ZlZVJ1bGUAAAAAAQAAA+0AAAACAAAAEwAAABM="]), options);
        this.options = options;
    }
    fromJSON = {
        update: (this.txFromJSON),
        upgrade: (this.txFromJSON),
        swap_them_in: (this.txFromJSON),
        coin_them: (this.txFromJSON),
        coin_it: (this.txFromJSON)
    };
}
