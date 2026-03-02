<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-02-19
- VERIFICATION_METHOD: [Link check | Claim check]
-->
# ✅ Local Testing Checklist
**Test Everything Before Deploying**

Use this checklist to verify all flows work correctly before pushing to production.

---

## Setup

### 1. Enable Debug Logging
```javascript
// In browser console
smolLogger.setLevel(smolLogLevel.DEBUG);
```

### 2. Clear Previous State
```javascript
// Clear localStorage
localStorage.clear();

// Clear cookies
document.cookie.split(";").forEach(c => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});

// Refresh page
location.reload();
```

---

## Critical Flows to Test

### ✅ Passkey Flow: New User Signup

**Test Steps:**
1. Navigate to `/onboarding/passkey`
2. Click "CREATE NEW ACCOUNT"
3. Enter username
4. Approve passkey creation in browser
   - **Note:** Turnstile is bypassed in dev mode (`isDev` logic in `PasskeySplash.svelte`), only required in production.

**Expected Logs:**
```
[PASSKEY] createWallet: Starting wallet creation
[AUTH] signUp: Creating wallet
[PASSKEY] createWallet: Wallet created successfully
[AUTH] performLogin: Logging in user
[TX] Deploying wallet contract
[TX] Transaction submitted successfully
```

**Expected Behavior:**
- ✅ No splash flash
- ✅ Redirects to home after ~1s
- ✅ User is logged in
- ✅ `localStorage.getItem('smol:contractId')` exists
- ✅ `localStorage.getItem('smol:keyId')` exists
- ✅ Cookie `smol_token` exists

**If Fails:**
- Check PASSKEY logs: `smolLogger.getLogsByCategory(smolLogCategory.PASSKEY)`
- Check AUTH logs: `smolLogger.getLogsByCategory(smolLogCategory.AUTH)`
- Look for user cancellation or device support issues

---

### ✅ Passkey Flow: Existing User Login

**Test Steps:**
1. Ensure you have an existing passkey (use signup flow above)
2. Clear cookies only (not localStorage)
3. Navigate to `/onboarding/passkey`
4. Click "LOGIN WITH PASSKEY"
5. Select existing passkey

**Expected Logs:**
```
[PASSKEY] connectWallet: Connecting with existing passkey
[AUTH] login: Passkey connection successful
[AUTH] performLogin: Logging in user
[WALLET] walletConnected set to true
```

**Expected Behavior:**
- ✅ Passkey picker shows existing credential
- ✅ Login successful
- ✅ Redirects to home
- ✅ No wallet re-deployment needed

**If Fails:**
- RP ID mismatch: Check `getSafeRpId()` output
- Stale keyId: Check WALLET logs for AUTO-BURN
- Wrong passkey selected: User error

---

### ✅ Passkey Flow: Already Authenticated

**Test Steps:**
1. Ensure user is logged in
2. Navigate to `/onboarding/passkey` directly

**Expected Logs:**
```
[AUTH] PasskeySplash: checkAuth() called
[AUTH] PasskeySplash: User already authenticated, redirecting
```

**Expected Behavior:**
- ✅ **NO FLASH** - Splash screen never renders
- ✅ Immediate redirect to home
- ✅ shouldRedirect flag set before render

**If Fails:**
- ⚠️ **CRITICAL BUG** - Splash flash means checkAuth() ran too late
- Check PasskeySplash component initialization order

---

### ✅ Horizon Flow: Account Exists Check

**Test Steps:**
1. Login with existing wallet
2. Open console and run:
```javascript
const { accountExists } = await import('/src/utils/horizon.ts');
await accountExists('CYOUR_CONTRACT_ADDRESS');
```

**Expected Logs:**
```
[HORIZON] accountExists() called
[HORIZON] accountExists: Starting account check
[HORIZON] accountExists: Fetching https://horizon.stellar.org/accounts/C...
[HORIZON] accountExists: Account found (or not found)
[HORIZON] Timer accountExists:C... completed (durationMs: X)
```

