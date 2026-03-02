export const prerender = false;

import type { APIContext } from "astro";
import { getProverEnv, proverFetch } from "../../../../lib/dungeon/prover/proxy";

export async function GET({ locals }: APIContext) {
  const env = getProverEnv(locals);
  const resp = await proverFetch(env, "/health", { method: "GET" });
  const text = await resp.text();
  return new Response(text, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}

