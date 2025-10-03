// import { Address, hash, StrKey, xdr } from "@stellar/stellar-sdk/minimal";
// import { Client as FpClient } from "fp-sdk";
// import { publicKey, rpc } from "./base";
// import { account } from "./passkey-kit";
// import { get } from "svelte/store";
// import { contractId } from "../store/contractId";
// import { keyId } from "../store/keyId";

export async function toggleLike(smolId: string, isLiked: boolean): Promise<boolean> {
    // const cId = get(contractId);
    // const kId = get(keyId);

    // let xdr_string: string | undefined = undefined;

    // If unliking, we need to burn the FP token
    // if (isLiked) {
    //     if (!cId || !kId) {
    //         throw new Error("Wallet not connected");
    //     }

    //     const contract_id: string = StrKey.encodeContract(
    //         hash(
    //             xdr.HashIdPreimage.envelopeTypeContractId(
    //                 new xdr.HashIdPreimageContractId({
    //                     networkId: hash(
    //                         Buffer.from(
    //                             import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    //                         ),
    //                     ),
    //                     contractIdPreimage:
    //                         xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    //                             new xdr.ContractIdPreimageFromAddress({
    //                                 address: Address.fromString(publicKey).toScAddress(),
    //                                 salt: Buffer.from(smolId, "hex"),
    //                             }),
    //                         ),
    //                 }),
    //             ).toXDR(),
    //         ),
    //     );

    //     const contract = new FpClient({
    //         contractId: contract_id,
    //         rpcUrl: import.meta.env.PUBLIC_RPC_URL,
    //         networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
    //     });

    //     let at = await contract.burn({
    //         from: cId,
    //         amount: 1n,
    //     });

    //     const { sequence } = await rpc.getLatestLedger();
    //     at = await account.sign(at, {
    //         keyId: kId,
    //         expiration: sequence + 60,
    //     });
    //     xdr_string = at.built?.toXDR();
    // }

    // Call the API to toggle the like
    const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes/${smolId}`, {
        method: "PUT",
        credentials: "include",
        // headers: {
        //     "Content-Type": "application/json",
        // },
        // body: JSON.stringify({
        //     xdr: xdr_string,
        // }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to toggle like");
    }

    // Return the new liked state
    return !isLiked;
}
