use std::hash::pedersen_hash;

// Proves you hold the exact clearance role required by the door.
// Public input: required_role
// Private input: role, salt
// Public output: commitment (binds the proof to this run's salt)
fn main(required_role: pub u64, role: u64, salt: Field) -> pub Field {
    assert(role == required_role);
    pedersen_hash([role as Field, salt])
}
