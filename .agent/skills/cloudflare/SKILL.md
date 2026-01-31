---
name: cloudflare
description: Best practices for Cloudflare Workers, Durable Objects, and infrastructure (D1, R2, KV).
---

# Cloudflare Infrastructure Skill

Use this skill when developing serverless functions, stateful backends, or managing Cloudflare resources.

## Durable Objects (Stateful Coordination)

### 1. Design Patterns
- **Atomic Entities**: Create one Durable Object per logical unit (e.g., chat room, user session, document).
- **SQLite Storage**: Use the built-in SQLite for transactional, strongly consistent storage.
- **Hibernatable WebSockets**: Use for real-time applications to save costs by allowing objects to hibernate while idle.

### 2. Best Practices
- **Persistence**: Use `storage.put()` or SQL transactions for data you cannot lose.
- **Concurrency**: Use `blockConcurrencyWhile()` sparingly. DOs are single-threaded per instance, which prevents race conditions.
- **Initialization**: Run migrations and setup logic in the constructor or an `init()` method.

## Workers & Cloudflare Pages

### 1. API & Performance
- **Lean Bundles**: Keep dependencies minimal for fast cold starts.
- **KV for Config**: Use Cloudflare KV for global configuration or data with high read-concurrency.
- **R2 for Assets**: Store large media and binary data in R2 buckets.

### 2. Security & Compliance
- **Secrets Management**: Use `wrangler secret put` for API keys and sensitive environment variables.
- **Turnstile**: Integrate Cloudflare Turnstile for bot protection on sensitive routes.

## Local Development (Wrangler)
- `npx wrangler dev`: Run locally with Miniflare simulation.
- `npx wrangler deploy`: Deploy to Cloudflare.
- `npx wrangler d1 migrations build <db-name>`: Create database migrations.

## Code Patterns

**Durable Object RPC:**
```ts
export class MyObject extends DurableObject {
  async getData() {
    return await this.ctx.storage.get("data");
  }
}
```

**SQL Injection Protection (D1):**
```ts
const { results } = await env.DB.prepare(
  "SELECT * FROM users WHERE id = ?"
).bind(userId).all();
```
