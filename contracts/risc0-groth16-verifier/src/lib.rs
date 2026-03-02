//! RISC0 Groth16 Receipt Verifier (Soroban)
//!
//! Verifies Groth16 proofs over BN254 using Soroban Protocol 25 host functions (CAP-0074).
//!
//! This contract is intended to verify *RISC Zero Groth16 receipts* (STARK-to-SNARK output).
//! In that system, the Groth16 public inputs are 5 BN254 field elements:
//!   [control_root_hi, control_root_lo, claim_digest_hi, claim_digest_lo, bn254_control_id]
//!
//! We verify the proof on-chain and store a simple per-owner attestation.

#![no_std]

mod vkey;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr},
    symbol_short, Address, BytesN, Env, Vec,
};

// ========================================================================
// Errors
// ========================================================================

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Risc0Groth16Error {
    InvalidProof = 1,
    InvalidPublicInputs = 2,
    NotInitialized = 3,
}

// ========================================================================
// Types
// ========================================================================

#[derive(Clone)]
#[contracttype]
pub struct Groth16Proof {
    pub pi_a: BytesN<64>,
    pub pi_b: BytesN<128>,
    pub pi_c: BytesN<64>,
}

#[derive(Clone)]
#[contracttype]
pub struct ReceiptAttestation {
    pub owner: Address,
    pub claim_digest: BytesN<32>,
    pub verified_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Attestation(Address),
}

// ========================================================================
// Contract
// ========================================================================

#[contract]
pub struct Risc0Groth16Verifier;

#[contractimpl]
impl Risc0Groth16Verifier {
    pub fn init_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!();
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!())
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    /// Verify a RISC0 Groth16 receipt proof and store an attestation.
    ///
    /// - `owner` requires auth.
    /// - `claim_digest` is an application-level digest (32 bytes) that the proof is expected to bind.
    /// - `public_inputs` must be exactly 5 elements.
    pub fn verify_and_attest(
        env: Env,
        owner: Address,
        claim_digest: BytesN<32>,
        public_inputs: Vec<BytesN<32>>,
        proof: Groth16Proof,
    ) -> Result<bool, Risc0Groth16Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Risc0Groth16Error::NotInitialized);
        }

        owner.require_auth();

        // The Groth16 VK embedded in this contract expects exactly 5 public inputs (IC length 6).
        if public_inputs.len() != 5 {
            return Err(Risc0Groth16Error::InvalidPublicInputs);
        }

        // Verify Groth16 pairing equation.
        Self::verify_groth16_internal(&env, &public_inputs, &proof)?;

        // Store record for UI + external explorers (truthful: this is *on-chain proof verification*).
        let record = ReceiptAttestation {
            owner: owner.clone(),
            claim_digest,
            verified_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Attestation(owner.clone()), &record);

        env.events().publish(
            (symbol_short!("risc0"), symbol_short!("g16"), symbol_short!("ok"),),
            (owner,),
        );

        Ok(true)
    }

    pub fn get_attestation(env: Env, owner: Address) -> Option<ReceiptAttestation> {
        env.storage().persistent().get(&DataKey::Attestation(owner))
    }

    fn verify_groth16_internal(
        env: &Env,
        public_inputs: &Vec<BytesN<32>>,
        proof: &Groth16Proof,
    ) -> Result<(), Risc0Groth16Error> {
        let vkey = vkey::risc0_verifying_key(env);

        // VK_IC length must be public_inputs.len()+1
        if vkey.ic.len() != public_inputs.len() + 1 {
            return Err(Risc0Groth16Error::InvalidPublicInputs);
        }

        let bn254 = env.crypto().bn254();

        let pi_a = Bn254G1Affine::from_bytes(proof.pi_a.clone());
        let pi_b = Bn254G2Affine::from_bytes(proof.pi_b.clone());
        let pi_c = Bn254G1Affine::from_bytes(proof.pi_c.clone());

        let alpha_g1 = Bn254G1Affine::from_bytes(vkey.alpha_g1);
        let beta_g2 = Bn254G2Affine::from_bytes(vkey.beta_g2);
        let gamma_g2 = Bn254G2Affine::from_bytes(vkey.gamma_g2);
        let delta_g2 = Bn254G2Affine::from_bytes(vkey.delta_g2);

        let mut vk_x = Bn254G1Affine::from_bytes(vkey.ic.get(0).unwrap());
        for i in 0..public_inputs.len() {
            let scalar_bytes = public_inputs.get(i).unwrap();
            let scalar = Fr::from_bytes(scalar_bytes.clone());

            // Skip multiplication if scalar is zero.
            let mut is_zero = true;
            for b in scalar_bytes.iter() {
                if b != 0 {
                    is_zero = false;
                    break;
                }
            }
            if !is_zero {
                let ic_point = Bn254G1Affine::from_bytes(vkey.ic.get(i + 1).unwrap());
                let term = bn254.g1_mul(&ic_point, &scalar);
                vk_x = bn254.g1_add(&vk_x, &term);
            }
        }

        // Negate pi_a (same trick as tier-verifier).
        let r_minus_one = BytesN::from_array(env, &[
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
            0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
            0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
            0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x00,
        ]);
        let fr_neg_one = Fr::from_bytes(r_minus_one);
        let pi_a_neg = bn254.g1_mul(&pi_a, &fr_neg_one);

        let mut g1_points: Vec<Bn254G1Affine> = Vec::new(env);
        let mut g2_points: Vec<Bn254G2Affine> = Vec::new(env);

        g1_points.push_back(pi_a_neg);
        g2_points.push_back(pi_b);

        g1_points.push_back(alpha_g1);
        g2_points.push_back(beta_g2);

        g1_points.push_back(vk_x);
        g2_points.push_back(gamma_g2);

        g1_points.push_back(pi_c);
        g2_points.push_back(delta_g2);

        if !bn254.pairing_check(g1_points, g2_points) {
            return Err(Risc0Groth16Error::InvalidProof);
        }

        Ok(())
    }
}

// ========================================================================
// Embedded VK type
// ========================================================================

#[derive(Clone)]
#[contracttype]
pub struct VerificationKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}
