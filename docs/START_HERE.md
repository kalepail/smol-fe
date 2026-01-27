# 🚀 START HERE - Local Testing Guide

**Everything is now set up for local testing!** Follow these steps:

---

## Step 1: Start the Dev Server (2 minutes)

```bash
pnpm dev
```

The server should start at `http://localhost:4321`

> [!IMPORTANT]
> **Authentication Note:** Passkeys require a secure context (HTTPS). On `localhost`, you can test UI and general logic, but for full Passkey/Stellar flows, we recommend deploying your fork to **Cloudflare Pages** (Free Tier). This gives you a `*.pages.dev` domain with built-in HTTPS, which is the easiest way to test authentication accurately. See **[Authentication Strategy](DEVELOPER_SETUP.md#authentication-strategy)**.

---

## Step 2: Open Your Browser

1. Navigate to **http://localhost:4321**
2. Look for a **green 🐛 button** in the bottom-right corner
3. Click it to open the Debug Panel

---

## Step 3: Enable Debug Logging

In the Debug Panel:
- Click the **DEBUG** button to enable detailed logging
- Or click **TRACE** for super verbose logging

**Alternative:** Open browser console (F12) and run:
```javascript
smolLogger.setLevel(smolLogLevel.DEBUG);
```

---

## Step 4: Test the Flows

### Test 1: Check Horizon Logging
```javascript
// In browser console (F12)
const { accountExists } = await import('/src/utils/horizon.ts');

// Test with a real address (use your own if you have one)
await accountExists('CBXBJCOZRGGGMRT3JNUPJG5N75AIX5ETMH7FD2RJ7RHH5XQSMOL7WZ2X');

// Check the logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
```

You should see logs like:
```
🔵 [HORIZON] accountExists() called
🔵 [HORIZON] accountExists: Starting account check
🔵 [HORIZON] accountExists: Account not found (404)
```

### Test 2: Create New Passkey
1. Navigate to `/onboarding/passkey`
2. Click "CREATE NEW ACCOUNT"
3. Enter a username
4. Complete passkey creation
5. Watch the Debug Panel for logs

Expected logs:
```
[PASSKEY] createWallet: Starting
[AUTH] signUp: Creating wallet
[TX] Transaction submitted
```

### Test 3: Check for PasskeySplash Flash
1. Make sure you're logged in
2. Navigate directly to `/onboarding/passkey`
3. **Watch carefully** - the splash should NOT appear at all

Expected:
- ✅ Immediate redirect to home
- ✅ No flash of the splash screen

If you see a flash:
- ❌ BUG - Check logs for timing issues

### Test 4: Check for 400 Errors
1. Open browser console (F12)
2. Go to Console tab
3. Login or refresh page
4. Look for any red "400 Bad Request" errors

Expected:
- ✅ NO 400 errors
- ✅ Only 404 errors (normal for new wallets)

---

## Step 5: Export Logs (If Issues Found)

```javascript
// In browser console
smolLogger.downloadLogs('test-results.json');
```

This downloads a JSON file with all logs. 

> [!TIP]
> **Rapid Debugging:** You can copy the contents of these logs (or the summary from the console) and paste them directly into your AI Coding Agent. Tell the agent: *"Here are my logs, help me sort through the errors and find the root cause."* This is often the fastest way to debug complex Stellar or state-management issues.

---

## Quick Console Commands

```javascript
// === Log Control ===
smolLogger.setLevel(smolLogLevel.TRACE);  // Super verbose
smolLogger.setLevel(smolLogLevel.DEBUG);  // Detailed
smolLogger.setLevel(smolLogLevel.INFO);   // Default

// === View Logs ===
smolLogger.getLogs();                      // All logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
smolLogger.getLogsByCategory(smolLogCategory.AUTH);
smolLogger.getLogsByCategory(smolLogCategory.WALLET);
smolLogger.getLogsByLevel(smolLogLevel.ERROR);

// === Export ===
smolLogger.downloadLogs();                 // Download as file
smolLogger.printSummary();                 // Print stats

// === Test Utilities ===
const horizon = await import('/src/utils/horizon.ts');
await horizon.accountExists('CYOUR_ADDRESS');
await horizon.scanAccountOperations('CYOUR_ADDRESS', { limit: 200 });
```

---

## What to Look For

### ✅ GOOD Signs:
- Debug panel appears in bottom-right
- Logs show in console with colors/emojis
- No 400 errors
- No PasskeySplash flash when authenticated
- Performance < 1 second for most operations

### ❌ BAD Signs:
- 400 Bad Request errors
- PasskeySplash flashes
- Console errors you can't explain
- Operations taking > 3 seconds

---

## 🤖 Working with AI Agents

This repository is optimized for AI-assisted development. If you are stuck or want to build features faster, we recommend using an **AI Coding Agent**:

- **[Antigravity](https://antigravity.google)** (Highly Recommended): Designed specifically for deep repository context and complex refactors.
- **[Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code)**: Great for terminal-based iteration and surgical fixes.

**How to use them:**
1. Provide the agent with the relevant parts of the `docs/` folder (especially `STATE_OF_WORLD.md` and `REPO_MAP.md`).
2. Ask for specific implementations (e.g., *"Add a new Svelte component for music filtering"*).
3. Use the agents to analyze console logs (see Step 5 above).

---

## Detailed Testing Checklist

For a complete step-by-step checklist, see:
```bash
cat docs/LOCAL_TESTING_CHECKLIST.md
\`\`\`

For debugging help, see:
\`\`\`bash
cat docs/DEBUGGING_GUIDE.md
```

---

## Common Issues

### Issue: Debug Panel Doesn't Appear
**Solution:** Make sure dev server is running and you're on localhost

### Issue: Logs Not Showing
**Solution:** Enable debug level:
```javascript
smolLogger.setLevel(smolLogLevel.DEBUG);
```

### Issue: Import Errors
**Solution:** Make sure path starts with `/src/`:
```javascript
// ✅ Correct
const { accountExists } = await import('/src/utils/horizon.ts');

// ❌ Wrong
const { accountExists } = await import('src/utils/horizon.ts');
```

---

## Next Steps

1. ✅ Start dev server: `pnpm dev`
2. ✅ Open localhost:4321
3. ✅ Enable DEBUG logging
4. ✅ Test each flow
5. ✅ Export logs if issues found
6. ✅ Fix any issues
7. ✅ Deploy with confidence!

---

**You're all set!** 🎉

Open your browser, start testing, and watch the logs tell you exactly what's happening!
