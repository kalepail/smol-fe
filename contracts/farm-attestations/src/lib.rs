#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr},
    Address, Bytes, BytesN, Env, IntoVal, Symbol, Val, Vec,
};

// ════════════════════════════════════════════════════════════════════════
//  Storage Layout
// ════════════════════════════════════════════════════════════════════════

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Nonce,
    Entry((Address, Symbol, Symbol)),
    Groth16Vk(Symbol),
    UltraHonkVerifier,
    // v3 ──────────────────────────────────────────────────────────────
    SystemIndex(Symbol),
    OwnerIndex(Address),
    Record((Symbol, BytesN<32>)),
}

// ════════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════════

#[derive(Clone)]
#[contracttype]
pub struct AttestationRecord {
    pub owner: Address,
    pub system: Symbol,
    pub tier: Symbol,
    pub statement_hash: BytesN<32>,
    pub verifier_hash: BytesN<32>,
    pub ledger: u32,
    pub timestamp: u64,
    pub attestation_id: u64,
    pub score: u64,
}

/// One badge in a passport: proof of participation in a system at a tier.
#[derive(Clone)]
#[contracttype]
pub struct Badge {
    pub system: Symbol,
    pub tier: Symbol,
}

/// Lightweight pointer stored in per-system indexes for enumeration.
#[derive(Clone)]
#[contracttype]
pub struct IndexEntry {
    pub owner: Address,
    pub tier: Symbol,
}

/// Global best score for a (system, verifier_hash) combination.
#[derive(Clone)]
#[contracttype]
pub struct RecordEntry {
    pub owner: Address,
    pub score: u64,
    pub attestation_id: u64,
    pub ledger: u32,
}

/// Aggregated owner statistics across all systems.
#[derive(Clone)]
#[contracttype]
pub struct OwnerStats {
    pub total_badges: u32,
    pub systems: Vec<Symbol>,
}

