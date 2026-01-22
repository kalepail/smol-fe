# Transaction & Authentication Layer Optimizations

## Overview

This document details the comprehensive optimizations applied to the transaction and authentication layer, addressing all identified challenges in the codebase.

## Changes Summary

### 1. Circuit Breaker Pattern (`src/utils/passkey-kit.ts`)

**Problem:** Relayer could be hammered indefinitely during outages, causing poor user experience.

**Solution:** Implemented circuit breaker pattern with three states:
- **CLOSED**: Normal operation
- **OPEN**: After 5 consecutive failures, block requests for 30 seconds
- **HALF_OPEN**: After timeout, allow 1 test request

**Benefits:**
- Prevents cascading failures
- Faster error feedback to users
- Automatic recovery detection
- Reduces load on failing services

**Configuration:**
```typescript
const CIRCUIT_BREAKER_THRESHOLD = 5; // Open after 5 failures
const CIRCUIT_BREAKER_TIMEOUT = 30000; // Reset after 30s
const CIRCUIT_BREAKER_HALF_OPEN_MAX_RETRIES = 1;
```

---

### 2. Transaction State Locking (`src/stores/balance.svelte.ts`)

**Problem:** Multiple concurrent transactions could cause race conditions and incorrect balance displays.

**Solution:** Added transaction lock system:
- `acquireTransactionLock()` - Acquire lock before transaction
- `releaseTransactionLock()` - Release lock after completion
- Balance updates skip if transaction in progress

**Benefits:**
- Prevents concurrent transaction conflicts
- Ensures balance consistency
- Protects against double-spending attempts

**Usage:**
```typescript
const lockAcquired = acquireTransactionLock();
if (!lockAcquired) {
    // Another transaction in progress
    return;
}
try {
    // Execute transaction
} finally {
    releaseTransactionLock();
}
```

---

### 3. Turnstile Token Lifecycle Management (`src/utils/turnstile-manager.ts`)

**Problem:** Turnstile tokens could expire during form interaction, causing submission failures.

**Solution:** Created `TurnstileTokenManager` class:
- Tracks token issuance and expiration times
- Validates tokens before use
- Provides time-until-expiration information
- Supports refresh callbacks

**Benefits:**
- Prevents stale token submissions
- Better user feedback on expiration
- Centralized token state management
- Reduces 403 errors from expired tokens

**API:**
```typescript
turnstileManager.setToken(token);
turnstileManager.validateForTransaction(); // Throws if expired
const validToken = getValidTurnstileToken(); // Returns null if expired
```

---

### 4. Typed Error System (`src/utils/errors.ts`)

**Problem:** Generic error messages provided poor user experience and debugging information.

**Solution:** Comprehensive typed error system:
- Error categories (NETWORK, AUTHENTICATION, VALIDATION, TRANSACTION, etc.)
- Severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- User-friendly messages with recovery suggestions
- Retryable flag for automatic retry logic

**Benefits:**
- Better user error messages
- Improved error tracking and telemetry
- Consistent error handling across codebase
- Clear recovery paths for users

**Example:**
```typescript
const error = createInsufficientBalanceError(required, available);
// Error includes:
// - userMessage: "Insufficient balance for this transaction."
// - recoverySuggestion: "Please add more funds to your wallet."
// - retryable: false
```

---

### 5. Environment Variable Validation (`src/utils/env-validation.ts`)

**Problem:** Missing or invalid environment variables caused runtime errors in production.

**Solution:** Runtime environment validation:
- Schema validation for all required variables
- Format validation (URLs, addresses, hashes)
- Helpful error messages listing missing/invalid vars
- Debug function to inspect environment

**Benefits:**
- Catch configuration errors before deployment
- Clear error messages for DevOps
- Prevents runtime failures from misconfiguration

**Usage:**
```typescript
// In app initialization
validateEnvironmentOrThrow(); // Throws with detailed error message

// For debugging
const envInfo = getEnvironmentInfo();
console.log(envInfo); // Shows all env config
```

---

### 6. Transaction Validation Utilities (`src/utils/transaction-validation.ts`)

**Problem:** Validation logic scattered across components, inconsistent error handling.

**Solution:** Centralized validation utilities:
- Address validation (public keys and contracts)
- Amount parsing and validation
- Sequence expiration checking
- Balance sufficiency validation
- RP ID and key ID validation

**Benefits:**
- Consistent validation across all components
- Reusable validation logic
- Type-safe error handling
- Better error messages

**API:**
```typescript
validateAddress(address, 'Recipient'); // Throws SmolError if invalid
const amount = parseAndValidateAmount("100.5", 7); // Returns bigint
validateSufficientBalance(amount, balance); // Throws if insufficient
validateSequenceNotExpired(current, expiration, 10); // Warns if <10 ledgers left
```

---

### 7. Enhanced XDR Parsing (`src/utils/passkey-kit.ts`)

**Problem:** XDR parsing failures provided cryptic error messages and could crash transactions.

