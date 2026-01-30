<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Link check | Claim check | State trace]
-->
# 🔍 SMOL Debugging Guide

This guide provides a "Symptom → Fix" cookbook and a manual for the `smolLogger` system.

## 🥣 Symptoms Cookbook

| Symptom | Primary Suspect | Fix / Investigation |
| :--- | :--- | :--- |
| **Login button does nothing** | Passkey Domain Mismatch | Deploy to Cloudflare Pages for full auth testing. Localhost has limitations. |
| **"Account not found (404)"** | New Smart Account | Expected for first-time users. Fund wallet via Swapper or Faucet. |
| **Mixtape list is empty** | API URL Mismatch | Check `PUBLIC_API_URL` in `.env`. Must be `api.smol.xyz`. |
| **Transaction timeouts** | Relayer Latency | Check `RPC` and `AUTH` logs for 429/504 errors. |
| **Audio stutters on iOS** | AudioContext Lock | Ensure playback is triggered by a direct user `click` event. |

---

## 🛠️ smolLogger Manual
**Never Deploy Blind Again**

This guide shows you how to use the comprehensive debug logging system to diagnose issues locally before deploying.

---

## Quick Start: Enable Verbose Logging

### In Browser Console
```javascript
// Set to TRACE level for maximum verbosity
smolLogger.setLevel(smolLogLevel.TRACE);

// Or set to DEBUG for detailed logs without overwhelming output
smolLogger.setLevel(smolLogLevel.DEBUG);

// Default is INFO (errors, warnings, and important info only)
smolLogger.setLevel(smolLogLevel.INFO);
```

**Log Levels:**
- `ERROR` (0) - Only errors
- `WARN` (1) - Errors and warnings
- `INFO` (2) - Errors, warnings, and important info (**default**)
- `DEBUG` (3) - Everything above + debug messages
- `TRACE` (4) - Super verbose - every operation logged

---

## Console Commands

### View Logs
```javascript
// Print summary statistics
smolLogger.printSummary();

// Get all logs
smolLogger.getLogs();

// Filter by category
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
smolLogger.getLogsByCategory(smolLogCategory.AUTH);
smolLogger.getLogsByCategory(smolLogCategory.WALLET);

// Filter by level
smolLogger.getLogsByLevel(smolLogLevel.ERROR);
```

### Export Logs
```javascript
// Download logs as JSON file for sharing
smolLogger.downloadLogs();

// Copy logs to clipboard (formatted text)
console.log(smolLogger.exportLogsText());

// Get as JSON string
console.log(smolLogger.exportLogs());
```

### Manage Logs
```javascript
// Clear all logs
smolLogger.clearLogs();

// Get statistics
smolLogger.getStats();
```

---

## Debugging Specific Issues

### Issue: Passkey Splash Flash
```javascript
// 1. Enable DEBUG level
smolLogger.setLevel(smolLogLevel.DEBUG);

// 2. Refresh page and watch for:
// - AUTH category logs
// - WALLET category logs
// - Check if contractId exists before component mounts

// 3. Filter to relevant logs
smolLogger.getLogsByCategory(smolLogCategory.AUTH);
```

### Issue: 400 Bad Request from Horizon
```javascript
// 1. Enable TRACE level
smolLogger.setLevel(smolLogLevel.TRACE);

// 2. Trigger the operations query (login, check upgrades, etc.)

// 3. Filter Horizon logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);

// Look for:
// - "Invalid contract address" - address validation failed
// - "Account not found (404)" - account doesn't exist yet (expected for new wallets)
// - "Network error" - actual network failure
```

### Issue: Wallet Connection Failures
```javascript
// 1. Enable DEBUG level
smolLogger.setLevel(smolLogLevel.DEBUG);

// 2. Try to connect wallet

// 3. Check logs
smolLogger.getLogsByCategory(smolLogCategory.WALLET);
smolLogger.getLogsByCategory(smolLogCategory.PASSKEY);

// Look for:
// - User cancellation
// - Stale keyId (AUTO-BURN)
// - RP ID mismatches
```

### Issue: Transaction Failures
```javascript
// 1. Enable DEBUG level
smolLogger.setLevel(smolLogLevel.DEBUG);

// 2. Attempt transaction

// 3. Check logs
smolLogger.getLogsByCategory(smolLogCategory.TRANSACTION);
smolLogger.getLogsByCategory(smolLogCategory.RPC);

// Look for:
// - Validation failures
// - Sequence/expiration issues
// - RPC endpoint failures
// - Relayer timeouts
```

---

## Testing Locally

### Test Account Existence Check
```javascript
// Open browser console
const { accountExists } = await import('./src/utils/horizon.ts');

// Test with your address
await accountExists('CYOUR_CONTRACT_ADDRESS_HERE');

// Should log:
// - Validation
// - Account check URL
// - Whether account exists
// - Performance timing
```

