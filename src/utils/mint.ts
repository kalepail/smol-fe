import { Asset } from "@stellar/stellar-sdk/minimal";
import { Client as SmolClient } from "smol-sdk";
import { account } from "./passkey-kit";
import { getLatestSequence } from "./base";
import { getSafeRpId } from "./domains";

type SignableTransaction = Parameters<ReturnType<typeof account.get>["sign"]>[0];

export const MINT_POLL_INTERVAL = 1000 * 6;
export const MINT_POLL_TIMEOUT = 1000 * 60 * 5;

export interface MintOptions {
    id: string;
    contractId: string;
    keyId: string;
    smolContractId: string;
    rpcUrl: string;
    networkPassphrase: string;
    creatorAddress: string;
    kaleSacId: string;
}

export async function createMintTransaction(options: MintOptions) {
    const { id, contractId, keyId, smolContractId, rpcUrl, networkPassphrase, creatorAddress, kaleSacId } = options;

    const salt = Buffer.from(id.padStart(64, "0"), "hex");

    if (salt.length !== 32) {
        throw new Error("Invalid smol identifier for minting");
    }

    const smolClient = new SmolClient({
        contractId: smolContractId,
        rpcUrl,
        networkPassphrase,
    });

    const assetCode = id.padStart(64, "0").substring(0, 12);
    const issuer = 'GBVJZCVQIKK7SL2K6NL4BO6ZYNXAGNVBTAQDDNOIJ5VPP3IXCSE2SMOL';
    const asset = new Asset(assetCode, issuer);

    // Build fee_rule based on whether minter and creator are the same
    const feeRule = creatorAddress === contractId
        ? {
            fee_asset: kaleSacId,
            recipients: [{
                percent: 50_00000n,
                recipient: creatorAddress,
            }],
        }
        : {
            fee_asset: kaleSacId,
            recipients: [
                {
                    percent: 25_00000n,
                    recipient: creatorAddress,
                },
                {
                    percent: 25_00000n,
                    recipient: contractId,
                },
            ],
        };

    let at = await smolClient.coin_it({
        user: contractId,
        asset_bytes: asset.toXDRObject().toXDR(),
        salt,
        fee_rule: feeRule,
    });

    const sequence = await getLatestSequence();

    const signable = at as unknown as SignableTransaction;
    const signed = await account.get().sign(signable, {
        rpId: getSafeRpId(window.location.hostname),
        keyId,
        expiration: sequence + 60,
    });

    const xdrString = signed.built?.toXDR();

    if (!xdrString) {
        throw new Error("Failed to build signed mint transaction");
    }

    return xdrString;
}

export async function submitMintTransaction(id: string, xdr: string, apiUrl: string) {
    const response = await fetch(
        `${apiUrl}/mint/${id}`,
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ xdr }),
        },
    );

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to start mint workflow");
    }

    return response;
}