**Expected Behavior:**
- ✅ Valid C address: Returns true if account exists
- ✅ New wallet (no txs): Returns false (404)
- ✅ Invalid address: Returns false with warning
- ✅ Performance < 500ms (usually)

**If Fails:**
- Network error: Check internet connection
- Always false: Check Stellar network status
- Takes > 2s: RPC/Horizon latency issue

---

### ✅ Horizon Flow: Operations Scan

**Test Steps:**
1. Login with wallet that has made transactions
2. Open console and run:
```javascript
const { scanAccountOperations } = await import('/src/utils/horizon.ts');
const result = await scanAccountOperations('CYOUR_ADDRESS', { limit: 200, maxPages: 1 });
console.log('Scanned:', result.operationsScanned);
console.log('Transfers:', result.transfers.length);
```

**Expected Logs:**
```
[HORIZON] scanAccountOperations() called
[HORIZON] scanAccountOperations: Checking account existence
[HORIZON] accountExists: Account found
[HORIZON] scanAccountOperations: Starting operations scan
[HORIZON] scanAccountOperations: Fetching page 1
[HORIZON] scanAccountOperations: Page fetched (operationsInPage: X)
[HORIZON] parseTransferOperation: Transfer parsed (if any transfers)
[HORIZON] scanAccountOperations: Scan complete
[HORIZON] Timer scanOps:C... completed (durationMs: X)
```

**Expected Behavior:**
- ✅ New wallet: 0 operations scanned, 0 transfers
- ✅ Wallet with txs: Operations scanned, transfers found
- ✅ No 400 errors in console
- ✅ No 404 errors in console

**If Fails:**
- 400 Bad Request: Address validation failed (CHECK THIS)
- 404: Account doesn't exist (expected for new wallets)
- No transfers found: XDR parsing failed (check logs)

---

### ✅ Upgrade Verification Flow

**Test Steps:**
1. Login with wallet
2. Wait for GlobalVerification to run (automatic on mount)
3. Check console logs

**Expected Logs:**
```
[HORIZON] findTransfersToRecipient() called
[HORIZON] findTransfersToRecipient: Search complete
[SmolMart] Verification complete (in verifyUpgrades.ts)
```

**Expected Behavior:**
- ✅ New wallet: No upgrades found (normal)
- ✅ Wallet with purchases: Upgrades unlocked
- ✅ No console errors
- ✅ No 400 Bad Request errors

**If Fails:**
- 400 Error: Address validation failed before check
- No upgrades detected: XDR parsing issue or wrong amounts
- Multiple parallel calls: Deduplication not working

---

### ✅ Wallet Connection Flow

