#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env};
use ultrahonk_rust_verifier::{UltraHonkVerifier, PROOF_BYTES};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    // Legacy single VK (kept for backwards compatibility with already-deployed instances).
    Vk,
    // Appended (do not reorder): VK registry for multi-circuit support.
    VkById(soroban_sdk::Symbol),
    // Appended (do not reorder): optional default vk_id for `verify_proof`.
    DefaultVkId,
}

#[contract]
pub struct UltraHonkVerifierUpgradeable;

#[contractimpl]
impl UltraHonkVerifierUpgradeable {
    pub fn version() -> u32 {
        1
    }

    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn init_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!();
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::bump_instance_ttl(&env);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Self::bump_instance_ttl(&env);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Set or replace the stored verification key. Admin-only.
    pub fn set_vk(env: Env, vk_bytes: Bytes) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Vk, &vk_bytes);
        Self::bump_instance_ttl(&env);
    }

    /// Register or replace a verification key under a stable `vk_id` (multi-circuit support). Admin-only.
    ///
    /// This keeps the contract upgradeable without forcing redeploys per circuit: callers can select the
    /// key by id using `verify_proof_vk`.
    pub fn set_vk_by_id(env: Env, vk_id: soroban_sdk::Symbol, vk_bytes: Bytes) {
        let admin = Self::admin(env.clone());
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::VkById(vk_id.clone()), &vk_bytes);

        // If no default is set yet, set it (so `verify_proof` has a stable target).
        if !env.storage().instance().has(&DataKey::DefaultVkId) {
            env.storage().instance().set(&DataKey::DefaultVkId, &vk_id);
        }

        Self::bump_instance_ttl(&env);
    }

    /// Set the default `vk_id` used by `verify_proof`. Admin-only.
    pub fn set_default_vk_id(env: Env, vk_id: soroban_sdk::Symbol) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::DefaultVkId, &vk_id);
        Self::bump_instance_ttl(&env);
    }

    pub fn default_vk_id(env: Env) -> Option<soroban_sdk::Symbol> {
        env.storage().instance().get(&DataKey::DefaultVkId)
    }

    pub fn has_vk(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Vk)
    }

    pub fn has_vk_id(env: Env, vk_id: soroban_sdk::Symbol) -> bool {
        env.storage().instance().has(&DataKey::VkById(vk_id))
    }

    /// Verify an UltraHonk proof using the stored VK.
    ///
    /// NOTE: `public_inputs` must be encoded exactly as expected by the verifier library.
    pub fn verify_proof(env: Env, public_inputs: Bytes, proof_bytes: Bytes) -> bool {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return false;
        }

        // Prefer registry default if present; fall back to legacy single VK key.
        let vk_bytes: Option<Bytes> = match env.storage().instance().get::<_, soroban_sdk::Symbol>(&DataKey::DefaultVkId) {
            Some(vk_id) => env.storage().instance().get(&DataKey::VkById(vk_id)),
            None => env.storage().instance().get(&DataKey::Vk),
        };

        let Some(vk_bytes) = vk_bytes else { return false; };

        let verifier = UltraHonkVerifier::new(&env, &vk_bytes);
        let Ok(verifier) = verifier else {
            return false;
        };

        verifier.verify(&proof_bytes, &public_inputs).is_ok()
    }

    /// Verify an UltraHonk proof using a VK registered under `vk_id`.
    ///
    /// NOTE: This is the stable interface for multi-circuit verification.
    pub fn verify_proof_vk(env: Env, vk_id: soroban_sdk::Symbol, public_inputs: Bytes, proof_bytes: Bytes) -> bool {
        if proof_bytes.len() as usize != PROOF_BYTES {
            return false;
        }

        let vk_bytes: Option<Bytes> = env.storage().instance().get(&DataKey::VkById(vk_id));
        let Some(vk_bytes) = vk_bytes else { return false; };

        let verifier = UltraHonkVerifier::new(&env, &vk_bytes);
        let Ok(verifier) = verifier else { return false; };

        verifier.verify(&proof_bytes, &public_inputs).is_ok()
    }

    // Anyone may call to keep the contract alive.
    pub fn extend_ttl(env: Env) {
        Self::bump_instance_ttl(&env);
    }

    fn bump_instance_ttl(env: &Env) {
        let max = env.storage().max_ttl();
        let threshold = if max > 1 { max / 2 } else { 1 };
        env.storage().instance().extend_ttl(threshold, max);
    }
}
