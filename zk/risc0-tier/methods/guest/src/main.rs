use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};

fn main() {
    let (tier_index, threshold, balance, salt): (u8, u64, u64, [u8; 32]) = env::read();

    assert!(balance >= threshold, "balance below threshold");

    let mut hasher = Sha256::new();
    hasher.update(balance.to_be_bytes());
    hasher.update(salt);
    let digest = hasher.finalize();

    let mut commitment_digest = [0u8; 32];
    commitment_digest.copy_from_slice(&digest);

    env::commit(&(tier_index, threshold, commitment_digest));
}
