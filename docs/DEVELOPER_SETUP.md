<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Link check | Claim check]
-->
# Smol Frontend - Developer Setup Guide

This guide covers setup steps for working with the **Smol-FE** codebase. All technical constraints (ports, versions) are defined in the [STATE OF WORLD](STATE_OF_WORLD.md).

---

## Prerequisites

- **Node.js**: `22.21.1` (See [SSOT](STATE_OF_WORLD.md))
- **pnpm**: `10.18.1` (`npm install -g pnpm`)
- **mkcert**: Optional, for local HTTPS support.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kalepail/smol-fe.git
cd smol-fe

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

The dev server runs on `http://localhost:4321` by default.

### Authentication Strategy
Passkeys are domain-bound and require a secure context.
1. **General Dev**: Use `http://localhost:4321`. Authentication features will be limited.
2. **Full Auth Test**: Deploy your fork to **Cloudflare Pages**. This is the easiest way to test Passkeys accurately.
3. **Local Auth (Advanced)**: Use the "Cookie Transfer" method below if you need to test authentication logic on your machine.

---

## 🔐 Localhost Authentication (The "Cookie Transfer")

Passkeys are **domain-bound**. To authenticate locally, you must transfer your auth cookie from production:

1. **Login on production**: [smol.xyz](https://smol.xyz).
2. **Copy the cookie**: Open DevTools → Application → Cookies → `smol.xyz` → Copy `smol_token`.
3. **Set on dev host**: Open [https://noot.smol.xyz](https://noot.smol.xyz), run in Console:
   ```javascript
   document.cookie = `smol_token=${prompt('Paste smol_token:')}; domain=.smol.xyz; path=/`;
   location.reload();
   ```
   > [!TIP]
   > Setting the domain to `.smol.xyz` ensures the cookie is shared correctly across subdomains.


---

## 🔧 Fork-Specific Configuration

### Environment Variables

This fork uses the **production API** by default. The `.env` file should contain:

```env
PUBLIC_API_URL=https://api.smol.xyz
```

> **Note**: The official production backend is `https://api.smol.xyz`. Ensure you're using the correct API URL for your testing needs.

### Running the Correct Dev Server

If you have multiple `smol-fe` directories (e.g., one in `Mixtape Auto` and one cloned for development), make sure you start the dev server from the **correct directory**:

```bash
# Check which directory you're in
pwd

# Should be your fork, e.g.:
# C:\Users\YourName\path\to\tacticalnoot-smol-fe
```

The dev server output will show which port it's running on (default: 4321).

---

## 🎵 Mixtape Editing Feature

### Edit Mode

The mixtape editor supports both **creating** and **editing** mixtapes:

- **Create**: Click "+ Mixtape" button → Build your mixtape → Publish
- **Edit**: Navigate to your mixtape → Click "Edit Mixtape" (only visible if you're the creator) → Modify → Save Changes

### Track Reordering

Tracks can be reordered via drag-and-drop. The reordered list is sent to the API on save.

### Safe Save (API Only)

The "Save Changes" button for existing mixtapes uses a `PUT /mixtapes/:id` API call. This **does not** trigger any blockchain/wallet interactions - it only updates metadata in the database.

---

## 🐛 Common Issues

### "Mixtapes not loading" / Network errors

**Cause**: Wrong API URL configured  
**Fix**: Ensure `PUBLIC_API_URL=https://api.smol.xyz` in your `.env` file and restart the dev server

### Login button does nothing on localhost

**Cause**: Passkey domain mismatch (see Authentication Workaround above)  
**Fix**: Transfer your `smol_token` cookie from production

### "Edit Mixtape" button not visible

**Cause**: You're not logged in as the mixtape creator  
**Fix**: Ensure your logged-in wallet address matches the mixtape's `creator` field

---

## 📦 Related Repositories

| Repo | Description |
|------|-------------|
| [tacticalnoot/smol-fe](https://github.com/tacticalnoot/smol-fe) | This frontend fork |
| [tacticalnoot/smol-workflow](https://github.com/tacticalnoot/smol-workflow) | Backend API (Cloudflare Worker) |
| [kalepail/smol-fe](https://github.com/kalepail/smol-fe) | Original frontend |
| [kalepail/smol-workflow](https://github.com/kalepail/smol-workflow) | Original backend |

---

## 📝 Notes for Future Development

- The backend `PUT /mixtapes/:id` endpoint includes **ownership verification** - only the original creator can edit
- Mixtape track order is stored as a comma-separated string of smol IDs in the database
- Cache is purged after updates via `purgeMixtapesCache()`