**Test Steps:**
1. Login successfully
2. Refresh page (don't clear localStorage)
3. Check if wallet auto-reconnects

**Expected Logs:**
```
[WALLET] ensureWalletConnected: Starting wallet connection
[PASSKEY] connectWallet: Reconnecting with keyId
[WALLET] ensureWalletConnected: Wallet connected successfully
```

**Expected Behavior:**
- ✅ Auto-reconnects on page load
- ✅ No user prompt needed
- ✅ walletConnected = true after reconnect

**If Fails - Stale KeyId:**
```
[WALLET] ensureWalletConnected: Failed to connect wallet
[WALLET] clearUserAuth: AUTO-BURN - clearing stale keyId
```
- User changed device/browser
- PassKey was deleted
- RP ID mismatch

---

### ✅ GlobalVerification Flow

**Test Steps:**
1. Login with any wallet
2. Watch console for automatic verification

**Expected Logs:**
```
[VALIDATION] GlobalVerification: Checking address validity
[HORIZON] findTransfersToRecipient() called
[HORIZON] accountExists() called
[HORIZON] accountExists: Account found (or not found)
```

**Expected Behavior:**
- ✅ Runs once on mount
- ✅ Only runs if contractId exists
- ✅ Validates address before calling API
- ✅ No errors if account doesn't exist (new wallet)

**If Fails:**
- Multiple calls: Check for effect dependency issues
- 400 Error: Validation not working
- Never runs: Check if contractId exists

---

## Performance Benchmarks

### Expected Timings (Local Development)

| Operation | Expected Time | Warning Threshold |
|-----------|--------------|-------------------|
| accountExists() | 50-200ms | > 500ms |
| scanAccountOperations() (200 ops) | 200-800ms | > 2000ms |
| findTransfersToRecipient() | 300-1000ms | > 2500ms |
| Passkey creation | 2-5s | > 10s |
| Passkey login | 1-3s | > 5s |
| Wallet reconnect | 500-1500ms | > 3s |

**Check Performance:**
```javascript
smolLogger.getLogs()
    .filter(log => log.duration)
    .map(log => ({
        operation: log.message,
        durationMs: log.duration
    }));
```

---

## Error Scenarios to Test

### ❌ Test: Invalid Contract Address

**Setup:**
```javascript
const { accountExists } = await import('/src/utils/horizon.ts');
await accountExists('INVALID_ADDRESS');
```

**Expected:**
```
[HORIZON] accountExists: Invalid address format
Returns: false
```

### ❌ Test: Empty Address

**Setup:**
```javascript
await accountExists('');
```

**Expected:**
```
[HORIZON] accountExists: Empty address provided
Returns: false
```

### ❌ Test: User Cancels Passkey

**Setup:**
1. Start passkey creation/login
2. Cancel browser prompt

**Expected:**
```
[PASSKEY] User cancelled passkey operation
[AUTH] Login failed: User cancellation
```

**NOT Expected:**
- ❌ Error thrown to user
- ❌ Page crash
- ❌ Silent failure

---

## Regression Tests

### Before Deploying, Test:

- [ ] New passkey signup works
- [ ] Existing passkey login works
- [ ] No splash flash when already authenticated
- [ ] Account existence check doesn't cause 400 errors
- [ ] New wallets (no txs) don't cause errors
- [ ] Upgrade verification works for wallets with purchases
- [ ] Wallet auto-reconnects on page refresh
- [ ] No console errors on any flow
- [ ] Performance is within expected ranges
- [ ] Logs export/download works
- [ ] Can change log level in console

---

## Debug Commands Reference

```javascript
// Enable debug logging
smolLogger.setLevel(smolLogLevel.DEBUG);

// View all Horizon logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);

// Find errors
smolLogger.getLogsByLevel(smolLogLevel.ERROR);

// Export logs
smolLogger.downloadLogs();

// Print summary
smolLogger.printSummary();

// Clear logs
smolLogger.clearLogs();

// Test Horizon utility directly
const { accountExists, scanAccountOperations } = await import('/src/utils/horizon.ts');
await accountExists('CYOUR_ADDRESS');
```

---

## Issue Reporting Template

When you find an issue, capture:

1. **Log level used:** DEBUG or TRACE
2. **Browser:** Chrome/Firefox/Safari version
3. **Environment:** localhost:4321, *.pages.dev, or smol.xyz
4. **Steps to reproduce:** Exact steps
5. **Expected behavior:** What should happen
6. **Actual behavior:** What actually happened
7. **Logs:** `smolLogger.downloadLogs()` output
8. **Console screenshots:** Any errors/warnings
9. **Network tab:** Failed requests (if any)

---

## Success Criteria

Before deploying, all these should be ✅:

- [ ] No console errors on any flow
- [ ] No 400 Bad Request from Horizon
- [ ] No 404 errors (except for new wallets - expected)
- [ ] Passkey flows work without errors
- [ ] Splash screen never flashes when authenticated
- [ ] Wallet auto-reconnects properly
- [ ] Upgrade verification works
- [ ] Performance is acceptable
- [ ] Logs are clear and helpful
- [ ] Can reproduce and debug any issue locally

---

**You're now equipped to test thoroughly before every deployment!** 🚀
