# Smol Frontend - Developer Setup Guide

This guide covers special setup steps for working with this forked repository (`tacticalnoot/smol-fe`).

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Access to a Smol account (passkey created on `smol.xyz`)

---

## Quick Start

```bash
# Clone the fork
git clone https://github.com/tacticalnoot/smol-fe.git
cd smol-fe

# Install dependencies
pnpm install

# Start dev server
pnpm run dev
```

The dev server runs on `http://localhost:4322`

---

## 🔐 Localhost Authentication Workaround

### The Problem

Passkeys are **domain-bound** by WebAuthn security. If your passkey was created on `smol.xyz`, it cannot be used on `localhost` because:

- `getDomain('localhost')` returns `null`
- The browser's WebAuthn API requires the `rpId` (relying party ID) to match where the credential was created
- Clicking "Login" on localhost will trigger `navigator.credentials.get()` but fail silently

### The Solution: Cookie Transfer

Since the JWT token is validated by the API (`api.smol.xyz`), not the frontend domain, you can transfer your auth cookie from production to localhost:

#### Method 1: Browser DevTools (Manual)

1. **Login on production**: Go to `https://smol.xyz` and login with your passkey
2. **Copy the cookie**: Open DevTools → Application → Cookies → `smol.xyz` → Copy the `smol_token` value
3. **Set on localhost**: Navigate to `http://localhost:4322`, open DevTools → Console, run:
   ```javascript
   document.cookie = 'smol_token=YOUR_COPIED_TOKEN_HERE; path=/';
   location.reload();
   ```
4. You should now be authenticated on localhost

#### Method 2: Quick JavaScript (One-liner)

If you have both `smol.xyz` and `localhost:4322` open:

```javascript
// Run this in localhost:4322 console after copying token from smol.xyz
document.cookie = `smol_token=${prompt('Paste your smol_token from smol.xyz:')}; path=/`;
location.reload();
```

### Token Expiration

The JWT token has an expiration time. If your localhost session expires, repeat the cookie transfer process.

---

## 🔧 Fork-Specific Configuration

### Environment Variables

This fork uses the **production API** by default. The `.env` file should contain:

```env
PUBLIC_API_URL=https://api.smol.xyz
```

> **Note**: The original `kalepail/smol-fe` may point to a different backend (`smol-be.kalepail.workers.dev`). Ensure you're using the correct API URL for your testing needs.

### Running the Correct Dev Server

If you have multiple `smol-fe` directories (e.g., one in `Mixtape Auto` and one cloned for development), make sure you start the dev server from the **correct directory**:

```bash
# Check which directory you're in
pwd

# Should be your fork, e.g.:
# C:\Users\YourName\path\to\tacticalnoot-smol-fe
```

The dev server output will show which port it's running on (default: 4322).

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

### "Mixtapes not loading" / Network errors to `smol-be.kalepail.workers.dev`

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
