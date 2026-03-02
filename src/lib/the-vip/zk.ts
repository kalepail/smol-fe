
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import circuit from '../../../zk/noir-tier/target/the_farm_noir.json';

let _backend: BarretenbergBackend | null = null;
let _noir: Noir | null = null;

async function getZK() {
    if (!_backend) {
        // @ts-ignore
        _backend = new BarretenbergBackend(circuit);
        // @ts-ignore
        _noir = new Noir(circuit, _backend);
    }
    return { backend: _backend!, noir: _noir! };
}

export async function generateSessionProof(
    balance: string | number | bigint,
    salt: string,
    threshold: number | string,
    sessionKey: string
) {
    const { noir, backend } = await getZK();

    const input = {
        threshold: String(threshold),
        balance: String(balance),
        salt: String(salt),
        session_key: String(sessionKey)
    };

    // console.log('Generating Proof...'); // Redacted inputs

    const { witness } = await noir.execute(input);
    const proof = await backend.generateProof(witness);

    return {
        proof: Array.from(proof.proof), // Convert Uint8Array to normal array for JSON serialization
        publicInputs: proof.publicInputs.map(i => i.toString()) // Convert Fields to strings
    };
}