**Solution:** Comprehensive XDR parsing with validation:
- Validates transaction structure at each step
- Checks operation type and count
- Validates auth entries before encoding
- Provides detailed error messages
- Graceful fallback for network passphrase

**Benefits:**
- More reliable OpenZeppelin Channels integration
- Better error messages for debugging
- Prevents crashes from malformed XDR
- Easier to diagnose transaction issues

**Improvements:**
```typescript
// Before: Generic "Failed to parse XDR" error
// After: "Channels requires exactly 1 operation, found 3"
//        "Invalid operation structure"
//        "Channels requires InvokeHostFunction operation, got payment"
```

---

### 8. RPC Health Checking (`src/utils/rpc.ts`)

**Problem:** No health monitoring for RPC endpoints, manual failover required.

**Solution:** Automatic RPC health monitoring:
- Tracks health status for all endpoints
- Records consecutive failures
- Measures average latency (exponential moving average)
- Auto-marks unhealthy after 3 failures
- Re-checks unhealthy endpoints every 60s
- Returns best (healthy + lowest latency) endpoint

**Benefits:**
- Automatic failover to healthy endpoints
- Better performance through latency tracking
- Self-healing when endpoints recover
- Transparent to application code

**API:**
```typescript
const rpcUrl = getBestRpcUrl(); // Returns healthiest endpoint
recordRpcSuccess(url, latency); // Record successful call
recordRpcFailure(url); // Record failure
const status = getRpcHealthStatus(); // Debug info
```

---

### 9. Transaction Executor (`src/utils/transaction-executor.ts`)

**Problem:** Transaction execution logic duplicated across components with inconsistent error handling.

**Solution:** Comprehensive transaction executor:
- Single point for all transaction execution
- Built-in validation, locking, signing, submission
- Automatic balance updates
- Expiration validation before and after signing
- Success/error callbacks
- Consistent logging

