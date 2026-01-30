# Batch Transfer Contract

Soroban smart contract for efficient multi-recipient token transfers.

## Features

- **Batch Transfers**: Transfer tokens to N recipients in 1 transaction
- **Single Signature**: User signs once for all transfers
- **Atomic**: All transfers succeed or all fail
- **Upgradeable**: Admin can upgrade contract WASM
- **TTL Extension**: Anyone can extend contract TTL

## Build

```bash
# Install Stellar CLI if needed
cargo install stellar-cli --locked

# Build the contract
cd contracts/batch-transfer
stellar contract build
```

The WASM will be at `target/wasm32v1-none/release/batch_transfer.wasm`

## Test

```bash
cargo test
```

## Deploy

```bash
# Deploy to mainnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/batch_transfer.wasm \
  --source <YOUR_SECRET_KEY> \
  --network mainnet

# Initialize with admin
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <YOUR_SECRET_KEY> \
  --network mainnet \
  -- \
  initialize \
  --admin <ADMIN_ADDRESS>
```

## Usage

### batch_transfer

```rust
batch_transfer(
    token: Address,      // Token contract (e.g., KALE SAC)
    from: Address,       // Sender (must authorize)
    recipients: Vec<Address>,  // List of recipients
    amounts: Vec<i128>,  // Amounts (7 decimals for KALE)
)
```

### Admin Functions

```rust
admin() -> Address           // Get current admin
set_admin(new_admin)         // Change admin (admin only)
upgrade(new_wasm_hash)       // Upgrade contract (admin only)
extend_ttl()                 // Extend contract TTL (anyone)
```

## Integration

Once deployed, update `smol-fe/src/utils/batch-transfer.ts` with the contract ID.
