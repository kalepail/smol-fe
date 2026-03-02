export type ProverEnv = {
  url: string;
  apiKey: string;
  timeoutMs: number;
};

function readTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getProverEnv(locals: unknown): ProverEnv {
  // Cloudflare adapter exposes runtime.env on locals. For local dev, fall back to process.env.
  const runtimeEnv = (locals as any)?.runtime?.env;

  const url =
    readTrimmed(runtimeEnv?.PROVER_URL) ||
    readTrimmed(process.env.PROVER_URL) ||
    "";

  const apiKey =
    readTrimmed(runtimeEnv?.PROVER_API_KEY) ||
    readTrimmed(process.env.PROVER_API_KEY) ||
    "";

  const timeoutMsRaw =
    readTrimmed(runtimeEnv?.PROVER_TIMEOUT_MS) ||
    readTrimmed(process.env.PROVER_TIMEOUT_MS) ||
    "";

  const timeoutMs = (() => {
    const n = Number(timeoutMsRaw || "300000");
    if (!Number.isFinite(n) || n <= 0) return 300000;
    return Math.min(Math.max(n, 15000), 60 * 60 * 1000);
  })();

  return { url, apiKey, timeoutMs };
}

export async function proverFetch(env: ProverEnv, path: string, init: RequestInit): Promise<Response> {
  if (!env.url) {
    // Return 200 so browser fetches don't spam the console with 5xx "Failed to load resource"
    // on deployments that intentionally omit the prover service (contest-friendly mode).
    return new Response(
      JSON.stringify({ ok: false, disabled: true, error: "Prover service not configured (missing PROVER_URL)" }),
      {
        status: 200,
      headers: { "Content-Type": "application/json" },
      },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.timeoutMs);

  try {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (env.apiKey) {
      headers.Authorization = `Bearer ${env.apiKey}`;
    }

    const url = `${env.url.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: `Prover request failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}