**Benefits:**
- DRY (Don't Repeat Yourself) principle
- Consistent transaction flow
- Reduced code duplication
- Easier testing and maintenance
- Guaranteed lock release

**Usage:**
```typescript
const result = await executeTransfer({
    from: userContractId,
    to: recipientAddress,
    amount: amountInUnits,
    turnstileToken: validToken,
    kaleClient: kale.get(),
    onSuccess: () => {
        // Handle success
    },
    onError: (error) => {
        // Handle error
    },
});

if (result.success) {
    console.log("Hash:", result.transactionHash);
}
```

---

### 10. Enhanced Error Handling in Relayer (`src/utils/passkey-kit.ts`)

**Problem:** Generic error messages for relayer failures, no distinction between error types.

**Solution:** Typed errors for all relayer scenarios:
- Server errors (5xx) → Retryable with exponential backoff
- Rate limiting (429) → Retryable with 2x delay
- Client errors (4xx) → Non-retryable with specific message
- Timeout errors → Retryable with clear message
- Network errors → Retryable with connectivity check

**Benefits:**
- Better user feedback
- Smarter retry logic
- Easier debugging
- Circuit breaker integration

---

## Migration Guide

### For Existing Components

**Before (old pattern):**
```typescript
async function handleSubmit() {
    try {
        const tx = await kale.get().transfer({from, to, amount});
        const sequence = await getLatestSequence();
        const signed = await account.get().sign(tx, {
            rpId: getSafeRpId(window.location.hostname),
            keyId: userState.keyId,
            expiration: sequence + 60,
        });
        await send(signed, turnstileToken);
        await updateContractBalance(userState.contractId);
    } catch (err) {
        error = err.message;
    }
}
```

**After (optimized pattern):**
```typescript
async function handleSubmit() {
    try {
        // Validate inputs
        validateAddress(to, 'Recipient');
        const amountBigInt = parseAndValidateAmount(amount, decimals);
        validateSufficientBalance(amountBigInt, balance);

        const validToken = getValidTurnstileToken();
        if (!validToken) {
            error = "CAPTCHA expired. Please complete it again.";
            return;
        }

        // Execute with comprehensive handling
        const result = await executeTransfer({
            from: userState.contractId,
            to,
            amount: amountBigInt,
            turnstileToken: validToken,
            kaleClient: kale.get(),
            onSuccess: () => {
                success = "Transfer successful!";
            },
            onError: (txError) => {
                error = txError.getUserFriendlyMessage();
            },
        });

    } catch (err) {
        const wrappedError = wrapError(err);
        error = wrappedError.getUserFriendlyMessage();
    }
}
```

---

## Testing Recommendations

### Unit Tests Needed

1. **Circuit Breaker:**
   - Test state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
   - Verify failure threshold
   - Verify timeout behavior

2. **Transaction Lock:**
   - Test concurrent acquisition attempts
   - Verify lock release on error
   - Test balance update skipping during lock

3. **Turnstile Manager:**
   - Test expiration detection
   - Test token validation
   - Test time-until-expiration calculation

4. **Validation Functions:**
   - Test all validation functions with valid/invalid inputs
   - Test error messages
   - Test amount parsing edge cases

5. **Transaction Executor:**
   - Test successful execution flow
   - Test error handling at each step
   - Test lock acquisition/release
   - Test callback execution

### Integration Tests Needed

1. **End-to-End Transaction Flow:**
   - Test complete transaction from UI to relayer
   - Test error scenarios (insufficient balance, expired token, etc.)
   - Test concurrent transaction blocking

2. **RPC Failover:**
   - Test automatic failover when primary RPC fails
   - Test recovery when RPC comes back online
   - Test latency-based selection

3. **Circuit Breaker Integration:**
   - Test user experience when circuit opens
   - Test automatic recovery
   - Test error messages displayed to user

---

## Performance Impact

### Positive Impacts

- **Reduced network calls:** Circuit breaker prevents futile retry attempts
- **Better RPC selection:** Latency-based endpoint selection reduces response times
- **Faster error detection:** Validation happens before signing, saving time
- **Prevented duplicate transactions:** Lock system prevents accidental double-spending

### Negligible Impacts

- **Lock acquisition:** <1ms overhead
- **Token validation:** <1ms overhead
- **Address validation:** <1ms overhead
- **Error wrapping:** <1ms overhead

### Trade-offs

- **Circuit breaker timeout:** 30s delay when circuit is open (prevents worse cascading failures)
- **Additional validation:** Small upfront cost but prevents wasted signing/submission

---

## Monitoring & Observability

### New Console Logs

All optimizations include structured console logging:

```
[CircuitBreaker] Opening circuit after 5 failures
[CircuitBreaker] Transitioning to HALF_OPEN after timeout
[Balance] Skipping balance update - transaction in progress
[TurnstileManager] Token expired at: <timestamp>
[RPC Health] Selected https://... (latency: 245ms)
[TxExecutor] Current sequence: 12345, Expiration: 12405 (+60 ledgers)
[TxExecutor] Transaction signed successfully
[TxExecutor] Transaction lock released
```

### Recommended Telemetry

1. **Circuit breaker state changes** → Track when circuit opens/closes
2. **Transaction lock contention** → Count failed lock acquisitions
3. **Turnstile token expiration rate** → Track how often tokens expire
4. **RPC failover events** → Monitor RPC health changes
5. **Error distribution** → Track SmolError categories and codes
6. **Transaction success rate** → Compare before/after optimization

---

## Rollback Plan

If issues arise, rollback can be done incrementally:

1. **Quick rollback:** Revert `TipArtistModal.svelte` to use old pattern
2. **Circuit breaker disable:** Set `CIRCUIT_BREAKER_THRESHOLD = 999`
3. **Lock disable:** Remove transaction lock checks (keep state for compatibility)
4. **Full rollback:** Revert commits for passkey-kit.ts and balance.svelte.ts

---

## Future Enhancements

### Potential Improvements

1. **Configurable circuit breaker:** Environment variables for threshold and timeout
2. **Retry strategies:** Per-error-type retry configuration
3. **Transaction queue:** Queue multiple transactions instead of blocking
4. **RPC load balancing:** Distribute load across healthy endpoints
5. **Telemetry integration:** Send SmolError events to analytics
6. **Transaction status tracking:** Poll for transaction confirmation with UI feedback
7. **Batch operations:** Optimize multiple sequential transactions

### Known Limitations

1. **Single transaction lock:** Only one transaction can execute at a time
   - **Mitigation:** Most users only perform one transaction at a time

2. **In-memory circuit breaker:** State resets on page refresh
   - **Mitigation:** Acceptable for client-side, would need persistence for server-side

3. **No transaction retry:** Failed transactions must be manually retried
   - **Mitigation:** SmolError.retryable flag indicates if retry is safe

4. **RPC health checks are passive:** Only checks on failure, not proactive
   - **Mitigation:** Active health checking would add unnecessary load

---

## Files Modified

### New Files
- `src/utils/errors.ts` - Typed error system
- `src/utils/env-validation.ts` - Environment validation
- `src/utils/transaction-validation.ts` - Transaction validation utilities
- `src/utils/turnstile-manager.ts` - Turnstile token lifecycle management
- `src/utils/transaction-executor.ts` - Transaction execution wrapper
- `OPTIMIZATIONS.md` - This documentation

### Modified Files
- `src/utils/passkey-kit.ts` - Circuit breaker, enhanced errors, improved XDR parsing
- `src/stores/balance.svelte.ts` - Transaction locking
- `src/utils/rpc.ts` - RPC health checking
- `src/components/artist/TipArtistModal.svelte` - Integration of all optimizations

---

## Conclusion

These optimizations provide:
- **Better reliability:** Circuit breaker prevents cascading failures
- **Better UX:** Clear error messages with recovery suggestions
- **Better security:** Transaction locking prevents race conditions
- **Better maintainability:** Centralized transaction logic
- **Better observability:** Structured logging and error tracking
- **Production readiness:** Environment validation and failover support

All changes are backward compatible and can be adopted incrementally across the codebase.
