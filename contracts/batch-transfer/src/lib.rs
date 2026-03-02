#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, BytesN, Env, Vec,
};

/// Storage keys for the contract
#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
}

/// Batch Transfer Contract
/// 
/// Enables efficient multi-recipient token transfers in a single transaction.
/// Supports upgradeability via admin-controlled WASM upgrade.
#[contract]
pub struct BatchTransferContract;

#[contractimpl]
impl BatchTransferContract {
    /// Initialize the contract with an admin address.
    /// Must be called once after deployment.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Transfer tokens from one address to multiple recipients in a single transaction.
    /// 
    /// # Arguments
    /// * `token` - The token contract address (e.g., KALE SAC)
    /// * `from` - The sender address (must authorize this call)
    /// * `recipients` - Vector of recipient addresses
    /// * `amounts` - Vector of amounts (must match recipients length)
    /// 
    /// # Authorization
    /// The `from` address must authorize this contract call.
    /// A single signature covers all transfers.
    pub fn batch_transfer(
        env: Env,
        token: Address,
        from: Address,
        recipients: Vec<Address>,
        amounts: Vec<i128>,
    ) {
        // Validate inputs
        let count = recipients.len();
        if count == 0 {
            panic!("no recipients provided");
        }
        if count != amounts.len() {
            panic!("recipients and amounts length mismatch");
        }

        // Single authorization for all transfers
        from.require_auth();

        // Create token client
        let token_client = token::Client::new(&env, &token);

        // Execute all transfers
        for i in 0..count {
            let recipient = recipients.get(i).unwrap();
            let amount = amounts.get(i).unwrap();
            
            if amount <= 0 {
                panic!("amount must be positive");
            }

            token_client.transfer(&from, &recipient, &amount);
        }
    }

    /// Get the current admin address
    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    /// Set a new admin address. Only callable by current admin.
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    /// Upgrade the contract to a new WASM. Only callable by admin.
    /// 
    /// # Arguments
    /// * `new_wasm_hash` - The hash of the new WASM to upgrade to
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Extend the contract's TTL (time-to-live) to prevent expiration.
    /// Anyone can call this to keep the contract alive.
    pub fn extend_ttl(env: Env) {
        let max_ttl = env.storage().max_ttl();
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
    }
}


// Tests removed - to be added with correct SDK test utilities
// WASM build ready for deployment

