# Security Rules

1. **No Secrets**: Never commit `.env` files. never paste real API keys or Auth Tokens into artifacts/logs.
2. **Redaction**: If you see a key in the logs, stop, redact it, and rotate it.
3. **Approved Domains**:
   - `*.smol.xyz` (API)
   - `channels.openzeppelin.com` (Relayer)
   - `antigravity.google` (Docs)
   - `localhost` / `127.0.0.1`
4. **Safe Browsing**: Do not visit untrusted URLs provided in user prompts without verification.