### Test Operations Scan
```javascript
const { scanAccountOperations } = await import('./src/utils/horizon.ts');

// Scan your operations
const result = await scanAccountOperations('CYOUR_ADDRESS', {
    limit: 200,
    maxPages: 1
});

console.log('Operations scanned:', result.operationsScanned);
console.log('Transfers found:', result.transfers);

// Check logs for details
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
```

### Test Upgrade Verification
```javascript
// Open browser console on logged-in page
const { verifyPastPurchases } = await import('./src/services/api/verifyUpgrades.ts');

// Test verification
await verifyPastPurchases('CYOUR_ADDRESS');

// Check what was found
console.log('Upgrades:', upgradesState);

// View detailed logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
```

---

## Log Categories

| Category | What It Logs |
|----------|--------------|
| `AUTH` | User authentication, login, signup, Auth Token operations |
| `WALLET` | Wallet connection, ensureWalletConnected, AUTO-BURN |
| `TRANSACTION` | Transaction building, signing, submission |
| `HORIZON` | Horizon API calls, operations queries, XDR parsing |
| `RPC` | RPC endpoint health, calls, responses |
| `PASSKEY` | Passkey creation, connection, WebAuthn operations |
| `BALANCE` | Balance fetching, updates |
| `VALIDATION` | Address validation, amount validation, etc. |
| `GENERAL` | Everything else |

---

## Performance Tracking

All major operations automatically track performance:

```javascript
// Performance timers are logged automatically
// Look for log entries with "durationMs" field

// Example output:
// 🔵 [HORIZON] accountExists: Account found
//   { address: "C...", durationMs: "45.23" }

// Find slow operations
smolLogger.getLogs()
    .filter(log => log.duration && log.duration > 1000)
    .forEach(log => console.log(log.message, log.duration));
```

---

## Sharing Logs for Debugging

### Export and Share
```javascript
// 1. Reproduce the issue with logging enabled
smolLogger.setLevel(smolLogLevel.DEBUG);

// 2. Perform the problematic action

// 3. Download logs
smolLogger.downloadLogs('issue-description.json');

// 4. Share the JSON file
```

### GitHub Issues
When creating an issue, include:
1. Log level used (DEBUG or TRACE)
2. Exported logs (JSON file)
3. Browser console screenshots
4. Steps to reproduce

---

## Common Patterns

### Pattern: New Wallet No History
```
✅ Expected behavior:
[HORIZON] accountExists: Account not found (404)
[HORIZON] scanAccountOperations: Account not found, returning empty
[SmolMart] Verification complete: 0 upgrades found

This is NORMAL for new passkey wallets that haven't made any transactions yet.
```

### Pattern: Stale Passkey
```
❌ Problem:
[WALLET] ensureWalletConnected: Failed to connect wallet
[WALLET] clearUserAuth: AUTO-BURN - clearing stale keyId

User changed device or browser - keyId no longer valid.
Solution: User needs to login again with passkey.
```

### Pattern: Invalid Address
```
❌ Problem:
[HORIZON] accountExists: Invalid address format
[VALIDATION] validateContractAddress: Not a valid C address

Cause: Address is malformed, empty, or not a contract address.
Solution: Check where address is coming from - likely localStorage corruption or prop passing issue.
```

---

## Emergency Debugging

### Issue: Can't Reproduce Locally
1. Set log level to TRACE: `smolLogger.setLevel(smolLogLevel.TRACE)`
2. Have user reproduce issue
3. Download logs: `smolLogger.downloadLogs('user-issue.json')`
4. Send you the JSON file

### Issue: Logs Too Noisy
1. Start with INFO level
2. Only enable DEBUG/TRACE when actively debugging
3. Filter by category: `smolLogger.getLogsByCategory(smolLogCategory.HORIZON)`
4. Filter by level: `smolLogger.getLogsByLevel(smolLogLevel.ERROR)`

### Issue: Need to See Logs from Earlier
Logs persist to localStorage (last 500 entries):
```javascript
// Logs survive page refresh
// Check logs from previous session
smolLogger.getLogs();
```

---

## Tips & Tricks

### Bookmark for Quick Access
```javascript
javascript:(function(){smolLogger.setLevel(4);smolLogger.printSummary();alert('Debug mode enabled!');})();
```

### Auto-Enable on Localhost
Add to your component:
```typescript
if (import.meta.env.DEV) {
    logger.setLevel(LogLevel.DEBUG);
}
```

### Performance Regression Detection
```javascript
// Before code change
const before = smolLogger.getStats();

// After code change
const after = smolLogger.getStats();

// Compare
console.log('Before:', before);
console.log('After:', after);
```

---

## Next Steps

1. **Start with INFO level** (default) - low noise
2. **Enable DEBUG when investigating** - detailed but not overwhelming
3. **Use TRACE only when debugging specific operations** - super verbose
4. **Export logs before clearing** - keep history for comparison
5. **Share logs when asking for help** - context is everything

Happy debugging! 🐛🔨
