use hex::FromHex;
use risc0_zkvm::{sha::Digest, Receipt};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn verify_receipt_json(method_id_hex: &str, receipt_json: &str) -> Result<bool, JsValue> {
    let method_id =
        Digest::from_hex(method_id_hex).map_err(|err| JsValue::from_str(&err.to_string()))?;
    let receipt: Receipt =
        serde_json::from_str(receipt_json).map_err(|err| JsValue::from_str(&err.to_string()))?;
    Ok(receipt.verify(method_id).is_ok())
}

#[wasm_bindgen]
pub fn verifier_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
