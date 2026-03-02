//! Tier Verifier — Groth16 ZK Proof Verification for Proof of Farm
//!
//! Verifies Groth16 zero-knowledge proofs on-chain using Stellar Protocol 25
//! BN254 host functions (CAP-0074). Provers demonstrate tier membership without
//! revealing their KALE balance.
//!
//! ## How it works
//! 1. Client generates a Groth16 proof using snarkjs (browser-side)
//! 2. Proof is serialized and submitted to this contract
//! 3. Contract performs on-chain pairing check using native BN254 ops
//! 4. If valid, an attestation is stored on-chain
//!
//! ## Verification Key
//! The verification key is stored on initialization and encodes the circuit
//! parameters from the tier_proof.circom circuit.

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr},
    Address, BytesN, Env, Symbol, Vec, U256,
};

// ============================================================================
// Errors
// ============================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TierVerifierError {
    InvalidProof = 1,
    InvalidTier = 2,
    NotAdmin = 3,
    AlreadyInitialized = 4,
    NotInitialized = 5,
    InvalidPublicInputs = 6,
}

// ============================================================================
// Types
// ============================================================================

/// A verified tier attestation stored on-chain
#[derive(Clone)]
#[contracttype]
pub struct TierAttestation {
    pub farmer: Address,
    pub tier: u32,
    pub commitment: BytesN<32>,
    pub verified_at: u64,
}

/// Groth16 proof points (BN254 curve)
/// pi_a: G1 point (64 bytes uncompressed)
/// pi_b: G2 point (128 bytes uncompressed)
/// pi_c: G1 point (64 bytes uncompressed)
#[derive(Clone)]
#[contracttype]
pub struct Groth16Proof {
    pub pi_a: BytesN<64>,
    pub pi_b: BytesN<128>,
    pub pi_c: BytesN<64>,
}

/// Groth16 verification key stored on-chain
/// This encodes the circuit-specific parameters from tier_proof.circom
#[derive(Clone)]
#[contracttype]
pub struct VerificationKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    /// IC points: one for each public input + 1
    /// For tier_proof: 3 IC points (1 base + 2 public inputs)
    pub ic: Vec<BytesN<64>>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Vkey,
    Attestation(Address),
}

// ============================================================================
// Contract
// ============================================================================

#[contract]
pub struct TierVerifier;

