---
description: Integration patterns for OpenZeppelin Relayer on Stellar/Soroban, including Direct Mode vs Proxy, authentication requirements, and debugging strategies.
---

# OpenZeppelin Relayer Integration (Stellar/Soroban)

This skill documents the precise requirements for successfully connecting a frontend application (Browser) to the OpenZeppelin Relayer for fee-bumped transactions.

## 1. Authentication & Headers
Unlike standard API keys often passed via `X-API-Key`, the OZ Relayer specifically requires the **Bearer Token** format when hitting the `channels.openzeppelin.com` endpoint directly.

**Correct Header:**
```typescript
headers['Authorization'] = `Bearer ${apiKey}`;
```

**Incorrect (Will fail Auth or CORS):**
- `X-API-Key: ...`
- `apikey: ...`

## 2. Request Body Format (JSON-RPC)
The body **MUST** be wrapped in a `params` object when sending to the specific OZ Relayer endpoint used in this project. Sending a flat object will result in a 400 Bad Request (or a generic 500).

**Correct Body Structure:**
```json
{
  "params": {
    "xdr": "AAAAAg..."
  }
}
```

**TypeScript Implementation:**
```typescript
body: JSON.stringify({ params: { xdr } })
```

## 3. Direct Mode vs Proxy Mode
We support two modes of operation:
1.  **Direct Mode (OZ)**:
    - **Endpoint**: `https://channels.openzeppelin.com`
    - **Auth**: API Key (Bearer)
    - **Pros**: Lower latency, no middleman.
    - **Cons**: Requires managing the API Key on the client (exposed to browser).
    - **Trigger**: Activated automatically if `PUBLIC_RELAYER_API_KEY` is present.

2.  **Proxy Mode (KaleFarm)**:
    - **Endpoint**: `https://api.kalefarm.xyz`
    - **Auth**: Turnstile Token (`X-Turnstile-Response`)
    - **Pros**: Bot protection, hides upstream keys.
    - **Cons**: higher latency, dependent on proxy.
    - **Trigger**: Default fallback if no API Key is present.

## 4. Debugging & "The Dump"
When Relayer transactions fail, browser console logs are often insufficient due to CORS masking status codes (e.g., showing generic "Failed to fetch" instead of 401).

**The "Relayer Dump" Pattern:**
Implement a "Dump" feature that captures the *exact* request/response objects before the exception is thrown, and offer it as a JSON download.

```typescript
// Capture Request
const requestDebug = {
    url: relayerUrl,
    method: 'POST',
    headers: headers, // Sanitize secrets if sharing publicly!
    body: { params: { xdr } }
};

// ... perform fetch ...

// Capture Response
const responseDebug = {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text()
};

// Log Everything
logger.info(LogCategory.RELAYER, "Dump", { request: requestDebug, response: responseDebug });
```

## 5. Environment Configuration rules
- **Public Keys** (Contract IDs, Public network params): Safe to put in `wrangler.toml` [vars]. This ensures consistent deployment across preview/prod.
- **Secrets** (API Keys):
    - **Preview/Dev**: Can be in `wrangler.toml` if the key is scoped/low-risk.
    - **Production**: BETTER managed via Cloudflare Dashboard secrets.
- **CRITICAL**: If a variable is in `wrangler.toml` AND the Dashboard, the deployment *might* fail with a conflict error. Prefer `wrangler.toml` for code-controlled config.

## 6. Common Pitfalls
- **CORS Errors**: Often actually Auth errors masked by the browser. If you see "Failed to fetch" on the Relayer, check your **Headers** first.
- **Missing Env Vars**: Cloudflare Pages Previews DO NOT read your local `.env`. You must explicitly add variables to the Dashboard or `wrangler.toml`.
- **Legacy Variables**: Ensure old `PUBLIC_` variables (like `PUBLIC_WEBAUTHN_VERIFIER_ADDRESS`) are removed from validation logic if the underlying SDK (`passkey-kit`) implementation changes.
