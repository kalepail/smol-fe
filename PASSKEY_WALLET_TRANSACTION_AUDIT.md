# COMPREHENSIVE PASSKEY, WALLET & TRANSACTION AUDIT
**Last Updated:** 2026-01-23
**Purpose:** Persistent reference for all authentication, wallet, and transaction operations

---

## TABLE OF CONTENTS
1. [Passkey Operations](#1-passkey-operations)
2. [Wallet Actions & Connection Management](#2-wallet-actions--connection-management)
3. [Transaction Building, Signing & Submission](#3-transaction-building-signing--submission)
4. [Horizon API Calls](#4-horizon-api-calls)
5. [RPC Calls](#5-rpc-calls)
6. [User Authentication & Session Management](#6-user-authentication--session-management)
7. [Address Validation](#7-address-validation)
8. [Error Handling Gaps & Opportunities](#8-error-handling-gaps--opportunities)
9. [Critical Reference Checklists](#9-critical-reference-checklists)
10. [Priority Improvements](#10-priority-improvements-needed)

---

## 1. PASSKEY OPERATIONS

### 1.1 Primary Passkey Management
**File:** `src/utils/passkey-kit.ts`

#### Lines 21-32: `getAccount()` - Lazy initialization
- **What it does:** Creates PasskeyKit singleton with RPC URL, network passphrase, wallet WASM hash, 60s timeout
- **What could go wrong:** Missing env vars, RPC connection failure, timeout on complex transactions
- **Current validation:** None on initialization
- **Improvements needed:** Add env var validation, connection health check
- **Related:** Used by all transaction signing operations

#### Lines 129-440: `send()` - Transaction relay with circuit breaker
- **What it does:** Sends transactions via KaleFarm relayer or OZ Channels with retry logic, timeout protection, circuit breaker
- **What could go wrong:** Relayer downtime, network failures, XDR parsing errors, Turnstile token issues
- **Current validation:**
  - Circuit breaker (5 failures → open, 30s reset)
  - Hostname verification for dev environments
  - XDR structure validation
- **Improvements needed:** Better error categorization for user feedback, metrics/telemetry
- **Related:** All transaction submissions flow through this

### 1.2 Passkey Authentication Hook
**File:** `src/hooks/useAuthentication.ts`

#### Lines 19-40: `login()` - Connect existing wallet
- **What it does:** Calls `account.get().connectWallet()` with safe RP ID, performs JWT login via API
- **What could go wrong:** Passkey not found, user cancellation, API failure, cookie domain issues
- **Current validation:** RP ID calculation via `getSafeRpId()`, keyId base64 encoding
- **Improvements needed:** Retry logic for API calls, better error messages

#### Lines 81-105: `signUp()` - Create new wallet
- **What it does:** Creates new passkey wallet with resident key requirement, submits signed deploy transaction via relayer
- **What could go wrong:** Device doesn't support platform authenticator, transaction relay failure, username conflicts
- **Current validation:** Turnstile token required, resident key enforcement
- **Improvements needed:** Check `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` before attempting

### 1.3 User State Management
**File:** `src/stores/user.svelte.ts`

#### Lines 83-103: `ensureWalletConnected()` - Lazy wallet connection
- **What it does:** Connects PasskeyKit wallet with saved keyId for targeted reconnection
- **What could go wrong:** Stale keyId, device/browser change, passkey deleted
- **Current validation:** AUTO-BURN pattern - clears auth on failure
- **Improvements needed:** Add retry with user prompt before burning auth
- **Related:** Critical for all wallet operations after page reload

### 1.4 Passkey Components

#### `src/components/onboarding/PasskeySplash.svelte`
**Lines 11-32:** Early authentication check to prevent flash
- **What it does:** Synchronously checks auth on component initialization, sets shouldRedirect flag
- **What could go wrong:** Race condition if state updates during check
- **Current validation:** Checks both contractId and skip flag
- **Status:** ✅ Fixed (2026-01-23)

**Lines 181-221:** `handleSmartLogin()` - Smart login/create flow
- **What it does:** Attempts login first, falls back to intro on cancellation
- **What could go wrong:** User confusion if login fails silently, multiple prompts
- **Current validation:** Distinguishes cancellation from real errors
- **Improvements needed:** Better visual feedback, explain error types

**Lines 223-243:** `submitUsername()` - Create new passkey
- **What it does:** Calls signUp with username and Turnstile token
- **What could go wrong:** Turnstile timeout, duplicate username, network failure
- **Current validation:** Turnstile required unless in dev mode with API key
- **Improvements needed:** Username validation (length, characters), availability check

#### `src/components/retention/PasskeyReprompt.svelte`
- **Purpose:** Re-prompts users to create passkey after skip
- **What could go wrong:** Annoyance if shown too frequently
- **Improvements needed:** Better frequency capping, dismissal persistence

---

## 2. WALLET ACTIONS & CONNECTION MANAGEMENT

### 2.1 Wallet Connection
**File:** `src/stores/user.svelte.ts`

#### Lines 83-103: `ensureWalletConnected()` - Primary connection method
- **What it does:** Lazy-loads passkey-kit, connects with RP ID and keyId
- **What could go wrong:** Stale keyId from different device/browser
- **Current validation:** AUTO-BURN on failure clears auth
- **Improvements needed:** Prompt user before burning, offer re-authentication

### 2.2 Wallet State
**File:** `src/stores/user.svelte.ts`

#### Lines 11-19: User state object
- **State:** `{ contractId, keyId, walletConnected }`
- **Persistence:** Synced to localStorage on all updates

#### Lines 29-45: Setters
- `setContractId(id)` - Sets state + localStorage
- `setKeyId(id)` - Sets state + localStorage
- `setUserAuth(contractId, keyId)` - Sets both atomically

#### Lines 64-75: `clearUserAuth()` - Soft logout
- **What it does:** Clears state but keeps contractId/keyId in localStorage
- **What could go wrong:** User expects full logout, data persists unexpectedly
- **Improvements needed:** Document soft logout behavior, add option for hard logout

### 2.3 Components with Wallet Checks

#### `src/components/artist/TipArtistModal.svelte`
**Lines 54-73:** Mount-time wallet connection check
- **What it does:** Ensures wallet connected before allowing tips
- **What could go wrong:** Modal opens but wallet connection fails
- **Current validation:** Calls `ensureWalletConnected()` on mount
- **Improvements needed:** Loading state during connection

#### `src/components/labs/SwapperCore.svelte`
**Lines 197-232:** `handleEnter()` - Connect or ensure connected
- **What it does:** Smart connect (new passkey) or reconnect (existing)
- **What could go wrong:** Connection failure not shown to user
- **Current validation:** Alert on error
- **Improvements needed:** Better UX for connection states

---

## 3. TRANSACTION BUILDING, SIGNING & SUBMISSION

### 3.1 Transaction Executor (Comprehensive Wrapper)
**File:** `src/utils/transaction-executor.ts`

#### Lines 74-221: `executeTransaction()` - Main transaction wrapper
**What it does:**
1. Validates authentication (contractId, keyId)
2. Acquires transaction lock (prevents concurrent txs)
3. Runs custom pre-validation
4. Fetches latest ledger sequence
5. Calculates expiration (default 60 ledgers = ~5 min)
6. Signs transaction with passkey
7. Validates expiration before submission
8. Submits via relayer
9. Updates balance after success

**What could go wrong:**
- Lock not released on error
- Sequence drift during signing
- Balance update failure

**Current validation:**
- ✅ Comprehensive - auth, lock, address, amount, sequence, turnstile
- ✅ Lock released in finally block
- ✅ SmolError typed errors with user-friendly messages

**Improvements needed:**
- Add metrics/telemetry
- Timeout on signing step

**Related:** Used by transfer operations, should be used by all transaction flows

#### Lines 226-259: `executeTransfer()` - Transfer-specific wrapper
- **What it does:** Validates transfer params, builds transfer tx, executes via executeTransaction
- **What could go wrong:** Invalid addresses, insufficient balance
- **Current validation:** Address validation (StrKey), amount validation (positive bigint), balance check
- **Related:** Used by tip modal, KALE transfers

### 3.2 Transaction Validation
**File:** `src/utils/transaction-validation.ts`

#### Lines 14-34: `validateAddress()` - Stellar address validation
- **Accepts:** G... (accounts) and C... (contracts)
- **Uses:** StrKey from Stellar SDK (canonical)

#### Lines 39-56: `validateContractAddress()` - Contract-only validation
- **Accepts:** Only C... addresses

#### Lines 60-73: `validateAmount()` - Amount validation
- **Validates:** Positive bigint

#### Lines 78-93: `validateSufficientBalance()` - Balance check
- **Validates:** Balance >= amount

#### Lines 101-118: `validateSequenceNotExpired()` - Sequence/expiration check
- **What it does:** Checks current sequence vs expiration with buffer (default 10 ledgers)
- **Buffer:** Prevents race conditions during submission

#### Lines 126-181: `parseAndValidateAmount()` - Parse user input to bigint
- **What it does:** Parses decimal input, validates format, converts to token units
- **What could go wrong:** Precision loss, overflow on very large numbers
- **Current validation:** Regex validation, decimal places check
- **Improvements needed:** Max amount validation

#### Lines 207-255: Passkey-specific validators
- `validateKeyId()` - KeyId format check
- `validateRpId()` - RP ID domain validation
- `validateTurnstileToken()` - Turnstile token check

### 3.3 Minting Operations

#### `src/utils/mint.ts`
**Lines 21-85:** `createMintTransaction()` - Build mint transaction
- **What it does:** Creates smol-sdk client, builds coin_it transaction, signs with passkey
- **What could go wrong:** Invalid salt, asset code issues, signing failure
- **Current validation:** Salt length check (must be 32 bytes)
- **Improvements needed:** Validate creator address, fee rule validation

#### `src/hooks/useMixtapeMinting.ts`
**Lines 84-213:** `mintBatch()` - Batch mint up to 3 tracks
- **What it does:** Prepares arrays for coin_them, signs, submits, polls for completion
- **What could go wrong:** Partial batch failure, polling timeout, Turnstile single-use issue
- **Current validation:** Salt validation, fee rule calculation
- **Error handling:** Polls each track independently
- **Improvements needed:** Turnstile refresh for multi-batch

**Lines 215-351:** `mintAllTracks()` - Multi-batch minting with retry
- **What it does:** Chunks tracks into batches of 3, processes sequentially, retries failures
- **What could go wrong:** Turnstile expiration after first batch, user cancellation mid-flow
- **Current validation:** Distinguishes cancellation from errors, continues on non-critical failures
- **Error handling:** Retry logic (1 retry), continues on failure, reports errors via callback
- **Improvements needed:** Turnstile refresh mechanism (getFreshToken callback exists but may not be wired)

### 3.4 Purchase Operations

#### `src/hooks/useMixtapePurchase.ts`
**Lines 18-74:** `purchaseBatch()` - Buy up to 3 tokens
- **What it does:** Calls swap_them_in on smol-sdk, signs, submits, polls for verification
- **What could go wrong:** Relayer timeout, polling failure
- **Current validation:** None beyond SDK
- **Error handling:** Timeout recovery via polling
- **Improvements needed:** Validate token addresses, check balance before purchase

**Lines 76-154:** `purchaseTracksInBatches()` - Multi-batch purchasing
- **What it does:** Chunks purchases into batches of 3, gets fresh Turnstile tokens
- **What could go wrong:** Turnstile fetch failure mid-batch
- **Current validation:** Fresh token fetch between batches
- **Error handling:** Fails fast on Turnstile error
- **Improvements needed:** Better error messages

### 3.5 Trade Execution

#### `src/hooks/useTradeExecution.ts`
**Lines 122-182:** `executeSwap()` - Execute swap via aggregator
- **What it does:** Gets quote, builds distribution, creates NULL_ACCOUNT tx, signs with passkey, submits
- **What could go wrong:** Invalid distribution, protocol ID mismatch, quote staleness
- **Current validation:** Distribution structure validation, protocol ID mapping
- **Error handling:** Basic try/catch, no retry
- **Improvements needed:** Quote freshness check, slippage validation

### 3.6 Mixtape Support Payments

#### `src/hooks/useMixtapeSupport.ts`
**Lines 128-217:** `sendSupportPayment()` - Multi-recipient payment
- **What it does:** Calculates split (30% curator, 50% artists, 20% minters), sends sequential transfers
- **What could go wrong:** Partial payment failure, Turnstile exhaustion, balance changes between payments
- **Current validation:** Balance check, payment aggregation by address
- **Error handling:** User cancellation detection, fresh Turnstile between payments
- **Improvements needed:** Atomic payment (all or nothing), better progress feedback

### 3.7 KALE Transfers

#### `src/hooks/useKaleTransfer.ts`
**Lines 45-62:** `executeTransfer()` - Simple KALE transfer
- **What it does:** Builds transfer, signs, submits, updates balance
- **What could go wrong:** Balance not updated on failure
- **Current validation:** ❌ None (relies on caller)
- **Error handling:** ❌ None
- **⚠️ Improvements needed:** Use executeTransaction wrapper from transaction-executor.ts

### 3.8 Components with Transaction Flows

#### `src/components/artist/TipArtistModal.svelte`
**Lines 111-211:** `handleSend()` - Tip transaction flow
- **What it does:** Validates, uses executeTransfer from transaction-executor, handles success/error
- **What could go wrong:** Address locked but changes reactively (mitigated by lockedArtistAddress)
- **Current validation:** ✅ Comprehensive - uses transaction-executor wrapper
- **Error handling:** ✅ SmolError-aware, user-friendly messages
- **Status:** Well implemented

#### `src/components/MintTradeModal.svelte`
**Lines 307-377:** `executeSwap()` - Trade modal swap
- **What it does:** Validates amount, checks Turnstile, calls executeSwap hook, refreshes balances
- **What could go wrong:** Quote staleness, insufficient balance between validation and execution
- **Current validation:** Amount, balance, Turnstile
- **Error handling:** User-friendly messages
- **Improvements needed:** Lock balance during swap, quote age check

#### `src/components/labs/SwapperCore.svelte`
**Lines 348-583:** `executeSwap()` - Comprehensive swap with C/G address support
- **What it does:**
  - Builds transaction (C-address via swap-builder, G-address via Soroswap API)
  - Signs with passkey
  - Submits with timeout recovery (calculates hash before submit, polls network on timeout)
- **What could go wrong:** Transaction relay timeout, hash mismatch, user cancellation
- **Current validation:** Provider selection, C/G address detection
- **Error handling:** ✅ Timeout recovery via direct network polling, cancellation detection
- **Status:** ✅ Production-quality reference implementation

**Lines 585-732:** `executeSend()` - XLM/KALE send with timeout recovery
- Similar pattern to swap, includes same timeout recovery

---

## 4. HORIZON API CALLS

### 4.0 Unified Horizon Utility (NEW)
**File:** `src/utils/horizon.ts`

This is a comprehensive utility module that consolidates all Horizon API operations across the codebase. All Horizon calls should use these utilities.

#### `accountExists(address: string): Promise<boolean>`
- **What it does:** Checks if account/contract exists on Stellar network
- **Validation:** Accepts both G (account) and C (contract) addresses, validates with StrKey
- **Deduplication:** Uses inflightRequests Map to prevent parallel requests for same address
- **Error handling:** Returns false on network errors, logs warnings for invalid addresses
- **Status:** ✅ Production-ready

#### `scanAccountOperations(address, options): Promise<OperationsScanResult>`
- **What it does:** Scans operations for an account with pagination support
- **Features:**
  - Automatic account existence check (returns empty if not found)
  - Parses XDR for transfer operations
  - Supports pagination (maxPages parameter)
  - Can stop early via stopAtTransfer callback
  - Request deduplication
- **Options:**
  - `limit`: Operations per page (default 200)
  - `includeFailedTransactions`: Include failed txs (default false)
  - `maxPages`: Max pages to scan (default 1)
  - `stopAtTransfer`: Callback to stop early when transfer found
- **Returns:** `{ transfers, operationsScanned, hasMore }`
- **Status:** ✅ Production-ready

#### `findTransfersToRecipient(address, recipient, amounts, options): Promise<Map<number, boolean>>`
- **What it does:** Convenience method to find specific payment patterns
- **Use case:** Verifying purchases/upgrades by looking for specific amounts
- **Features:**
  - Automatically stops when all amounts found (efficient)
  - Can filter by contract address (token type)
  - Amount matching with 0.1 tolerance
- **Status:** ✅ Production-ready, used by verifyUpgrades and badges API

#### `parseTransferOperation(op): ParsedTransfer | null`
- **What it does:** Parses XDR from Horizon operation to extract transfer details
- **Returns:** `{ from, to, amount, contractAddress, functionName }`
- **Error handling:** Returns null on parse errors (not all ops are parseable)
- **Status:** ✅ Production-ready

### 4.1 Upgrade Verification
**File:** `src/services/api/verifyUpgrades.ts` (Refactored 2026-01-23)

#### Lines 46-87: Unified verification using Horizon utility
- **What it does:** Uses `findTransfersToRecipient()` to scan for admin payments
- **Validation:** ✅ Uses shared Horizon utility with deduplication
- **Error handling:** ✅ Proper error handling via utility
- **Benefits:** -43% code reduction, no duplicate XDR parsing
- **Status:** ✅ Refactored (2026-01-23)

### 4.2 Badge Verification API
**File:** `src/pages/api/artist/badges/[address].ts` (Refactored 2026-01-23)

#### Lines 73-106: Unified verification using Horizon utility
- **What it does:** Uses `findTransfersToRecipient()` to scan for admin payments
- **Additional:** 5-minute cache for badge status
- **Validation:** ✅ Uses shared Horizon utility with deduplication
- **Fixed:** Was using asset_balance_changes (classic assets) instead of XDR parsing (Soroban)
- **Benefits:** -23% code reduction, correct Soroban XDR parsing
- **Status:** ✅ Refactored (2026-01-23)

---

## 5. RPC CALLS

### 5.1 RPC Configuration
**File:** `src/utils/rpc.ts`

#### Lines 8-12: RPC endpoint options
- Ankr RPC
- Official Stellar RPC
- PublicNode RPC

#### Lines 41-79: `checkRpcHealth()` - Health checking
- **What it does:** POSTs getHealth request, tracks latency and failures
- **What could go wrong:** False positives on slow networks
- **Current validation:** 5s timeout, tracks consecutive failures
- **Improvements needed:** Exponential backoff on failures

#### Lines 84-93: `recordRpcFailure()` - Mark endpoint unhealthy
- **Threshold:** 3 consecutive failures → unhealthy

#### Lines 98-110: `recordRpcSuccess()` - Clear failure count, update latency

#### Lines 116-141: `getBestRpcUrl()` - Select best endpoint
- **What it does:** Filters healthy endpoints, sorts by latency
- **What could go wrong:** All endpoints unhealthy → returns primary anyway
- **Improvements needed:** Exponential backoff before retry

### 5.2 Base RPC Operations
**File:** `src/utils/base.ts`

#### Lines 9-17: RPC server initialization

#### Lines 22-31: `getLatestSequence()` - Get current ledger sequence
- **What it does:** Calls server.getLatestLedger()
- **What could go wrong:** Network failure, RPC down
- **Current validation:** ❌ None
- **Error handling:** ❌ Generic error message
- **⚠️ Improvements needed:** Retry logic, fallback RPC
- **Related:** Used by all transaction expiration calculations

#### Lines 43-58: `pollTransaction()` - Poll for transaction confirmation
- **What it does:** Polls getTransaction every 2s for up to 90s
- **What could go wrong:** Transaction failed but not detected, polling timeout
- **Current validation:** Checks status === "SUCCESS"
- **Error handling:** Throws on timeout
- **⚠️ Improvements needed:** Return failure status, check for specific errors
- **Related:** Used by timeout recovery in SwapperCore, batch operations

### 5.3 Contract Interactions

#### `src/utils/passkey-kit.ts`
- PasskeyKit internally uses RPC for:
  - Contract simulation
  - Transaction preparation
  - Auth entry generation

#### `src/stores/balance.svelte.ts`
**Lines 51-74:** `updateContractBalance()` - Get KALE balance
- **What it does:** Calls kale.get().balance({ id: address })
- **What could go wrong:** RPC failure, contract not found
- **Current validation:** Transaction lock check (skips if tx in progress)
- **Error handling:** Sets balance to null on error
- **Improvements needed:** Retry logic

**Lines 79-99:** `updateXlmBalance()` - Get XLM balance (same pattern)

### 5.4 Simulation Operations

#### `src/utils/swap-builder.ts`
**Lines 180-189:** `server.simulateTransaction()` - Simulate swap
- **What it does:** Simulates aggregator swap to get auth entries and resource costs
- **What could go wrong:** Simulation error (insufficient balance, bad route), RPC failure
- **Current validation:** Checks isSimulationError
- **Error handling:** Throws on error
- **Improvements needed:** Parse simulation error for user-friendly message

---

## 6. USER AUTHENTICATION & SESSION MANAGEMENT

### 6.1 Authentication Hook
**File:** `src/hooks/useAuthentication.ts`

#### Lines 19-40: `login()` - Passkey login
- **What it does:** Connects wallet, calls /login API with passkey response
- **API:** `${API_URL}/login` POST with type: 'connect', keyId, contractId, response
- **What could go wrong:** API failure, JWT generation error, cookie domain issues
- **Current validation:** None on API response
- **Error handling:** Throws on API error
- **Improvements needed:** Validate JWT before storing, handle expired responses

#### Lines 43-79: `performLogin()` - JWT creation and cookie storage
- **What it does:** Calls /login API, stores JWT in cookie with domain/secure settings
- **What could go wrong:** Cookie not set (domain mismatch), insecure cookie on https
- **Current validation:** Uses tldts getDomain for cookie domain
- **Error handling:** Throws on API error
- **Improvements needed:** Verify cookie was set, handle cookie restrictions

#### Lines 81-105: `signUp()` - Create wallet and login
- **What it does:** Creates wallet with resident key, calls performLogin, submits deploy transaction
- **What could go wrong:** Passkey creation fails, login succeeds but transaction fails
- **Current validation:** Resident key required, user verification required
- **Error handling:** Throws on any step failure
- **Improvements needed:** Rollback on transaction failure

#### Lines 107-142: `logout()` - Clear session
- **What it does:** Clears userState, removes cookie, calls /logout API, preserves contractId/keyId (soft logout)
- **What could go wrong:** Cookie not removed, API call fails, localStorage clears more than expected
- **Current validation:** Filters localStorage keys to preserve contractId/keyId
- **Error handling:** None on API call
- **Improvements needed:** Hard logout option, confirm cookie removal

### 6.2 User State
**File:** `src/stores/user.svelte.ts`

#### Lines 8-9: Load from localStorage on init
- **What could go wrong:** Stale data, tampered data
- **Current validation:** None
- **Improvements needed:** Validate format, check against cookie

#### Lines 11-19: Reactive state
- `contractId`, `keyId`, `walletConnected`

#### Lines 29-59: Setters with localStorage sync

#### Lines 64-75: `clearUserAuth()` - Soft logout
- **Design:** Keeps credentials for "wallet remembered" experience
- **What could go wrong:** User expects full logout
- **Improvements needed:** Document behavior, add hard logout option

### 6.3 Onboarding Guard
**File:** `src/components/onboarding/OnboardingGuard.svelte`

#### Lines 11-32: Redirect unauthenticated users
- **What it does:** Checks server auth, client auth, localStorage flags, cookie
- **What could go wrong:** Race condition between checks, cookie exists but state doesn't
- **Current validation:** Multiple checks (server, client, localStorage, cookie)
- **Improvements needed:** Consolidate checks, single source of truth

### 6.4 Session Persistence

#### Storage Locations
- **JWT:** Cookie `smol_token` with domain, secure, sameSite: Lax, 30-day expiration
- **localStorage:** `smol:contractId`, `smol:keyId` (persists across logout for soft logout)
- **sessionStorage:** Not used for auth

#### What could go wrong
- Cookie/localStorage out of sync
- JWT expired but localStorage valid

#### Improvements needed
- JWT refresh mechanism
- Sync state on mismatch

---

## 7. ADDRESS VALIDATION

### 7.1 Primary Validation Utilities
**File:** `src/utils/transaction-validation.ts`

#### Lines 14-34: `validateAddress()` - General address validation
- **Uses:** StrKey.isValidEd25519PublicKey() and StrKey.isValidContract()
- **Accepts:** G... (accounts) and C... (contracts)
- **What could go wrong:** None - SDK is canonical
- **Used by:** All transfer operations

#### Lines 39-56: `validateContractAddress()` - Contract-only validation
- **Accepts:** Only C... addresses
- **Used by:** Contract-specific operations

### 7.2 Type Checking
**File:** `src/utils/swap-builder.ts`

#### Lines 272-282: `isCAddress()`, `isGAddress()`
- **What it does:** Simple string prefix check
- **What could go wrong:** False positives if address is malformed
- **Improvements needed:** Combine with StrKey validation

#### Lines 236-240: Path address validation in distribution
- **What it does:** Regex check `/^[GC][A-Z2-7]{55}$/`
- **What could go wrong:** Rejects valid addresses with different encoding
- **⚠️ Improvements needed:** Use StrKey instead of regex

### 7.3 RP ID Validation
**File:** `src/utils/domains.ts`

#### Lines 12-33: `getSafeRpId()` - Calculate WebAuthn RP ID
**Logic:**
- Localhost → "localhost"
- smol.xyz subdomains → "smol.xyz" (FORCED shared root)
- Otherwise → uses tldts getDomain, blocks shared suffixes (pages.dev, vercel.app)

**What could go wrong:** Passkeys created on different RP ID can't be used
**Current validation:** Blocklist for known shared domains
**Improvements needed:** Document RP ID decisions, warn users on shared domains
**Related:** Critical for passkey compatibility across subdomains

### 7.4 Components with Address Validation

#### `src/components/artist/TipArtistModal.svelte`
**Lines 47-52:** Address locking pattern
- **What it does:** Locks address at mount to prevent reactive changes mid-transaction
- **Validation:** StrKey check in derived state
- **What could go wrong:** Address prop changes after lock
- **Current mitigation:** Locked at mount, not reactive
- **Status:** ✅ Good pattern

#### `src/services/api/verifyUpgrades.ts`
**Lines 24-38:** Address validation for upgrade verification
- **What it does:** Checks not empty, trimmed, valid contract format
- **Validation:** StrKey.isValidContract()
- **What could go wrong:** G address passed instead of C
- **Current handling:** Warns and returns early
- **Improvements needed:** Accept both types, convert G to C if needed
- **Status:** ✅ Fixed (2026-01-23)

---

## 8. ERROR HANDLING GAPS & OPPORTUNITIES

### 8.1 Comprehensive Error System
**File:** `src/utils/errors.ts`

#### Lines 8-24: Error categories and severity levels
- Network, Authentication, Validation, Transaction, ContractExecution, RelayerTimeout, CircuitBreaker, etc.

#### Lines 38-94: `SmolError` class
- User-friendly messages
- Recovery suggestions
- Retryability flags
- Severity levels

#### Lines 100-273: Error factory functions
- `createNetworkError()`
- `createAuthenticationError()`
- `createValidationError()`
- etc.

#### Lines 278-325: `wrapError()` - Convert unknown errors to SmolError

#### Lines 330-353: `logError()` - Severity-based logging

**Strengths:**
- ✅ Comprehensive error typing
- ✅ User-friendly messages separated from technical messages
- ✅ Retryability flagged
- ✅ Recovery suggestions

**Gaps:**
- ❌ Not used consistently across codebase
- ❌ Some files use raw try/catch with generic messages
- ❌ No error reporting/telemetry integration

### 8.2 Files with Good Error Handling

#### ✅ `src/utils/transaction-executor.ts`
- Uses SmolError throughout
- Wraps all errors with context
- Always releases lock in finally block
- Calls onError callbacks

#### ✅ `src/components/artist/TipArtistModal.svelte`
- Uses SmolError-aware error handling
- Calls getUserFriendlyMessage()
- Distinguishes error types

#### ✅ `src/components/labs/SwapperCore.svelte`
- Timeout recovery via polling
- User cancellation detection
- Fallback to direct submission on Turnstile failure

### 8.3 Files with Error Handling Gaps

#### ❌ `src/hooks/useKaleTransfer.ts`
- No error handling in executeTransfer
- Doesn't use SmolError
- **Fix:** Refactor to use executeTransaction wrapper

#### ⚠️ `src/hooks/useMixtapePurchase.ts`
- Timeout recovery but no user feedback
- Continues on error but doesn't report partial failures clearly
- **Fix:** Return result summary with success/failure counts

#### ⚠️ `src/hooks/useMixtapeMinting.ts`
- Retry logic but no exponential backoff
- Turnstile single-use issue not fully solved
- **Fix:** Implement getFreshToken callback wiring

#### ❌ `src/utils/base.ts`
- Generic error messages in getLatestSequence
- pollTransaction doesn't distinguish failure types
- **Fix:** Use SmolError, parse transaction failure reasons

#### ⚠️ `src/stores/balance.svelte.ts`
- Silent failure on balance update
- No retry logic
- **Fix:** Add exponential backoff retry, emit events on failure

#### ❌ `src/utils/like.ts`
- Minimal error handling
- No SmolError usage
- **Fix:** Add proper error types, retry logic

### 8.4 Common Patterns Needing Improvement

1. **Network Failures:** Many RPC/API calls don't have retry logic
2. **Balance Staleness:** Balance updated after tx but not validated before
3. **Quote Staleness:** No age check on swap quotes
4. **Partial Batch Failures:** Multi-batch operations don't always report partial success clearly
5. **Turnstile Expiration:** Single-use token issue in multi-step flows
6. **Lock Leaks:** Some operations don't use transaction lock
7. **Missing Telemetry:** No error reporting to backend for monitoring

---

## 9. CRITICAL REFERENCE CHECKLISTS

### 9.1 PASSKEY OPERATIONS CHECKLIST
- [ ] Always use `getSafeRpId(hostname)` for RP ID
- [ ] Check `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` before signup
- [ ] Use `ensureWalletConnected()` after page reload before transactions
- [ ] Handle user cancellation gracefully (check for "abort", "cancel", "not allowed")
- [ ] Require resident key for new wallets
- [ ] Convert keyId to base64 URL-safe format
- [ ] Store in localStorage: contractId, keyId
- [ ] Store in cookie: JWT with proper domain/secure/sameSite

### 9.2 WALLET CONNECTION CHECKLIST
- [ ] Check `userState.contractId && userState.keyId` before operations
- [ ] Call `ensureWalletConnected()` at app initialization if authenticated
- [ ] Handle AUTO-BURN on stale keyId (re-prompt login)
- [ ] Don't block UI while connecting wallet
- [ ] Show connection status to user

### 9.3 TRANSACTION CHECKLIST
- [ ] Acquire transaction lock (prevents concurrent transactions)
- [ ] Validate authentication (contractId, keyId)
- [ ] Validate inputs (address, amount, balance)
- [ ] Get latest sequence number
- [ ] Calculate expiration (current + 60 ledgers default)
- [ ] Validate Turnstile token (unless dev environment)
- [ ] Sign transaction with passkey (handle cancellation)
- [ ] Validate expiration before submission (sequence drift check)
- [ ] Submit via relayer with timeout/retry
- [ ] Handle timeout recovery (poll network directly)
- [ ] Update balance after success
- [ ] Release transaction lock in finally block
- [ ] Use SmolError for all errors
- [ ] Provide user-friendly error messages

### 9.4 HORIZON API CHECKLIST
- [ ] Check account exists before querying operations (404 is normal for new accounts)
- [ ] Limit query results (default 200)
- [ ] Handle pagination for complete history
- [ ] Parse XDR in try/catch (ignore parse errors)
- [ ] Cache results where appropriate (with TTL)
- [ ] Handle rate limiting (429)

### 9.5 RPC CHECKLIST
- [ ] Use health-checked RPC endpoint (`getBestRpcUrl()`)
- [ ] Handle RPC failures (record with `recordRpcFailure()`)
- [ ] Retry on transient failures
- [ ] Fallback to secondary RPC on failure
- [ ] Use AbortController for timeouts
- [ ] Poll for transaction confirmation after submission
- [ ] Check transaction status (don't assume success)

### 9.6 ADDRESS VALIDATION CHECKLIST
- [ ] Use StrKey for validation (not regex)
- [ ] Accept both G (accounts) and C (contracts) where appropriate
- [ ] Validate before transaction build
- [ ] Lock address in components to prevent reactive changes
- [ ] Trim whitespace before validation
- [ ] Reject empty/null addresses

### 9.7 ERROR HANDLING CHECKLIST
- [ ] Use SmolError for all errors
- [ ] Provide user-friendly messages (userMessage)
- [ ] Include recovery suggestions
- [ ] Mark errors as retryable/non-retryable
- [ ] Log with appropriate severity
- [ ] Distinguish user cancellation from real errors
- [ ] Always release resources in finally blocks
- [ ] Don't swallow errors silently
- [ ] Report critical errors to monitoring system (TODO)

### 9.8 MULTI-BATCH OPERATION CHECKLIST
- [ ] Chunk operations (max 3 per batch)
- [ ] Get fresh Turnstile token between batches
- [ ] Handle partial failures (continue processing)
- [ ] Retry failed batches (with limit)
- [ ] Don't retry user cancellations
- [ ] Poll for completion after each batch
- [ ] Report progress to user
- [ ] Return summary (successes/failures)

### 9.9 BALANCE MANAGEMENT CHECKLIST
- [ ] Skip balance update if transaction in progress
- [ ] Update balance after transaction success
- [ ] Don't fail transaction if balance update fails
- [ ] Validate balance before transaction
- [ ] Handle race conditions (balance changes between validation and execution)
- [ ] Show loading state during balance fetch

---

## 10. PRIORITY IMPROVEMENTS NEEDED

### 10.1 CRITICAL (Blocking Issues)
1. **Turnstile Multi-Batch:** Wire up getFreshToken callback in multi-batch operations
2. **Transaction Lock Adoption:** Refactor all transaction operations to use executeTransaction wrapper
3. **RPC Retry Logic:** Add retry with exponential backoff to getLatestSequence
4. **Polling Failure Detection:** Make pollTransaction return failure status, not just timeout

### 10.2 HIGH (User Experience)
5. **Error Messages:** Replace all generic errors with SmolError
6. **Quote Staleness:** Add age check on swap quotes (reject if > 30s old)
7. **Balance Validation:** Check balance immediately before transaction submission
8. **Partial Batch Reporting:** Clear UI feedback for partial batch successes
9. **Passkey Re-auth:** Prompt user to re-authenticate before AUTO-BURN on stale keyId

### 10.3 MEDIUM (Robustness)
10. ~~**Horizon Pagination:** Scan all operations for upgrade verification~~ ✅ **DONE** - Horizon utility supports pagination via maxPages parameter
11. **RPC Failover:** Implement automatic failover on RPC failure
12. **JWT Refresh:** Add token refresh before expiration
13. **Telemetry:** Add error reporting to monitoring system
14. **Hard Logout:** Add option for full logout (clear all stored data)

### 10.4 LOW (Nice to Have)
15. **Metrics:** Add transaction timing/success rate metrics
16. **Simulation Error Parsing:** Parse simulation errors for better user messages
17. **Address Type Conversion:** Support G→C conversion where needed
18. **Cookie Verification:** Verify cookie was set after login

---

## RECENT FIXES

### 2026-01-23: Passkey Splash Flash & Operations API Validation
- **Fixed:** PasskeySplash briefly appearing then disappearing when user already authenticated
  - Added early authentication check on component initialization
  - Wrapped template in `{#if !shouldRedirect}` conditional
  - Files: `src/components/onboarding/PasskeySplash.svelte`

- **Fixed:** 400 Bad Request errors from Horizon operations endpoint
  - Added StrKey validation in GlobalVerification before calling API
  - Added StrKey validation in verifyUpgrades before building URL
  - Added StrKey validation in badge API endpoint
  - Files: `src/components/GlobalVerification.svelte`, `src/services/api/verifyUpgrades.ts`, `src/pages/api/artist/badges/[address].ts`

- **Fixed:** Account existence check before querying operations
  - Prevents 400 errors when querying operations for accounts that don't exist on network yet
  - New passkey wallets don't exist until first transaction
  - Files: `src/services/api/verifyUpgrades.ts`, `src/pages/api/artist/badges/[address].ts`

### 2026-01-23: Unified Horizon API Utility
- **Created:** Comprehensive Horizon utility module `src/utils/horizon.ts` (260 lines)
  - `accountExists()` - Account existence check with deduplication
  - `scanAccountOperations()` - Operations query with pagination support
  - `findTransfersToRecipient()` - Convenience method for payment verification
  - `parseTransferOperation()` - XDR parsing for contract invocations
  - Request deduplication via inflightRequests Map

- **Refactored:** `src/services/api/verifyUpgrades.ts`
  - Reduced from 156 lines to 88 lines (-43%)
  - Removed ~70 lines of duplicate XDR parsing
  - Now uses shared Horizon utility

- **Refactored:** `src/pages/api/artist/badges/[address].ts`
  - Reduced from 193 lines to 149 lines (-23%)
  - Fixed incorrect use of asset_balance_changes (classic assets) → now uses XDR parsing (Soroban)
  - Now uses shared Horizon utility
  - Removed ~40 lines of duplicate/incorrect code

- **Benefits:**
  - DRY principle - single source of truth for Horizon operations
  - Automatic request deduplication prevents parallel fetches
  - Pagination support (expandable via maxPages parameter)
  - More robust error handling
  - Better testability (can mock horizon.ts)
  - ~110 lines of duplicate code eliminated

---

## MAINTENANCE INSTRUCTIONS

### When Adding New Transaction Flows
1. Use `executeTransaction()` wrapper from `src/utils/transaction-executor.ts`
2. Follow checklist in section 9.3
3. Add to this document under section 3 (Transaction Building)

### When Adding New API Calls
1. **Horizon API:** Use utilities from `src/utils/horizon.ts`
   - Use `accountExists()` to check if account exists
   - Use `scanAccountOperations()` for general operations queries
   - Use `findTransfersToRecipient()` for payment verification
   - Never duplicate XDR parsing logic
2. Use StrKey validation for all addresses
3. Add to relevant section (4 for Horizon, 5 for RPC)

### When Modifying Authentication
1. Update section 6 (User Authentication)
2. Verify RP ID calculation in `src/utils/domains.ts`
3. Test across all domains (localhost, dev, prod, subdomains)

### When Finding Bugs
1. Add to "RECENT FIXES" section with date
2. Update relevant checklist
3. Run through all checklists to find similar issues

---

**END OF AUDIT**
