use std::hash::pedersen_hash;

fn main(threshold: pub u64, balance: u64, salt: Field) -> pub Field {
    assert(balance >= threshold);
    pedersen_hash([balance as Field, salt])
}

