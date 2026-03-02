# Aquarius AMM Integration Research

## Overview
Aquarius is a DEX aggregator and AMM protocol on Stellar/Soroban.

## API Endpoints
- **Base URL**: `https://amm-api.aqua.network`
- **Find Path (Strict Send)**: `POST /api/external/v1/find-path/`
- **Find Path (Strict Receive)**: `POST /api/external/v1/find-path-strict-receive/`

## Request Format
```json
{
  "token_in_address": "CAS3...", // Contract ID
  "token_out_address": "CB23...", // Contract ID  
  "amount": 10000000 // stroops
}
```

## Response Format
```json
{
  "success": true,
  "swap_chain_xdr": "AAAAEAAAAAE...", // NOT a transaction XDR!
  "pools": ["CDFN..."],
  "tokens": ["native", "KALE:GB..."],
  "amount": 2642432362, // Expected output
  "amount_with_fee": 2639789929
}
```

## Key Findings

### `swap_chain_xdr` is NOT a Transaction
Unlike Soroswap/xBull which return ready-to-sign Transaction XDRs, Aquarius returns a **ScVal blob** that represents the arguments for the Router's `swap_chained` function.

### Router Contract Required
To execute a swap, you must:
1. Find the **AMM Router Contract ID** (not provided in API response)
2. Call `swap_chained(swap_chain_xdr, amount_in, min_out, user_address)` on the Router
3. The `swap_chain_xdr` blob contains routing instructions parsed by the contract

### Router Functions
- `swap_chained(...)` - For strict-send (fixed input)
- `swap_chained_strict_receive(...)` - For strict-receive (fixed output)

### Implementation Complexity
This is more complex than Soroswap/xBull because:
1. Need to discover Router Contract ID (not documented in API)
2. Need to manually construct the `swap_chained` invocation
3. Need to parse/validate the `swap_chain_xdr` blob structure

### Example Pool
- **XLM/KALE Pool**: `CDFNPMDIWKCTVCDP2K75RI5J4FIKLTSZBWBNLS4BQVT6AS67MRD5GV2V`
- This is a **Pool Contract**, not the Router

## Documentation
- [Aquarius Swap Guide](https://docs.aqua.network/developers/code-examples/executing-swaps-through-optimal-path)
- [Example Transactions](https://stellar.expert/explorer/public/tx/c52f43d518f8cebe8ec849fd5d50c394faa036f96399d723f1f2d286e36c7b94)

## Recommendation
For C-address smart wallet swaps, prefer **Soroswap** or **xBull** which provide complete Transaction XDRs.
Aquarius integration is viable but requires additional research to:
1. Locate the Router Contract ID
2. Verify the `swap_chained` function signature
3. Potentially decode/encode the ScVal blob properly

## Status: DEFERRED
Aquarius direct integration is deferred for future work. The existing Soroswap (Ohloss-aligned) implementation handles Aqua pools via the aggregator, so users can still access Aquarius liquidity through Soroswap routing.
