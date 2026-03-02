pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

// Proves: balance >= threshold, and the provided commitment equals Poseidon(balance, salt).
// Public inputs: threshold, commitment
// Private inputs: balance, salt

template KaleTier() {
    signal input balance;      // private
    signal input salt;         // private
    signal input threshold;    // public
    signal input commitment;   // public

    // Poseidon commitment
    component posei = Poseidon(2);
    posei.inputs[0] <== balance;
    posei.inputs[1] <== salt;
    posei.out === commitment;

    // balance >= threshold (64-bit)
    component cmp = GreaterEqThan(64);
    cmp.in[0] <== balance;
    cmp.in[1] <== threshold;
    cmp.out === 1;
}

component main {public [threshold, commitment]} = KaleTier();