#[contractimpl]
impl TierVerifier {
    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// Initialize the contract with an admin address and verification key.
    pub fn initialize(
        env: Env,
        admin: Address,
        vkey: VerificationKey,
    ) -> Result<(), TierVerifierError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(TierVerifierError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vkey, &vkey);
        Ok(())
    }

    /// Upgrade the contract to a new WASM hash. Only callable by admin.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), TierVerifierError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(TierVerifierError::NotAdmin)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// Change the admin address. Admin only.
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), TierVerifierError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(TierVerifierError::NotAdmin)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);

        // Emit event
        env.events().publish((Symbol::new(&env, "AdminChanged"),), (admin, new_admin));

        Ok(())
    }

    /// Update the verification key. Admin only.
    /// This allows changing the circuit parameters without redeploying.
    pub fn update_vkey(env: Env, vkey: VerificationKey) -> Result<(), TierVerifierError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(TierVerifierError::NotAdmin)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Vkey, &vkey);

        env.events().publish((Symbol::new(&env, "VkeyUpdated"),), ());
        Ok(())
    }

    // ========================================================================
    // Groth16 Verification
    // ========================================================================

    /// Verify a Groth16 proof and store the tier attestation on-chain.
    ///
    /// This performs the full Groth16 pairing check:
    ///   e(pi_a, pi_b) == e(alpha, beta) * e(vk_x, gamma) * e(pi_c, delta)
    ///
    /// Which is equivalent to checking:
    ///   e(-pi_a, pi_b) * e(alpha, beta) * e(vk_x, gamma) * e(pi_c, delta) == 1
    ///
    /// Where vk_x = IC[0] + sum(pub_input[i] * IC[i+1])
    ///
    /// # Arguments
    /// * `farmer` - Address of the farmer (requires auth)
    /// * `tier` - Claimed tier (0-3, public input to circuit)
    /// * `commitment` - Poseidon commitment (public input to circuit)
    /// * `proof` - The Groth16 proof (pi_a, pi_b, pi_c)
    pub fn verify_and_attest(
        env: Env,
        farmer: Address,
        tier: u32,
        commitment: BytesN<32>,
        proof: Groth16Proof,
    ) -> Result<bool, TierVerifierError> {
        // Validate tier range
        if tier > 3 {
            return Err(TierVerifierError::InvalidTier);
        }

        // Require farmer auth
        farmer.require_auth();

        // 1. Prepare public inputs for the generic verifier
        // U256::to_be_bytes returns Bytes, we convert to BytesN<32>
        let tier_bytes = U256::from_u32(&env, tier).to_be_bytes();
        let tier_val: BytesN<32> = tier_bytes.try_into().map_err(|_| TierVerifierError::InvalidTier)?;
        
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(tier_val);
        public_inputs.push_back(commitment.clone());

        // 2. Call the generic verifier
        Self::verify_groth16_internal(&env, &public_inputs, &proof)?;

        // 3. Proof is valid — store attestation
        let attestation = TierAttestation {
            farmer: farmer.clone(),
            tier,
            commitment,
            verified_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Attestation(farmer.clone()), &attestation);

        // 4. Emit event
        env.events().publish(
            (Symbol::new(&env, "TierVerified"),),
            (farmer, tier),
        );

        Ok(true)
    }

    /// Generic Groth16 verification logic.
    /// Can be used by other contracts or callers to verify ANY BN254 proof.
    pub fn verify_groth16(
        env: Env,
        public_inputs: Vec<BytesN<32>>,
        proof: Groth16Proof,
    ) -> Result<bool, TierVerifierError> {
        Self::verify_groth16_internal(&env, &public_inputs, &proof)?;
        Ok(true)
    }

    /// Internal helper for Groth16 math
    fn verify_groth16_internal(
        env: &Env,
        public_inputs: &Vec<BytesN<32>>,
        proof: &Groth16Proof,
    ) -> Result<(), TierVerifierError> {
        let vkey: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::Vkey)
            .ok_or(TierVerifierError::NotInitialized)?;

        // We need exactly public_inputs.len() + 1 IC points
        if vkey.ic.len() != public_inputs.len() + 1 {
            return Err(TierVerifierError::InvalidPublicInputs);
        }

        let bn254 = env.crypto().bn254();

        // Decode proof points
        let pi_a = Bn254G1Affine::from_bytes(proof.pi_a.clone());
        let pi_b = Bn254G2Affine::from_bytes(proof.pi_b.clone());
        let pi_c = Bn254G1Affine::from_bytes(proof.pi_c.clone());

        // Decode verification key points
        let alpha_g1 = Bn254G1Affine::from_bytes(vkey.alpha_g1);
        let beta_g2 = Bn254G2Affine::from_bytes(vkey.beta_g2);
        let gamma_g2 = Bn254G2Affine::from_bytes(vkey.gamma_g2);
        let delta_g2 = Bn254G2Affine::from_bytes(vkey.delta_g2);

        // Compute vk_x = IC[0] + sum(pub_input[i] * IC[i+1])
        let mut vk_x = Bn254G1Affine::from_bytes(vkey.ic.get(0).unwrap());
        
        for i in 0..public_inputs.len() {
            let scalar_bytes = public_inputs.get(i).unwrap();
            let scalar = Fr::from_bytes(scalar_bytes.clone());
            
            // Skip multiplication if scalar is zero to avoid AFFINE_POINT_AT_INFINITY traps
            // (Fr::zero() or all zeros in bytes)
            let mut is_zero = true;
            for b in scalar_bytes.iter() {
                if b != 0 { is_zero = false; break; }
            }

            if !is_zero {
                let ic_point = Bn254G1Affine::from_bytes(vkey.ic.get(i + 1).unwrap());
                let term = bn254.g1_mul(&ic_point, &scalar);
                vk_x = bn254.g1_add(&vk_x, &term);
            }
        }

        // Negate pi_a for pairing equation by multiplying with -1 in Fr.
        // IMPORTANT: this must use Fr modulus (group order), not Fq modulus.
        let r_minus_one = BytesN::from_array(env, &[
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
            0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
            0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
            0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x00,
        ]);
        let fr_neg_one = Fr::from_bytes(r_minus_one);
        let pi_a_neg = bn254.g1_mul(&pi_a, &fr_neg_one);

        // Final pairing check
        let mut g1_points: Vec<Bn254G1Affine> = Vec::new(&env);
        let mut g2_points: Vec<Bn254G2Affine> = Vec::new(&env);

        g1_points.push_back(pi_a_neg);
        g2_points.push_back(pi_b);

        g1_points.push_back(alpha_g1);
        g2_points.push_back(beta_g2);

        g1_points.push_back(vk_x);
        g2_points.push_back(gamma_g2);

        g1_points.push_back(pi_c);
        g2_points.push_back(delta_g2);

        if !bn254.pairing_check(g1_points, g2_points) {
            return Err(TierVerifierError::InvalidProof);
        }

        Ok(())
    }

    /// Legacy attestation for backwards compatibility during migration.
    /// Stores attestation with proof hash for off-chain verification.
    /// Will be deprecated once all clients upgrade to verify_and_attest.
    pub fn attest_tier(
        env: Env,
        farmer: Address,
        tier: u32,
        commitment: BytesN<32>,
        proof_hash: BytesN<32>,
    ) -> Result<bool, TierVerifierError> {
        if tier > 3 {
            return Err(TierVerifierError::InvalidTier);
        }

        farmer.require_auth();

        let attestation = TierAttestation {
            farmer: farmer.clone(),
            tier,
            commitment,
            verified_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Attestation(farmer.clone()), &attestation);

        env.events().publish(
            (Symbol::new(&env, "TierAttested"),),
            (farmer, tier, proof_hash),
        );

        Ok(true)
    }

    /// Lookup a farmer's tier attestation.
    pub fn get_attestation(env: Env, farmer: Address) -> Option<TierAttestation> {
        env.storage()
            .persistent()
            .get(&DataKey::Attestation(farmer))
    }
}


// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_tier_zero_guard() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(TierVerifier, ());
        let client = TierVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let farmer = Address::generate(&env);

        // Real G1 point from verification_key.json
        let g1_hex = "1a090e767fa302448623fcae0e0efaae24ee935ce0379cb2e1ef7842488a8e131c072f468edbd877adfd290017893d7643c1f1d605c55abb44677f29fec121b3";
        let mut g1_arr = [0u8; 64];
        for i in 0..64 { g1_arr[i] = u8::from_str_radix(&g1_hex[i*2..i*2+2], 16).unwrap(); }
        let g1_bytes = BytesN::from_array(&env, &g1_arr);

        // Real G2 point from verification_key.json
        let g2_hex = "2f6ccee07556e61ac1d590e7e592bfd8d4e4994d2e65d751d97f84732158e5e729cfc36e060909e12b8c6da1a443f8a2ee47e58099c58614238fad6e01a39bac132ad8c806e8959b81e642faadc3beb924021a82c0210315e87f302162a5a0ba01eb03e4a1524452713c9c6ca70573764eda1eb96f6d76763327f304e9f7b227";
        let mut g2_arr = [0u8; 128];
        for i in 0..128 { g2_arr[i] = u8::from_str_radix(&g2_hex[i*2..i*2+2], 16).unwrap(); }
        let g2_bytes = BytesN::from_array(&env, &g2_arr);

        let mut ic: Vec<BytesN<64>> = Vec::new(&env);
        ic.push_back(g1_bytes.clone()); 
        ic.push_back(g1_bytes.clone()); 
        ic.push_back(g1_bytes.clone()); 

        let vkey = VerificationKey {
            alpha_g1: g1_bytes.clone(),
            beta_g2: g2_bytes.clone(),
            gamma_g2: g2_bytes.clone(),
            delta_g2: g2_bytes.clone(),
            ic,
        };

        client.initialize(&admin, &vkey);

        let commitment = BytesN::from_array(&env, &[1u8; 32]);
        let proof = Groth16Proof {
            pi_a: g1_bytes.clone(),
            pi_b: g2_bytes.clone(),
            pi_c: g1_bytes.clone(),
        };

        let result = client.try_verify_and_attest(&farmer, &0, &commitment, &proof);
        
        // This will now reach pairing_check and return Err(InvalidProof) instead of trapping!
        assert!(result.is_err());
    }

    #[test]
    fn test_generic_verify() {
        let env = Env::default();
        let contract_id = env.register(TierVerifier, ());
        let client = TierVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        
        let g1_hex = "1a090e767fa302448623fcae0e0efaae24ee935ce0379cb2e1ef7842488a8e131c072f468edbd877adfd290017893d7643c1f1d605c55abb44677f29fec121b3";
        let mut g1_arr = [0u8; 64];
        for i in 0..64 { g1_arr[i] = u8::from_str_radix(&g1_hex[i*2..i*2+2], 16).unwrap(); }
        let g1_bytes = BytesN::from_array(&env, &g1_arr);

        let g2_hex = "2f6ccee07556e61ac1d590e7e592bfd8d4e4994d2e65d751d97f84732158e5e729cfc36e060909e12b8c6da1a443f8a2ee47e58099c58614238fad6e01a39bac132ad8c806e8959b81e642faadc3beb924021a82c0210315e87f302162a5a0ba01eb03e4a1524452713c9c6ca70573764eda1eb96f6d76763327f304e9f7b227";
        let mut g2_arr = [0u8; 128];
        for i in 0..128 { g2_arr[i] = u8::from_str_radix(&g2_hex[i*2..i*2+2], 16).unwrap(); }
        let g2_bytes = BytesN::from_array(&env, &g2_arr);

        let mut ic: Vec<BytesN<64>> = Vec::new(&env);
        for _ in 0..4 { ic.push_back(g1_bytes.clone()); }

        let vkey = VerificationKey {
            alpha_g1: g1_bytes.clone(),
            beta_g2: g2_bytes.clone(),
            gamma_g2: g2_bytes.clone(),
            delta_g2: g2_bytes.clone(),
            ic,
        };

        client.initialize(&admin, &vkey);

        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(BytesN::from_array(&env, &[0u8; 32])); 
        public_inputs.push_back(BytesN::from_array(&env, &[1u8; 32])); 
        public_inputs.push_back(BytesN::from_array(&env, &[0u8; 32])); 

        let proof = Groth16Proof {
            pi_a: g1_bytes.clone(),
            pi_b: g2_bytes.clone(),
            pi_c: g1_bytes.clone(),
        };

        let result = client.try_verify_groth16(&public_inputs, &proof);
        assert!(result.is_err());
    }

    #[test]
    fn test_admin_flow() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(TierVerifier, ());
        let client = TierVerifierClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);

        let vkey = VerificationKey {
            alpha_g1: BytesN::from_array(&env, &[0u8; 64]),
            beta_g2: BytesN::from_array(&env, &[0u8; 128]),
            gamma_g2: BytesN::from_array(&env, &[0u8; 128]),
            delta_g2: BytesN::from_array(&env, &[0u8; 128]),
            ic: Vec::new(&env),
        };

        client.initialize(&admin, &vkey);

        // Change admin
        client.set_admin(&new_admin);

        // Update vkey with new admin
        client.update_vkey(&vkey);
    }
}


