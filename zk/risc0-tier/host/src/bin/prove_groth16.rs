use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use methods::{FARM_TIER_ELF, FARM_TIER_ID};
use risc0_zkvm::sha::Digest as Risc0Digest;
use risc0_zkvm::sha::Digestible as _;
use risc0_zkvm::{default_prover, ExecutorEnv, Groth16ReceiptVerifierParameters, ProverOpts, Receipt};
use serde::Serialize;
use std::env;

#[derive(Serialize)]
struct OutputJson {
    system: &'static str,
    image_id_hex: String,
    claim_digest_hex: String,
    public_inputs_hex: Vec<String>,
    proof: ProofJsonOut,
    // Optional: handy for local verification / debugging in the frontend.
    receipt_json: String,
}

#[derive(Serialize)]
struct ProofJsonOut {
    // Soroban contract expects:
    // - pi_a: 64 bytes (G1: x||y, BE)
    // - pi_b: 128 bytes (G2 CAP-0074: X_c1||X_c0||Y_c1||Y_c0, BE)
    // - pi_c: 64 bytes (G1: x||y, BE)
    pi_a_b64: String,
    pi_b_b64: String,
    pi_c_b64: String,
}

fn bytes32_to_hex(bytes: [u8; 32]) -> String {
    hex::encode(bytes)
}

fn pad16_to_32_be(half: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[16..].copy_from_slice(half);
    out
}

// Mirrors risc0-groth16's split_digest() behavior, but returns BE bytes32 suitable for Soroban.
fn split_digest_to_fr_bytes32_be(digest: &Risc0Digest) -> ([u8; 32], [u8; 32]) {
    let mut be = digest.as_bytes().to_vec();
    be.reverse();
    let (b, a) = be.split_at(16);
    // risc0-groth16 returns (from(a), from(b))
    (pad16_to_32_be(a), pad16_to_32_be(b))
}

// Mirrors risc0-groth16's bn254_control_id scalar handling: reverse digest bytes.
fn bn254_control_id_to_fr_bytes32_be(digest: &Risc0Digest) -> [u8; 32] {
    let mut out = [0u8; 32];
    out.copy_from_slice(digest.as_bytes());
    out.reverse();
    out
}

fn extract_groth16_proof_bytes(receipt: &Receipt) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>)> {
    let groth16 = receipt
        .inner
        .groth16()
        .context("receipt is not Groth16")?;
    let seal = groth16.seal.as_slice();
    if seal.len() != 256 {
        anyhow::bail!("unexpected groth16 seal length: {}", seal.len());
    }

    // Seal format (risc0-groth16): a(x,y) || b(x_c0,x_c1,y_c0,y_c1) || c(x,y), each limb 32 bytes BE.
    let pi_a = seal[0..64].to_vec();

    let bx_c0 = &seal[64..96];
    let bx_c1 = &seal[96..128];
    let by_c0 = &seal[128..160];
    let by_c1 = &seal[160..192];

    // CAP-0074: X_c1||X_c0||Y_c1||Y_c0
    let mut pi_b = Vec::with_capacity(128);
    pi_b.extend_from_slice(bx_c1);
    pi_b.extend_from_slice(bx_c0);
    pi_b.extend_from_slice(by_c1);
    pi_b.extend_from_slice(by_c0);

    let pi_c = seal[192..256].to_vec();

    Ok((pi_a, pi_b, pi_c))
}

fn parse_u8(arg: Option<&String>, name: &str, default: u8) -> Result<u8> {
    match arg {
        Some(raw) => raw
            .parse::<u8>()
            .with_context(|| format!("invalid {name} (u8): {raw}")),
        None => Ok(default),
    }
}

fn parse_u64(arg: Option<&String>, name: &str, default: u64) -> Result<u64> {
    match arg {
        Some(raw) => raw
            .parse::<u64>()
            .with_context(|| format!("invalid {name} (u64): {raw}")),
        None => Ok(default),
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    // Usage:
    //   cargo run --bin prove_groth16 -- <tier_index_u8> <threshold_u64> <balance_u64> <salt_byte_u8>
    //
    // Defaults match the sample exporter for reproducibility.
    let args: Vec<String> = env::args().collect();
    let tier_index = parse_u8(args.get(1), "tier_index", 1)?;
    let threshold = parse_u64(args.get(2), "threshold", 100)?;
    let balance = parse_u64(args.get(3), "balance", 220)?;
    let salt_byte = parse_u8(args.get(4), "salt_byte", 22)?;

    let salt: [u8; 32] = [salt_byte; 32];
    let input = (tier_index, threshold, balance, salt);

    let env = ExecutorEnv::builder()
        .write(&input)
        .context("failed to write guest input")?
        .build()
        .context("failed to build executor env")?;

    let prover = default_prover();
    let opts = ProverOpts::groth16();
    let prove_info = prover
        .prove_with_opts(env, FARM_TIER_ELF, &opts)
        .context("failed to prove (groth16)")?;

    let receipt = prove_info.receipt;
    receipt
        .verify(FARM_TIER_ID)
        .context("receipt verification failed")?;

    let receipt_json = serde_json::to_string(&receipt).context("failed to serialize receipt json")?;

    let claim_digest = receipt.claim().context("failed to open claim")?.digest();

    let params = Groth16ReceiptVerifierParameters::default();

    let (control_hi, control_lo) = split_digest_to_fr_bytes32_be(&params.control_root);
    let (claim_hi, claim_lo) = split_digest_to_fr_bytes32_be(&claim_digest);
    let bn254_id = bn254_control_id_to_fr_bytes32_be(&params.bn254_control_id);

    let public_inputs_hex = vec![
        bytes32_to_hex(control_hi),
        bytes32_to_hex(control_lo),
        bytes32_to_hex(claim_hi),
        bytes32_to_hex(claim_lo),
        bytes32_to_hex(bn254_id),
    ];

    let (pi_a, pi_b, pi_c) = extract_groth16_proof_bytes(&receipt)?;

    let out = OutputJson {
        system: "risc0_groth16_receipt",
        image_id_hex: hex::encode(Risc0Digest::from(FARM_TIER_ID).as_bytes()),
        claim_digest_hex: hex::encode(claim_digest.as_bytes()),
        public_inputs_hex,
        proof: ProofJsonOut {
            pi_a_b64: B64.encode(pi_a),
            pi_b_b64: B64.encode(pi_b),
            pi_c_b64: B64.encode(pi_c),
        },
        receipt_json,
    };

    let json = serde_json::to_string_pretty(&out)?;
    println!("{json}");
    Ok(())
}