// ════════════════════════════════════════════════════════════════════════
//  Errors
// ════════════════════════════════════════════════════════════════════════

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Groth16Error {
    UnknownVk = 1,
    InvalidPublicInputs = 2,
    InvalidProof = 3,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum UltraHonkError {
    NotConfigured = 1,
    VerificationFailed = 2,
}

// ════════════════════════════════════════════════════════════════════════
//  Verification Key Types (BN254 Groth16)
// ════════════════════════════════════════════════════════════════════════

#[derive(Clone)]
#[contracttype]
pub struct Groth16Proof {
    pub pi_a: BytesN<64>,
    pub pi_b: BytesN<128>,
    pub pi_c: BytesN<64>,
}

#[derive(Clone)]
#[contracttype]
pub struct Groth16VerificationKey {
    pub alpha_g1: BytesN<64>,
    pub beta_g2: BytesN<128>,
    pub gamma_g2: BytesN<128>,
    pub delta_g2: BytesN<128>,
    pub ic: Vec<BytesN<64>>,
}

// ════════════════════════════════════════════════════════════════════════
//  Contract
// ════════════════════════════════════════════════════════════════════════

#[contract]
pub struct FarmAttestations;

#[contractimpl]
impl FarmAttestations {
    pub fn version() -> u32 {
        3
    }

    // ── Admin ────────────────────────────────────────────────────────

    pub fn is_initialized(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Admin)
    }

    pub fn init_admin(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!();
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::bump_instance(&env);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Self::bump_instance(&env);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ── TTL Management ──────────────────────────────────────────────

    pub fn extend_ttl(env: Env) {
        Self::bump_instance(&env);
    }

    pub fn extend_entry_ttl(env: Env, owner: Address, system: Symbol, tier: Symbol) {
        let key = DataKey::Entry((owner, system, tier));
        if env.storage().persistent().has(&key) {
            Self::bump_persistent(&env, &key);
        }
    }

    pub fn extend_vk_ttl(env: Env, vk_id: Symbol) {
        let key = DataKey::Groth16Vk(vk_id);
        if env.storage().persistent().has(&key) {
            Self::bump_persistent(&env, &key);
        }
    }

    // ── Groth16 VK Registry ─────────────────────────────────────────

    pub fn register_groth16_vk(env: Env, vk_id: Symbol, vk: Groth16VerificationKey) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        let key = DataKey::Groth16Vk(vk_id);
        env.storage().persistent().set(&key, &vk);
        Self::bump_persistent(&env, &key);
        Self::bump_instance(&env);
    }

    pub fn has_groth16_vk(env: Env, vk_id: Symbol) -> bool {
        env.storage().persistent().has(&DataKey::Groth16Vk(vk_id))
    }

    // ── UltraHonk Bridge ────────────────────────────────────────────

    pub fn set_ultrahonk_verifier(env: Env, verifier: Address) {
        let admin = Self::admin(env.clone());
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::UltraHonkVerifier, &verifier);
        Self::bump_instance(&env);
    }

    pub fn get_ultrahonk_verifier(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::UltraHonkVerifier)
    }

    // ── Verified Attestation (UltraHonk) ────────────────────────────

    pub fn verify_ultrahonk_and_attest(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<u64, UltraHonkError> {
        owner.require_auth();
        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::UltraHonkVerifier)
            .ok_or(UltraHonkError::NotConfigured)?;

        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(public_inputs.into_val(&env));
        args.push_back(proof_bytes.into_val(&env));
        let ok: bool = env.invoke_contract(
            &verifier,
            &Symbol::new(&env, "verify_proof"),
            args,
        );
        if !ok {
            return Err(UltraHonkError::VerificationFailed);
        }
        Ok(Self::store(&env, owner, system, tier, statement_hash, verifier_hash, 0))
    }

    pub fn verify_ultrahonk_vk_and_attest(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        vk_id: Symbol,
        public_inputs: Bytes,
        proof_bytes: Bytes,
    ) -> Result<u64, UltraHonkError> {
        owner.require_auth();
        let verifier: Address = env
            .storage()
            .instance()
            .get(&DataKey::UltraHonkVerifier)
            .ok_or(UltraHonkError::NotConfigured)?;

        let mut args: Vec<Val> = Vec::new(&env);
        args.push_back(vk_id.into_val(&env));
        args.push_back(public_inputs.into_val(&env));
        args.push_back(proof_bytes.into_val(&env));
        let ok: bool = env.invoke_contract(
            &verifier,
            &Symbol::new(&env, "verify_proof_vk"),
            args,
        );
        if !ok {
            return Err(UltraHonkError::VerificationFailed);
        }
        Ok(Self::store(&env, owner, system, tier, statement_hash, verifier_hash, 0))
    }

    // ── Verified Attestation (Groth16) ──────────────────────────────

    pub fn verify_groth16(
        env: Env,
        vk_id: Symbol,
        public_inputs: Vec<BytesN<32>>,
        proof: Groth16Proof,
    ) -> Result<bool, Groth16Error> {
        let vk: Groth16VerificationKey = env
            .storage()
            .persistent()
            .get(&DataKey::Groth16Vk(vk_id))
            .ok_or(Groth16Error::UnknownVk)?;
        Self::groth16_verify(&env, &vk, &public_inputs, &proof)?;
        Ok(true)
    }

    pub fn verify_groth16_and_attest(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        vk_id: Symbol,
        public_inputs: Vec<BytesN<32>>,
        proof: Groth16Proof,
    ) -> Result<u64, Groth16Error> {
        owner.require_auth();
        let vk: Groth16VerificationKey = env
            .storage()
            .persistent()
            .get(&DataKey::Groth16Vk(vk_id))
            .ok_or(Groth16Error::UnknownVk)?;
        Self::groth16_verify(&env, &vk, &public_inputs, &proof)?;
        Ok(Self::store(&env, owner, system, tier, statement_hash, verifier_hash, 0))
    }

    // ── Core Attestation ────────────────────────────────────────────

    /// Digest-only attestation (no on-chain proof verification).
    pub fn attest(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
    ) -> u64 {
        owner.require_auth();
        Self::store(&env, owner, system, tier, statement_hash, verifier_hash, 0)
    }

    /// Attestation carrying an explicit numeric score.
    pub fn attest_with_score(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        score: u64,
    ) -> u64 {
        owner.require_auth();
        Self::store(&env, owner, system, tier, statement_hash, verifier_hash, score)
    }

    /// Personal-best attestation: only writes if `score` exceeds the
    /// existing record for this (owner, system, tier). Returns the
    /// attestation_id on success, or 0 if the existing score is higher.
    pub fn attest_if_best(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        score: u64,
    ) -> u64 {
        owner.require_auth();
        let key = DataKey::Entry((owner.clone(), system.clone(), tier.clone()));
        if let Some(existing) = env.storage().persistent().get::<DataKey, AttestationRecord>(&key) {
            if existing.score >= score {
                return 0;
            }
        }
        Self::store(&env, owner, system, tier, statement_hash, verifier_hash, score)
    }

    /// Multiple attestations in a single authorization.
    pub fn batch_attest(
        env: Env,
        owner: Address,
        systems: Vec<Symbol>,
        tiers: Vec<Symbol>,
        statement_hashes: Vec<BytesN<32>>,
        verifier_hashes: Vec<BytesN<32>>,
        scores: Vec<u64>,
    ) -> u64 {
        owner.require_auth();
        let n = systems.len();
        assert!(n > 0, "empty batch");
        assert!(
            n == tiers.len()
                && n == statement_hashes.len()
                && n == verifier_hashes.len()
                && n == scores.len(),
            "mismatched lengths"
        );
        let mut last = 0u64;
        for i in 0..n {
            last = Self::store(
                &env,
                owner.clone(),
                systems.get(i).unwrap(),
                tiers.get(i).unwrap(),
                statement_hashes.get(i).unwrap(),
                verifier_hashes.get(i).unwrap(),
                scores.get(i).unwrap(),
            );
        }
        last
    }

    // ── Reads ───────────────────────────────────────────────────────

    pub fn get(env: Env, owner: Address, system: Symbol, tier: Symbol) -> Option<AttestationRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Entry((owner, system, tier)))
    }

    pub fn has(
        env: Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
    ) -> bool {
        match env.storage().persistent().get::<DataKey, AttestationRecord>(
            &DataKey::Entry((owner, system, tier)),
        ) {
            Some(r) => r.statement_hash == statement_hash,
            None => false,
        }
    }

    // ── #1  Passport (Pokemon Badges) ───────────────────────────────

    /// Every system+tier an owner has attested to, collected like badges.
    pub fn get_passport(env: Env, owner: Address) -> Vec<Badge> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerIndex(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── #3  Gate Check (Composable Access) ──────────────────────────

    /// Returns true only if the owner holds attestations for every
    /// (system, tier) pair in the provided lists. Useful as a
    /// prerequisite check before granting access to gated content.
    pub fn check_access(
        env: Env,
        owner: Address,
        systems: Vec<Symbol>,
        tiers: Vec<Symbol>,
    ) -> bool {
        let n = systems.len();
        assert!(n == tiers.len(), "mismatched lengths");
        for i in 0..n {
            let key = DataKey::Entry((
                owner.clone(),
                systems.get(i).unwrap(),
                tiers.get(i).unwrap(),
            ));
            if !env.storage().persistent().has(&key) {
                return false;
            }
        }
        true
    }

    // ── #4  Player Stats ────────────────────────────────────────────

    /// Aggregate stats derived from the owner's badge passport.
    pub fn get_stats(env: Env, owner: Address) -> OwnerStats {
        let badges: Vec<Badge> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerIndex(owner))
            .unwrap_or_else(|| Vec::new(&env));

        let total_badges = badges.len();

        // Collect distinct systems
        let mut systems: Vec<Symbol> = Vec::new(&env);
        for i in 0..badges.len() {
            let sys = badges.get(i).unwrap().system;
            let mut seen = false;
            for j in 0..systems.len() {
                if systems.get(j).unwrap() == sys {
                    seen = true;
                    break;
                }
            }
            if !seen {
                systems.push_back(sys);
            }
        }

        OwnerStats {
            total_badges,
            systems,
        }
    }

    // ── #7  Global Records (World Bests) ────────────────────────────

    /// The highest score recorded for a (system, verifier_hash) pair.
    /// For example: the world record on a specific track.
    pub fn get_record(env: Env, system: Symbol, verifier_hash: BytesN<32>) -> Option<RecordEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Record((system, verifier_hash)))
    }

    // ── System Index (Leaderboard Enumeration) ──────────────────────

    /// All (owner, tier) pairs that hold attestations under a system.
    pub fn list_by_system(env: Env, system: Symbol) -> Vec<IndexEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::SystemIndex(system))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn count_by_system(env: Env, system: Symbol) -> u32 {
        let idx: Vec<IndexEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::SystemIndex(system))
            .unwrap_or_else(|| Vec::new(&env));
        idx.len()
    }

    // ════════════════════════════════════════════════════════════════
    //  Internal
    // ════════════════════════════════════════════════════════════════

    /// Unified write path for all attestation variants.
    fn store(
        env: &Env,
        owner: Address,
        system: Symbol,
        tier: Symbol,
        statement_hash: BytesN<32>,
        verifier_hash: BytesN<32>,
        score: u64,
    ) -> u64 {
        let attestation_id = Self::next_nonce(env);
        let ledger = env.ledger().sequence();
        let timestamp = env.ledger().timestamp();

        let record = AttestationRecord {
            owner: owner.clone(),
            system: system.clone(),
            tier: tier.clone(),
            statement_hash: statement_hash.clone(),
            verifier_hash: verifier_hash.clone(),
            ledger,
            timestamp,
            attestation_id,
            score,
        };

        // Write the entry
        let entry_key = DataKey::Entry((owner.clone(), system.clone(), tier.clone()));
        env.storage().persistent().set(&entry_key, &record);
        Self::bump_persistent(env, &entry_key);

        // Update indexes
        Self::idx_system(env, &system, &owner, &tier);
        Self::idx_owner(env, &owner, &system, &tier);

        // Update global record if this score is the new best
        if score > 0 {
            Self::maybe_update_record(env, &system, &verifier_hash, &owner, score, attestation_id, ledger);
        }

        Self::bump_instance(env);

        // ── #6  Rich Events ─────────────────────────────────────────
        env.events().publish(
            (symbol_short!("attest"), owner, system.clone(), tier),
            (statement_hash, verifier_hash, attestation_id, score, ledger, timestamp),
        );

        attestation_id
    }

    /// Append to per-system index (deduped).
    fn idx_system(env: &Env, system: &Symbol, owner: &Address, tier: &Symbol) {
        let key = DataKey::SystemIndex(system.clone());
        let mut idx: Vec<IndexEntry> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));

        let mut found = false;
        for i in 0..idx.len() {
            let e = idx.get(i).unwrap();
            if e.owner == *owner && e.tier == *tier {
                found = true;
                break;
            }
        }
        if !found {
            idx.push_back(IndexEntry {
                owner: owner.clone(),
                tier: tier.clone(),
            });
            env.storage().persistent().set(&key, &idx);
            Self::bump_persistent(env, &key);
        }
    }

    /// Append to per-owner badge passport (deduped).
    fn idx_owner(env: &Env, owner: &Address, system: &Symbol, tier: &Symbol) {
        let key = DataKey::OwnerIndex(owner.clone());
        let mut badges: Vec<Badge> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));

        let mut found = false;
        for i in 0..badges.len() {
            let b = badges.get(i).unwrap();
            if b.system == *system && b.tier == *tier {
                found = true;
                break;
            }
        }
        if !found {
            badges.push_back(Badge {
                system: system.clone(),
                tier: tier.clone(),
            });
            env.storage().persistent().set(&key, &badges);
            Self::bump_persistent(env, &key);
        }
    }

    /// Update global record if this score beats the current best.
    fn maybe_update_record(
        env: &Env,
        system: &Symbol,
        verifier_hash: &BytesN<32>,
        owner: &Address,
        score: u64,
        attestation_id: u64,
        ledger: u32,
    ) {
        let key = DataKey::Record((system.clone(), verifier_hash.clone()));
        let should_update = match env.storage().persistent().get::<DataKey, RecordEntry>(&key) {
            Some(existing) => score > existing.score,
            None => true,
        };
        if should_update {
            let entry = RecordEntry {
                owner: owner.clone(),
                score,
                attestation_id,
                ledger,
            };
            env.storage().persistent().set(&key, &entry);
            Self::bump_persistent(env, &key);

            env.events().publish(
                (symbol_short!("record"), system.clone()),
                (owner.clone(), score, verifier_hash.clone(), ledger),
            );
        }
    }

    fn next_nonce(env: &Env) -> u64 {
        let n = env
            .storage()
            .instance()
            .get::<DataKey, u64>(&DataKey::Nonce)
            .unwrap_or(0)
            + 1;
        env.storage().instance().set(&DataKey::Nonce, &n);
        n
    }

    fn bump_instance(env: &Env) {
        let max = env.storage().max_ttl();
        env.storage()
            .instance()
            .extend_ttl(if max > 1 { max / 2 } else { 1 }, max);
    }

    fn bump_persistent(env: &Env, key: &DataKey) {
        let max = env.storage().max_ttl();
        env.storage()
            .persistent()
            .extend_ttl(key, if max > 1 { max / 2 } else { 1 }, max);
    }

    // ── BN254 Groth16 Verification ──────────────────────────────────

    fn groth16_verify(
        env: &Env,
        vk: &Groth16VerificationKey,
        public_inputs: &Vec<BytesN<32>>,
        proof: &Groth16Proof,
    ) -> Result<(), Groth16Error> {
        if vk.ic.len() != public_inputs.len() + 1 {
            return Err(Groth16Error::InvalidPublicInputs);
        }

        let bn = env.crypto().bn254();

        let pi_a = Bn254G1Affine::from_bytes(proof.pi_a.clone());
        let pi_b = Bn254G2Affine::from_bytes(proof.pi_b.clone());
        let pi_c = Bn254G1Affine::from_bytes(proof.pi_c.clone());

        let alpha = Bn254G1Affine::from_bytes(vk.alpha_g1.clone());
        let beta = Bn254G2Affine::from_bytes(vk.beta_g2.clone());
        let gamma = Bn254G2Affine::from_bytes(vk.gamma_g2.clone());
        let delta = Bn254G2Affine::from_bytes(vk.delta_g2.clone());

        let mut vk_x = Bn254G1Affine::from_bytes(vk.ic.get(0).unwrap());
        for i in 0..public_inputs.len() {
            let scalar_bytes = public_inputs.get(i).unwrap();
            let mut is_zero = true;
            for b in scalar_bytes.iter() {
                if b != 0 {
                    is_zero = false;
                    break;
                }
            }
            if !is_zero {
                let ic = Bn254G1Affine::from_bytes(vk.ic.get(i + 1).unwrap());
                let term = bn.g1_mul(&ic, &Fr::from_bytes(scalar_bytes));
                vk_x = bn.g1_add(&vk_x, &term);
            }
        }

        // Negate pi_a: multiply by (r - 1) where r is the BN254 scalar field order.
        let neg_one = Fr::from_bytes(BytesN::from_array(env, &[
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
            0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
            0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
            0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x00,
        ]));
        let pi_a_neg = bn.g1_mul(&pi_a, &neg_one);

        // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        let mut g1 = Vec::new(env);
        let mut g2 = Vec::new(env);
        g1.push_back(pi_a_neg); g2.push_back(pi_b);
        g1.push_back(alpha);    g2.push_back(beta);
        g1.push_back(vk_x);    g2.push_back(gamma);
        g1.push_back(pi_c);    g2.push_back(delta);

        if !bn.pairing_check(g1, g2) {
            return Err(Groth16Error::InvalidProof);
        }
        Ok(())
    }
}
