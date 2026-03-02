import type { APIRoute } from "astro";
import { Keypair } from "@stellar/stellar-sdk";

import { verifyChallengeTx } from "../../../../lib/the-vip/auth";
import { initDb, getDb } from "../../../../lib/the-vip/db";

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;

  try {
    const env = (locals as any).runtime?.env;
    if (!env?.DB) {
      return new Response("Server not configured (missing DB binding)", {
        status: 500,
      });
    }

    const body = (await request.json()) as {
      xdr?: string;
      address?: string;
      zkProof?: unknown;
    };

    if (body.zkProof) {
      // This endpoint previously attempted server-side Noir proof verification. It was incomplete and
      // is intentionally disabled to avoid "pretend proofs" and false security claims.
      return new Response(JSON.stringify({ error: "ZK auth is not supported" }), {
        status: 501,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!body.xdr || !body.address) {
      return new Response(JSON.stringify({ error: "Invalid auth request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serverSecret = env?.CHAT_SERVER_SECRET || process.env.CHAT_SERVER_SECRET;
    if (!serverSecret) {
      return new Response(JSON.stringify({ error: "Missing CHAT_SERVER_SECRET" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serverKeypair = Keypair.fromSecret(serverSecret);
    const networkPassphrase =
      env?.PUBLIC_NETWORK_PASSPHRASE ||
      process.env.PUBLIC_NETWORK_PASSPHRASE ||
      "Public Global Stellar Network ; September 2015";

    const result = await verifyChallengeTx(
      body.xdr,
      body.address,
      networkPassphrase,
      serverKeypair.publicKey(),
    );

    if (!result.valid) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    const db = await getDb(env);
    await initDb(db);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        type TEXT DEFAULT 'wallet',
        expires_at INTEGER NOT NULL
      );
    `);

    await db
      .prepare("INSERT INTO sessions (token, address, type, expires_at) VALUES (?, ?, ?, ?)")
      .bind(token, body.address, "wallet", expiresAt)
      .run();

    return new Response(JSON.stringify({ token, address: body.address }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Chat auth verify error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

