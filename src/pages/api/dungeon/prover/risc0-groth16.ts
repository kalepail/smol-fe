export const prerender = false;

import type { APIContext } from "astro";
import { getProverEnv, proverFetch } from "../../../../lib/dungeon/prover/proxy";

export async function POST({ request, locals }: APIContext) {
  const env = getProverEnv(locals);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resp = await proverFetch(env, "/risc0-groth16", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

