/**
 * Hackathon Mode — Testnet wallet management via Stellar Wallets Kit (Freighter).
 *
 * This provides a separate signing path for the game hub contract on Stellar Testnet.
 * The existing PasskeyKit / mainnet flow remains untouched.
 *
 * Flow:
 * 1. Player enables "Hackathon Mode" on the title screen
 * 2. Connects via Freighter (or other SWK wallet) pointed at testnet
 * 3. start_game() is called on the hub contract when gameplay begins
 * 4. end_game() is called when the dungeon run completes
 */

import {
    Contract,
    Address,
    nativeToScVal,
    TransactionBuilder,
    Networks,
    rpc,
} from "@stellar/stellar-sdk/minimal";

const { Server, Api, assembleTransaction } = rpc;

// ── Constants ────────────────────────────────────────────────────────────────

export const HUB_CONTRACT_ID =
    "CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG";

const TESTNET_RPC = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = Networks.TESTNET;

// ── Testnet RPC ─────────────────────────────────────────────────────────────

let _server: InstanceType<typeof Server> | null = null;
function getServer(): InstanceType<typeof Server> {
    if (!_server) _server = new Server(TESTNET_RPC);
    return _server;
}

// ── SWK Wallet State ────────────────────────────────────────────────────────

let _swkKit: any = null;
let _publicKey: string | null = null;

export function getTestnetPublicKey(): string | null {
    return _publicKey;
}

export function isTestnetConnected(): boolean {
    return !!_publicKey;
}

/**
 * Connect to a testnet wallet via Stellar Wallets Kit.
 * Opens the wallet modal (Freighter, xBull, etc.).
 */
export async function connectTestnetWallet(): Promise<string> {
    const {
        StellarWalletsKit,
        WalletNetwork,
        allowAllModules,
    } = await import("@creit.tech/stellar-wallets-kit");

    if (!_swkKit) {
        _swkKit = new StellarWalletsKit({
            modules: allowAllModules(),
            network: WalletNetwork.TESTNET,
        });
    }

    // Track whether user actually selected a wallet in the modal
    let walletSelected = false;

    await _swkKit.openModal({
        onWalletSelected: async (option: { id: string }) => {
            console.log("[HackathonMode] Wallet selected:", option.id);
            walletSelected = true;
            _swkKit.setWallet(option.id);
        },
    });

    // If the modal closed without a selection, it might be a race condition where
    // the callback hasn't fired yet. Give it a generous grace period (4s).
    if (!walletSelected) {
        console.log(`[HackathonMode] Modal closed. Waiting for selection callback... (${new Date().toISOString()})`);

        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (walletSelected) {
                console.log(`[HackathonMode] Selection caught after ${i * 100}ms delay (${new Date().toISOString()})`);
                break;
            }
        }
    }

    // If still no selection after grace period, bail
    if (!walletSelected) {
        console.warn("[HackathonMode] Modal closed without wallet selection");
        throw new Error("No wallet selected — please try again");
    }

    // Freighter on first connect can be slow — give it up to ~8 seconds
    const MAX_POLLS = 20;
    const POLL_MS = 400;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
        try {
            const { address } = await _swkKit.getAddress();
            _publicKey = address;
            console.log("[HackathonMode] Connected testnet wallet:", address);
            return address;
        } catch (err: any) {
            const msg = err?.message || "";
            const isSetWalletError = msg.includes("set the wallet first");

            if (isSetWalletError && attempt < MAX_POLLS - 1) {
                // Still propagating — wait and retry
                if (attempt % 5 === 4) {
                    console.log(`[HackathonMode] Still waiting for wallet... (${attempt + 1}/${MAX_POLLS})`);
                }
                await new Promise(r => setTimeout(r, POLL_MS));
                continue;
            }

            // Final attempt or unknown error
            if (isSetWalletError) {
                console.error("[HackathonMode] Wallet never became ready after", MAX_POLLS * POLL_MS, "ms");
                throw new Error("Wallet took too long to connect — please reload and try again");
            }
            console.error("[HackathonMode] getAddress error:", msg);
            throw err;
        }
    }
    throw new Error("Wallet connection timed out");
}

export function disconnectTestnetWallet(): void {
    _publicKey = null;
    _swkKit = null;
}

// ── Transaction Helpers ─────────────────────────────────────────────────────

/**
 * Build + simulate a Soroban contract call on testnet using the connected
 * SWK wallet as the source account.
 */
export async function buildAndSimulateSwk(
    contractId: string,
    method: string,
    args: any[],
): Promise<{ assembled: any; simResult: any }> {
    if (!_publicKey) throw new Error("Testnet wallet not connected");

    const server = getServer();
    const sourceAccount = await server.getAccount(_publicKey);

    const contract = new Contract(contractId);
    const op = contract.call(method, ...args);

    const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000000",
        networkPassphrase: TESTNET_PASSPHRASE,
    })
        .addOperation(op)
        .setTimeout(300)
        .build();

    const simResult = await server.simulateTransaction(tx);

    if (Api.isSimulationError(simResult)) {
        const errMsg =
            typeof simResult.error === "string"
                ? simResult.error
                : JSON.stringify(simResult.error);
        throw new Error(`Simulation failed: ${errMsg}`);
    }

    const assembled = assembleTransaction(tx, simResult).build();
    return { assembled, simResult };
}

/**
 * Sign a testnet transaction via SWK (Freighter) and submit it.
 */
