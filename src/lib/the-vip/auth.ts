import type { D1Database } from "@cloudflare/workers-types";
import { Keypair, Networks, WebAuth } from "@stellar/stellar-sdk";

/**
 * Validates a SEP-0010 challenge transaction.
 */
export async function verifyChallengeTx(
    challengeXdr: string,
    clientAddress: string,
    networkPassphrase: string,
    serverAddress: string
) {
    try {
        WebAuth.verifyChallengeTxSigners(
            challengeXdr,
            serverAddress,
            networkPassphrase,
            [clientAddress],
            ["smol.xyz"],
            "smol.xyz",
        );
        return { valid: true };

    } catch (e: any) {
        return { valid: false, error: e.message };
    }
}

export function buildChallenge(serverSecret: string, clientAddress: string, networkPassphrase: string) {
    const serverKeypair = Keypair.fromSecret(serverSecret);
    return WebAuth.buildChallengeTx(
        serverKeypair,
        clientAddress,
        'smol.xyz', // Domain
        networkPassphrase === Networks.PUBLIC ? 300 : 300,
        networkPassphrase,
        'smol.xyz', // webAuthDomain
    );
}

export async function getSession(request: Request, db: D1Database) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];

    // Check DB
    // We assume `initDb` has run at least once globally or we catch error
    // Simple query
    try {
        const session = await db.prepare('SELECT address, expires_at FROM sessions WHERE token = ?').bind(token).first();
        if (!session) return null;

        if (Date.now() > (session.expires_at as number)) {
            // cleanup?
            return null;
        }
        return { address: session.address as string };
    } catch (e) {
        console.error("Session check failed", e);
        return null;
    }
}
