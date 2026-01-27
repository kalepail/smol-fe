# 🎯 SMOL Testing & Debugging System
## Never Deploy Blind Again - Complete Guide

This document summarizes everything you need to test and debug locally before deploying.

---

## What Was Built

### 1. 🔍 Debug Logging System (`src/utils/debug-logger.ts`)
A production-ready logging utility with:
- **5 verbosity levels**: ERROR, WARN, INFO, DEBUG, TRACE
- **8 categories**: AUTH, WALLET, TX, HORIZON, RPC, PASSKEY, BALANCE, VALIDATION
- **Performance timers**: Track operation duration automatically
- **Persistence**: Logs saved to localStorage (survives refresh)
- **Export**: Download logs as JSON or text
- **Console access**: Use `smolLogger` in browser console

### 2. 🌐 Horizon Utility with Logging (`src/utils/horizon.ts`)
Comprehensive Horizon API wrapper with verbose logging:
- `accountExists()` - Check if account exists (logs validation, timing, results)
- `scanAccountOperations()` - Query operations (logs page fetches, transfers, performance)
- `findTransfersToRecipient()` - Find payments (logs search progress, matches)
- All functions log every step with context

### 3. 📖 Documentation
- **DEBUGGING_GUIDE.md** - How to use the logging system
- **LOCAL_TESTING_CHECKLIST.md** - Complete testing procedures
- **PASSKEY_WALLET_TRANSACTION_AUDIT.md** - Reference for all flows

### 4. 🎛️ Debug Panel Component (`src/components/dev/DebugPanel.svelte`)
Visual debug interface with:
- Live log level control
- Real-time stats
- Recent logs viewer
- One-click log download
- State inspection

---

## Quick Setup (5 Minutes)

### Step 1: Add Debug Panel to Your Layout

Edit `src/layouts/Layout.astro`:
```astro
---
import DebugPanel from '../components/dev/DebugPanel.svelte';
// ... other imports
---

<html>
  <head>...</head>
  <body>
    <slot />

    <!-- Add at the end of body -->
    <DebugPanel client:only="svelte" />
  </body>
</html>
```

### Step 2: Start Dev Server
```bash
pnpm dev
```

### Step 3: Open Your Site
- Navigate to `http://localhost:4321`
- Look for green 🐛 button in bottom-right corner
- Click it to open debug panel

### Step 4: Enable Debug Logging
In the debug panel:
- Click **DEBUG** button for detailed logs
- Or click **TRACE** for super verbose logs

---

## Testing Flows (Use the Checklist)

### Open the Checklist
```bash
cat LOCAL_TESTING_CHECKLIST.md
# Or open in your editor
```

### Test Each Flow
1. **New User Signup** - Test passkey creation
2. **Existing User Login** - Test passkey reconnection
3. **Already Authenticated** - Test no splash flash
4. **Account Existence** - Test Horizon API calls
5. **Operations Scan** - Test operations query
6. **Upgrade Verification** - Test purchase detection
7. **Wallet Connection** - Test auto-reconnect

### Check the Logs
After each test:
- Look at debug panel's "Recent Logs"
- Or check browser console
- Download logs if you find issues

---

## Common Issues & Solutions

### Issue: Passkey Splash Flashes

**How to Test:**
1. Login successfully
2. Navigate to `/onboarding/passkey`
3. Watch if splash appears

**Expected:**
- ✅ No flash - redirects immediately
- Logs show: `[AUTH] User already authenticated, redirecting`

**If It Flashes:**
- ❌ Bug in early auth check
- Check logs for timing issues
- Check if `shouldRedirect` flag is set

### Issue: 400 Bad Request from Horizon

**How to Test:**
1. Enable TRACE logging
2. Login with any wallet
3. Check console for 400 errors

**Expected:**
- ✅ No 400 errors
- Logs show: `[HORIZON] accountExists: Account found` or `Account not found (404)`
- 404 is OK for new wallets

**If 400 Errors:**
- ❌ Address validation failed
- Check logs for: `[HORIZON] Invalid address format`
- Check what address is being passed

### Issue: Wallet Won't Connect

**How to Test:**
1. Login successfully
2. Refresh page
3. Check if wallet auto-reconnects

**Expected:**
- ✅ Auto-reconnects silently
- Logs show: `[WALLET] ensureWalletConnected: Wallet connected successfully`

**If Fails:**
- Check for: `[WALLET] clearUserAuth: AUTO-BURN`
- Means passkey is stale (device change, key deleted)
- User needs to login again

---

## Debugging Workflow

### 1. Reproduce the Issue Locally
```javascript
// In browser console
smolLogger.setLevel(smolLogLevel.DEBUG);

// Perform the problematic action

// Check logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
```

### 2. Identify the Problem
Look for:
- **Red (ERROR)** logs - Something failed
- **Yellow (WARN)** logs - Something unexpected
- **Timing issues** - Operations taking too long

### 3. Export the Logs
```javascript
// Download as JSON
smolLogger.downloadLogs('issue-description.json');

// Or copy to clipboard
navigator.clipboard.writeText(smolLogger.exportLogs());
```

### 4. Fix the Issue
- Use the logs to see exact failure point
- Check the audit document for that flow
- Verify fix locally before deploying

---

## Performance Testing

### Check Operation Timings
```javascript
smolLogger.getLogs()
    .filter(log => log.duration)
    .forEach(log => console.log(log.message, `${log.duration}ms`));
```