export async function signAndSubmitSwk(assembled: any): Promise<string> {
    if (!_swkKit || !_publicKey) throw new Error("Testnet wallet not connected");

    // SWK signTransaction expects base64 XDR and returns signed base64 XDR
    const txXdr = assembled.toXDR();
    const { signedTxXdr } = await _swkKit.signTransaction(txXdr, {
        networkPassphrase: TESTNET_PASSPHRASE,
    });

    // Submit signed transaction
    const server = getServer();
    const signedTx = TransactionBuilder.fromXDR(signedTxXdr, TESTNET_PASSPHRASE);
    const sendResult = await server.sendTransaction(signedTx);

    if (sendResult.status === "ERROR") {
        throw new Error(`Transaction submission failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    // Poll for confirmation
    const hash = sendResult.hash;
    console.log("[HackathonMode] Tx submitted:", hash);

    for (let attempt = 0; attempt < 30; attempt++) {
        const result = await server.getTransaction(hash);
        if (result.status === Api.GetTransactionStatus.SUCCESS) {
            console.log("[HackathonMode] Tx confirmed:", hash);
            return hash;
        }
        if (result.status === Api.GetTransactionStatus.FAILED) {
            throw new Error(`Transaction failed on-chain: ${hash}`);
        }
        await new Promise((r) => setTimeout(r, 1000));
    }

    // Return hash even if not confirmed yet (don't block gameplay)
    console.warn("[HackathonMode] Tx not confirmed after 30s, continuing:", hash);
    return hash;
}

// ── Generic Retry Helper ────────────────────────────────────────────────────

/**
 * Execute a hub contract call with automatic retries for `txBadSeq` errors.
 * This is necessary because `server.getAccount` can sometimes return a stale
 * sequence number if the RPC node is lagging behind a recent transaction.
 */
async function executeHubCall(
    method: string,
    args: any[],
    paramsContext: any
): Promise<string> {
    const MAX_RETRIES = 5;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`[HackathonMode] Retry attempt ${attempt}/${MAX_RETRIES} for ${method}...`);
                // Progressive backoff
                const delay = attempt * 1000 + Math.random() * 500;
                await new Promise(r => setTimeout(r, delay));
            }

            const { assembled } = await buildAndSimulateSwk(HUB_CONTRACT_ID, method, args);
            return await signAndSubmitSwk(assembled);

        } catch (err: any) {
            lastError = err;
            const msg = err.message || JSON.stringify(err);

            // Check for Bad Sequence error (txBadSeq / -5)
            // It can appear in various forms depending on where it was caught
            const isBadSeq =
                msg.includes("txBadSeq") ||
                msg.includes("Value: -5") ||
                (err.response?.data?.extras?.result_codes?.transaction === "tx_bad_seq");

            if (isBadSeq) {
                console.warn(`[HackathonMode] Encountered txBadSeq on ${method}. Retrying...`);
                continue; // Loop to rebuild transaction with fresh sequence number
            }

            // If it's not a bad seq error, throw immediately (e.g. user declined sign)
            throw err;
        }
    }

    throw lastError;
}

// ── Game Hub Calls ──────────────────────────────────────────────────────────

export interface HubStartGameParams {
    gameId: string;       // Dungeon contract address (can reuse HUB_CONTRACT_ID as placeholder)
    sessionId: number;    // u32
    player1: string;      // Player 1 testnet address
    player2?: string;     // Player 2 testnet address (defaults to player1 for solo)
    player1Points?: bigint;
    player2Points?: bigint;
}

/**
 * Call start_game() on the game hub contract via SWK.
 */
export async function hubStartGame(params: HubStartGameParams): Promise<string> {
    const player2 = params.player2 || params.player1;
    console.log("[HackathonMode] start_game() →", {
        sessionId: params.sessionId,
        player1: params.player1,
        player2,
    });

    const args = [
        new Address(params.gameId).toScVal(),
        nativeToScVal(params.sessionId, { type: "u32" }),
        new Address(params.player1).toScVal(),
        new Address(player2).toScVal(),
        nativeToScVal(params.player1Points ?? 0n, { type: "i128" }),
        nativeToScVal(params.player2Points ?? 0n, { type: "i128" }),
    ];

    return executeHubCall("start_game", args, params);
}

export interface HubEndGameParams {
    sessionId: number;
    player1Won: boolean;
}

/**
 * Call end_game() on the game hub contract via SWK.
 */
export async function hubEndGame(params: HubEndGameParams): Promise<string> {
    console.log("[HackathonMode] end_game() →", {
        sessionId: params.sessionId,
        player1Won: params.player1Won,
    });

    const args = [
        nativeToScVal(params.sessionId, { type: "u32" }),
        nativeToScVal(params.player1Won, { type: "bool" }),
    ];

    return executeHubCall("end_game", args, params);
}

/**
 * Fund the connected testnet wallet using Friendbot.
 */
export async function fundWithFriendbot(publicKey?: string): Promise<void> {
    const target = publicKey || _publicKey;
    if (!target) throw new Error("Testnet wallet not connected");

    console.log("[HackathonMode] Funding wallet via Friendbot:", target);
    try {
        const resp = await fetch(`https://friendbot.stellar.org/?addr=${target}`);
        const json = await resp.json();
        console.log("[HackathonMode] Friendbot response:", json);
    } catch (e) {
        console.warn("[HackathonMode] Friendbot funding warning:", e);
    }
}
