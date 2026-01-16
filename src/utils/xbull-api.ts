
import axios from "axios";

const BASE_URL = "https://swap.apis.xbull.app";

export interface XBullQuoteParams {
    fromAsset: string;
    toAsset: string;
    fromAmount: string; // U128 string
    maxSteps?: string;
    gasless?: boolean;
    sender?: string;
}

export interface XBullQuoteResponse {
    route: string; // UUID
    fromAmount: string;
    toAmount: string;
    fromAsset: string;
    toAsset: string;
    fee: string;
    gasFee?: string;
}

export interface XBullAcceptQuoteParams {
    fromAmount: string;
    minToGet: string;
    route: string; // UUID from quote
    sender: string;
    recipient: string;
    gasless?: boolean;
}

export interface XBullAcceptQuoteResponse {
    id: string; // UUID
    xdr: string; // base64
    type?: "full" | "restore";
}

export async function getXBullQuote(params: XBullQuoteParams): Promise<XBullQuoteResponse> {
    try {
        const query = new URLSearchParams({
            fromAsset: params.fromAsset,
            toAsset: params.toAsset,
            fromAmount: params.fromAmount,
            maxSteps: params.maxSteps || "3",
            gasless: String(params.gasless || false),
        });

        if (params.sender) {
            query.append("sender", params.sender);
        }

        const response = await axios.get(`${BASE_URL}/swaps/quote?${query.toString()}`);
        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("xBull Quote Error:", error.response.data);
            throw new Error(error.response.data.message || "Failed to fetch xBull quote");
        }
        throw error;
    }
}

export async function buildXBullTransaction(params: XBullAcceptQuoteParams): Promise<XBullAcceptQuoteResponse> {
    try {
        const response = await axios.post(`${BASE_URL}/swaps/accept-quote`, params);
        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("xBull Build TX Error:", error.response.data);
            throw new Error(error.response.data.message || "Failed to build xBull transaction");
        }
        throw error;
    }
}
