# Research: XLM Handling in Contracts & Soroswap Integration

**Objective:** Determine if an Artist's C-Address (Soroban Contract) can hold native XLM and if we can swap via Soroswap without a proprietary API key.

## 1. Native XLM in Contracts (SAC)
**Can a C-Address hold XLM?**
Yes.

**Mechanism:**
- Native XLM on Soroban is represented by the **Stellar Asset Contract (SAC)**.
- It is a built-in token contract that wraps the native XLM logic.
- A "C-Address" (smart contract) holds XLM balances within this SAC, just like any other method (approvals, transfers).

**Implication for Labs:**
- We can send XLM *to* a contract.
- The contract must have logic to *receive* or *manage* it (usually just holding it is fine if it doesn't need to spend it actively).
- **Crucial:** Transfers to a C-Address are NOT `payment` operations. They are `invoke_contract` operations calling `transfer` on the Native XLM SAC.
- **Address Format:** We must ensure we are sending to the `Address` type (which supports both G-keys and C-keys), not just an AccountId.

## 2. Soroswap without API Keys
**Is it possible?**
Yes.

**Approach:**
- **Router Contract:** Soroswap exposes a Router contract (similar to Uniswap V2).
- **Function:** `swap_exact_tokens_for_tokens` (or similar).
- **Data Source:** We do NOT need the Soroswap Backend API to execute the trade. We only need it if we want "smart routing" (finding the best path) or historical data.
- **Direct Swap:** For a simple `XLM -> TOKEN` pool, we can call the pool or router directly.
- **Simulation:** We can use `rpc.simulateTransaction` to estimate the output amount (`min_out`) before submitting, removing the need for an off-chain price API.

**Safe Ralph Plan:**
1.  **Simulate:** User inputs "10 XLM". We simulate the swap transaciton against the Router/Pool.
2.  **Display:** Show the result "You will get ~500 SMOL".
3.  **Execute:** If user accepts, sign and send the transaction.

## 3. Allowlist & Security
- **Contract Addresses:** We will hardcode the Mainnet/Testnet addresses for:
    - Native XLM SAC
    - Soroswap Router
- **Risk:** No API key means less dependency, but we act as our own "quoter". Simulation is the safest way to quote.

**Verdict:** Proceed with Phase 2 using Client-Side Simulation and Direct Contract Calls. No API keys required.