### Expected Timings
- `accountExists()`: 50-200ms
- `scanAccountOperations()`: 200-800ms
- `findTransfersToRecipient()`: 300-1000ms
- Passkey creation: 2-5s
- Passkey login: 1-3s

### If Slow:
- Check network tab for slow requests
- Check RPC endpoint health
- Consider caching strategies

---

## Before Every Deployment

### Run the Checklist ✅
```bash
# Open checklist
cat LOCAL_TESTING_CHECKLIST.md

# Test each item
[ ] New passkey signup works
[ ] Existing passkey login works
[ ] No splash flash when authenticated
[ ] No 400 errors from Horizon
[ ] Upgrade verification works
[ ] Wallet auto-reconnects
[ ] Performance is acceptable
[ ] No console errors
```

### Export Baseline Logs
```javascript
// Before deployment, capture "good" state
smolLogger.setLevel(smolLogLevel.DEBUG);
// Test all flows
smolLogger.downloadLogs('baseline-before-deploy.json');
```

### After Deployment
1. Test on live site
2. Enable debug logging (`?debug=true` in URL)
3. Compare logs to baseline
4. Look for new errors or warnings

---

## Advanced: Testing Specific Scenarios

### Test Account That Doesn't Exist
```javascript
const { accountExists } = await import('/src/utils/horizon.ts');
await accountExists('CNEW_WALLET_THAT_HASNT_TRANSACTED');
// Should return false (404) without errors
```

### Test Account With Operations
```javascript
const { scanAccountOperations } = await import('/src/utils/horizon.ts');
const result = await scanAccountOperations('CEXISTING_WALLET', { limit: 200 });
console.log('Operations:', result.operationsScanned);
console.log('Transfers:', result.transfers.length);
```

### Test Upgrade Detection
```javascript
const { findTransfersToRecipient } = await import('/src/utils/horizon.ts');
const ADMIN = 'CBNORBI4DCE7LIC42FWMCIWQRULWAUGF2MH2Z7X2RNTFAYNXIACJ33IM';
const result = await findTransfersToRecipient(
    'CYOUR_WALLET',
    ADMIN,
    [100000, 69420.67, 1000000, 250000]
);
console.log('Found upgrades:', Object.fromEntries(result));
```

---

## Console Cheat Sheet

```javascript
// === Log Control ===
smolLogger.setLevel(smolLogLevel.TRACE);  // Super verbose
smolLogger.setLevel(smolLogLevel.DEBUG);  // Detailed
smolLogger.setLevel(smolLogLevel.INFO);   // Default

// === View Logs ===
smolLogger.getLogs();                     // All logs
smolLogger.getLogsByCategory(smolLogCategory.HORIZON);
smolLogger.getLogsByLevel(smolLogLevel.ERROR);

// === Stats ===
smolLogger.printSummary();                // Print stats
smolLogger.getStats();                    // Get stats object

// === Export ===
smolLogger.downloadLogs();                // Download as file
smolLogger.exportLogs();                  // Get as JSON string
smolLogger.exportLogsText();              // Get as text

// === Management ===
smolLogger.clearLogs();                   // Clear all logs

// === Test Utilities Directly ===
const horizon = await import('/src/utils/horizon.ts');
await horizon.accountExists('CYOUR_ADDRESS');
await horizon.scanAccountOperations('CYOUR_ADDRESS', { limit: 200 });
await horizon.clearRequestCache();        // Clear deduplication cache
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/utils/debug-logger.ts` | Core logging system |
| `src/utils/horizon.ts` | Horizon API with logging |
| `src/components/dev/DebugPanel.svelte` | Visual debug UI |
| `DEBUGGING_GUIDE.md` | How to use logging |
| `LOCAL_TESTING_CHECKLIST.md` | Testing procedures |
| `PASSKEY_WALLET_TRANSACTION_AUDIT.md` | Complete flow reference |

---

## Success Metrics

### You'll Know It's Working When:
- ✅ You can reproduce any issue locally
- ✅ Logs tell you exactly what's happening
- ✅ No surprises after deployment
- ✅ Issues are fixed in one iteration
- ✅ No more "deploy and pray"

### Red Flags:
- ❌ Console errors you can't explain
- ❌ Issues that only happen in production
- ❌ Can't reproduce problems locally
- ❌ "Works on my machine"

---

## Next Steps

1. **Add debug panel to layout** (5 min)
2. **Run through checklist once** (30 min)
3. **Fix any issues found** (varies)
4. **Test again to verify** (15 min)
5. **Deploy with confidence** ✅

---

## Support

### When You Need Help:
1. Enable DEBUG or TRACE logging
2. Reproduce the issue
3. Download logs: `smolLogger.downloadLogs()`
4. Share logs + steps to reproduce

### Common Questions:
**Q: Will this slow down production?**
A: No! Default level is INFO (low overhead). Only enable DEBUG/TRACE when debugging.

**Q: Can users see the debug panel?**
A: Only in development or with `?debug=true` query parameter.

**Q: How long are logs stored?**
A: Last 500 logs in localStorage, survives page refresh.

**Q: What if logs fill up storage?**
A: Auto-trims to last 500 entries. Call `clearLogs()` to reset.

---

## You're All Set! 🚀

You now have a complete testing and debugging system. No more deploying blindly!

**Remember:**
- Test locally first (use checklist)
- Enable logging when debugging
- Export logs before clearing
- Share logs when asking for help

Happy debugging! 🐛🔨
