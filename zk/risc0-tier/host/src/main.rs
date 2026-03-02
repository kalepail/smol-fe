use anyhow::{anyhow, Context, Result};
use methods::{FARM_TIER_ELF, FARM_TIER_ID};
use risc0_zkvm::sha::Digest as Risc0Digest;
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Risc0VerifierInfo {
    #[serde(rename = "methodIdHex")]
    method_id_hex: String,
    digest: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Risc0ProofPayload {
    #[serde(rename = "receiptJson")]
    receipt_json: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Risc0PublicInputs {
    tier: String,
    threshold: u64,
    #[serde(rename = "commitmentDigest")]
    commitment_digest: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Risc0Sample {
    system: String,
    tier: String,
    label: String,
    proof: Risc0ProofPayload,
    #[serde(rename = "publicInputs")]
    public_inputs: Risc0PublicInputs,
    #[serde(rename = "commitmentDigest")]
    commitment_digest: String,
    #[serde(rename = "proofDigest")]
    proof_digest: String,
    #[serde(rename = "verifierDigest")]
    verifier_digest: String,
    #[serde(rename = "expectedValid")]
    expected_valid: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Risc0Bundle {
    system: String,
    #[serde(rename = "commitmentScheme")]
    commitment_scheme: String,
    verifier: Risc0VerifierInfo,
    samples: Vec<Risc0Sample>,
}

#[derive(Clone, Debug)]
struct TierCase {
    tier: &'static str,
    label: &'static str,
    threshold: u64,
    balance: u64,
    salt_byte: u8,
}

const TIER_CASES: [TierCase; 5] = [
    TierCase {
        tier: "sprout",
        label: "Sprout Threshold",
        threshold: 0,
        balance: 42,
        salt_byte: 11,
    },
    TierCase {
        tier: "grower",
        label: "Grower Threshold",
        threshold: 100,
        balance: 220,
        salt_byte: 22,
    },
    TierCase {
        tier: "harvester",
        label: "Harvester Threshold",
        threshold: 1000,
        balance: 2200,
        salt_byte: 33,
    },
    TierCase {
        tier: "whale",
        label: "Whale Threshold",
        threshold: 10000,
        balance: 20000,
        salt_byte: 44,
    },
    TierCase {
        tier: "edge",
        label: "Edge Threshold",
        threshold: 100,
        balance: 100,
        salt_byte: 55,
    },
];

fn workspace_root() -> Result<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("failed to resolve workspace root"))
}

fn artifacts_dir() -> Result<PathBuf> {
    Ok(workspace_root()?.join("artifacts"))
}

fn samples_dir() -> Result<PathBuf> {
    Ok(artifacts_dir()?.join("samples"))
}

fn bundle_path() -> Result<PathBuf> {
    Ok(artifacts_dir()?.join("bundle.json"))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn build_salt(byte: u8) -> [u8; 32] {
    [byte; 32]
}

fn compute_commitment(balance: u64, salt: [u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(balance.to_be_bytes());
    hasher.update(salt);
    let digest = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

fn method_id_hex() -> String {
    let digest = Risc0Digest::from(FARM_TIER_ID);
    hex::encode(digest.as_bytes())
}

fn verify_receipt(sample: &Risc0Sample) -> bool {
    let parsed: Result<Receipt> = serde_json::from_str(&sample.proof.receipt_json)
        .context("failed to parse receipt json");

    let receipt = match parsed {
        Ok(value) => value,
        Err(_) => return false,
    };

    receipt.verify(FARM_TIER_ID).is_ok()
}

fn mutate_first_number(value: &mut Value) -> bool {
    match value {
        Value::Number(number) => {
            if let Some(raw) = number.as_u64() {
                *value = Value::Number((raw + 1).into());
                return true;
            }
            false
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                if mutate_first_number(item) {
                    return true;
                }
            }
            false
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                if mutate_first_number(item) {
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}

fn mutate_first_string(value: &mut Value) -> bool {
    match value {
        Value::String(raw) => {
            if raw.is_empty() {
                return false;
            }
            let mut bytes = raw.as_bytes().to_vec();
            let flip_idx = bytes.len() / 2;
            bytes[flip_idx] = if bytes[flip_idx] == b'a' { b'b' } else { b'a' };
            if let Ok(mutated) = String::from_utf8(bytes) {
                *raw = mutated;
                return true;
            }
            false
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                if mutate_first_string(item) {
                    return true;
                }
            }
            false
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                if mutate_first_string(item) {
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}

fn tamper_receipt_json(receipt_json: &str) -> Result<String> {
    let mut value: Value =
        serde_json::from_str(receipt_json).context("failed to parse receipt json for tamper")?;
    if !mutate_first_number(&mut value) && !mutate_first_string(&mut value) {
        return Err(anyhow!("failed to locate tamperable receipt field"));
    }
    serde_json::to_string(&value).context("failed to encode tampered receipt json")
}

fn create_bundle() -> Result<Risc0Bundle> {
    let prover = default_prover();
    let method_digest = method_id_hex();
    let mut samples = Vec::new();

    for (index, case) in TIER_CASES.iter().enumerate() {
        let salt = build_salt(case.salt_byte);
        let commitment = compute_commitment(case.balance, salt);
        let expected_commitment_hex = hex::encode(commitment);

        let input = (index as u8, case.threshold, case.balance, salt);

        let env = ExecutorEnv::builder()
            .write(&input)
            .context("failed to write guest input")?
            .build()
            .context("failed to build executor env")?;

        let prove_info = prover
            .prove(env, FARM_TIER_ELF)
            .context("failed to produce receipt")?;
        let receipt = prove_info.receipt;

        receipt
            .verify(FARM_TIER_ID)
            .context("host verification failed for generated receipt")?;

        let journal: (u8, u64, [u8; 32]) = receipt
            .journal
            .decode()
            .context("failed to decode receipt journal")?;

        if journal.0 != index as u8 {
            return Err(anyhow!("tier index mismatch for {}", case.tier));
        }
        if journal.1 != case.threshold {
            return Err(anyhow!("threshold mismatch for {}", case.tier));
        }
        let journal_commitment = hex::encode(journal.2);
        if journal_commitment != expected_commitment_hex {
            return Err(anyhow!("commitment mismatch for {}", case.tier));
        }

        let receipt_json =
            serde_json::to_string(&receipt).context("failed to serialize receipt json")?;
        let proof_digest = sha256_hex(receipt_json.as_bytes());

        let sample = Risc0Sample {
            system: "risc0".to_string(),
            tier: case.tier.to_string(),
            label: case.label.to_string(),
            proof: Risc0ProofPayload { receipt_json },
            public_inputs: Risc0PublicInputs {
                tier: case.tier.to_string(),
                threshold: case.threshold,
                commitment_digest: journal_commitment.clone(),
            },
            commitment_digest: journal_commitment,
            proof_digest,
            verifier_digest: method_digest.clone(),
            expected_valid: true,
        };

        samples.push(sample);
    }

    let edge = samples
        .iter()
        .find(|sample| sample.tier == "edge")
        .cloned()
        .ok_or_else(|| anyhow!("missing edge sample"))?;

    let tampered_receipt_json = tamper_receipt_json(&edge.proof.receipt_json)?;

    let invalid = Risc0Sample {
        system: "risc0".to_string(),
        tier: "invalid".to_string(),
        label: "Invalid (Tampered)".to_string(),
        proof: Risc0ProofPayload {
            receipt_json: tampered_receipt_json.clone(),
        },
        public_inputs: edge.public_inputs.clone(),
        commitment_digest: edge.commitment_digest.clone(),
        proof_digest: sha256_hex(tampered_receipt_json.as_bytes()),
        verifier_digest: edge.verifier_digest.clone(),
        expected_valid: false,
    };

    samples.push(invalid);

    Ok(Risc0Bundle {
        system: "risc0".to_string(),
        commitment_scheme: "sha256(balance_be||salt_bytes32)".to_string(),
        verifier: Risc0VerifierInfo {
            method_id_hex: method_digest.clone(),
            digest: method_digest,
        },
        samples,
    })
}

fn write_bundle(bundle: &Risc0Bundle) -> Result<()> {
    let artifacts = artifacts_dir()?;
    let samples = samples_dir()?;
    fs::create_dir_all(&artifacts).context("failed to create artifacts dir")?;
    fs::create_dir_all(&samples).context("failed to create samples dir")?;

    let bundle_json = serde_json::to_string_pretty(bundle).context("failed to encode bundle")?;
    fs::write(bundle_path()?, bundle_json).context("failed to write bundle.json")?;

    for sample in &bundle.samples {
        let sample_path = samples.join(format!("{}.json", sample.tier));
        let sample_json = serde_json::to_string_pretty(sample).context("failed to encode sample")?;
        fs::write(sample_path, sample_json).context("failed to write sample json")?;
    }

    Ok(())
}

fn run_generate() -> Result<()> {
    let bundle = create_bundle()?;
    write_bundle(&bundle)
}

fn run_verify() -> Result<()> {
    let path = bundle_path()?;
    let raw = fs::read_to_string(&path).context("failed to read bundle.json")?;
    let bundle: Risc0Bundle = serde_json::from_str(&raw).context("failed to decode bundle")?;

    let mut mismatches = 0;
    for sample in &bundle.samples {
        let valid = verify_receipt(sample);
        if sample.expected_valid && valid {
            println!("PASS {}", sample.tier);
        } else if !sample.expected_valid && !valid {
            println!("FAIL {} (expected)", sample.tier);
        } else {
            mismatches += 1;
            eprintln!(
                "MISMATCH {} expected {} got {}",
                sample.tier, sample.expected_valid, valid
            );
        }
    }

    if mismatches > 0 {
        return Err(anyhow!("{} receipt verification mismatches", mismatches));
    }

    Ok(())
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    match env::args().nth(1).as_deref() {
        Some("verify") => run_verify(),
        Some("generate") | None => run_generate(),
        Some(other) => Err(anyhow!("unknown command: {other}")),
    }
}
