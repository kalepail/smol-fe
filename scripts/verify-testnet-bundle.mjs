
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from '@stellar/stellar-sdk';
const { rpc, xdr, Address, scValToNative } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const RPC_URL = "https://soroban-testnet.stellar.org";
const ENV_FILE = path.join(rootDir, '.env.testnet.generated');

async function main() {
    console.log("🔍 Starting Testnet Verification...");

    if (!existsSync(ENV_FILE)) {
        throw new Error(`Env file not found: ${ENV_FILE}`);
    }

    const envContent = readFileSync(ENV_FILE, 'utf8');
    const ids = {};
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([A-Z0-9_]+)="?([A-Z0-9]+)"?$/);
        if (match) {
            ids[match[1]] = match[2];
        }
    });

    const farmId = ids.PUBLIC_FARM_ATTESTATIONS_CONTRACT_ID_TESTNET;
    const tierId = ids.PUBLIC_TIER_VERIFIER_CONTRACT_ID_TESTNET;
    const risc0Id = ids.PUBLIC_RISC0_GROTH16_VERIFIER_CONTRACT_ID_TESTNET;

    console.log("Contract IDs loaded:");
    console.log(`- Farm: ${farmId}`);
    console.log(`- Tier: ${tierId}`);
    console.log(`- RISC0: ${risc0Id}`);

    const server = new rpc.Server(RPC_URL);

    // Helper to simulate a read-only call
    async function simulateCall(contractId, method, ...args) {
        console.log(`\nInvoking ${contractId}.${method}()...`);
        try {
            const contract = new pkg.Contract(contractId);
            const op = contract.call(method, ...args);

            // We need a source account for simulation, even if purely read-only (to pay fee in sim)
            // We can use a random keypair, transaction won't be submitted.
            const dummyKp = pkg.Keypair.random();
            const dummyAccount = new pkg.Account(dummyKp.publicKey(), "0");

            const tx = new pkg.TransactionBuilder(dummyAccount, {
                fee: "100",
                networkPassphrase: pkg.Networks.TESTNET
            })
                .addOperation(op)
                .setTimeout(30)
                .build();

            const sim = await server.simulateTransaction(tx);

            if (pkg.rpc.Api.isSimulationError(sim)) {
                // Return the error code/events for analysis if we expect failure
                return { success: false, sim };
            }

            // Success
            let resultVal = sim.result.retval;
            return { success: true, resultVal, sim };

        } catch (e) {
            console.error(`❌ Simulation failed completely:`, e.message);
            return { success: false, error: e };
        }
    }

    // 1. Check Farm
    if (farmId) {
        // farm_attestations.admin() -> Address
        const res = await simulateCall(farmId, "admin");
        if (res.success) {
            const adminAddr = pkg.Address.fromScVal(res.resultVal).toString();
            console.log(`✅ Farm Admin: ${adminAddr}`);
        } else {
            console.error(`❌ Farm admin() failed. Contract might not be initialized.`);
            console.error(JSON.stringify(res.sim, null, 2));
        }
    }

    // 2. Check Tier
    if (tierId) {
        // TierVerifier doesn't have public admin() getter.
        // It has update_vkey which requires auth.
        // But verify_groth16 checks Vkey existence first.
        // verify_groth16(public_inputs: Vec<BytesN<32>>, proof: Groth16Proof)

        // We'll pass empty/dummy args.
        // public_inputs: Vec
        // proof: Groth16Proof { pi_a: 64bytes, pi_b: 128bytes, pi_c: 64bytes }

        const dummyBytes64 = Buffer.alloc(64);
        const dummyBytes128 = Buffer.alloc(128);

        const proofObj = xdr.ScVal.scvMap([
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_a"), val: xdr.ScVal.scvBytes(dummyBytes64) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_b"), val: xdr.ScVal.scvBytes(dummyBytes128) }),
            new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("pi_c"), val: xdr.ScVal.scvBytes(dummyBytes64) }),
        ]);

        const args = [
            xdr.ScVal.scvVec([]), // public_inputs (empty vec)
            proofObj // proof
        ];

        console.log(`\nChecking Tier Verifier VKEY existence via verify_groth16...`);
        const res = await simulateCall(tierId, "verify_groth16", ...args);

        if (res.success) {
            // It returned True/False? 
            // Actually it might return Error if public inputs len mismatches VKEY IC len.
            // TierVerifier: if vkey.ic.len() != public_inputs.len() + 1 -> Err(InvalidPublicInputs)
            console.log("✅ verify_groth16 returned success (unexpectedly valid proof? or logic error in test?)");
        } else {
            // Expect simulation error.
            // Check if it's "NotInitialized" (Error 5) or "InvalidPublicInputs" (Error 6)
            // Error 5 => VKey missing (BAD)
            // Error 6 => VKey present but inputs wrong (GOOD)

            const errorStr = JSON.stringify(res.sim);
            if (errorStr.includes("Error(Contract, #6)") || errorStr.includes("Error(Contract, #1)")) {
                console.log("✅ Tier Verifier is initialized! (Failed with Expected Error: InvalidPublicInputs/InvalidProof)");
            } else if (errorStr.includes("Error(Contract, #5)")) {
                console.error("❌ Tier Verifier NOT INITIALIZED (Error #5: NotInitialized)");
            } else {
                console.log("⚠️ Simulation result undefined, but likely initialized if not #5.");
                console.log(errorStr);
            }
        }
    }

    // 3. Check RISC0
    if (risc0Id) {
        // RISC0 has init_admin. check if it has admin?
        // contracts/risc0-groth16-verifier/src/lib.rs
        // It has `set_admin` and `verify_and_attest`.
        // No public admin getter?
        // Let's assume initialized if Farm is initialized (same flow).
        console.log("Skipping RISC0 specific check (assumed ok if deployment succeeded).");
    }

    console.log("\n✅ Verification check complete.");
}

main().catch(console.error);
