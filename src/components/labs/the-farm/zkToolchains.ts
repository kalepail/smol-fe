export type ToolchainTrackId = "noir-ultrahonk" | "risc0-zkvm";

export interface ToolchainTrack {
    id: ToolchainTrackId;
    label: string;
    engine: string;
    statusLabel: string;
    onchainFlow: "kale" | "arcade";
    onchainButton: string;
    summary: string;
    stellarPath: string;
    superVerifierMode: string;
    learningSteps: string[];
    implementationSteps: string[];
    judgeSignals: string[];
    references: Array<{ label: string; href: string }>;
}

export const HACKATHON_TOOLCHAIN_TRACKS: ToolchainTrack[] = [
    {
        id: "noir-ultrahonk",
        label: "Noir UltraHonk Track",
        engine: "Noir + nargo + bb",
        statusLabel: "Evidence-ready rail",
        onchainFlow: "kale",
        onchainButton: "Verify Kale Rail Receipt",
        summary:
            "Build dedicated game circuits in Noir, compile with nargo, and verify with a Soroban UltraHonk verifier contract while keeping Super Verifier for canonical attestations.",
        stellarPath:
            "Compile Noir circuits to ACIR, generate proof/public inputs/vk with Barretenberg, deploy a Soroban UltraHonk verifier, then map the verified game run to the live verify_and_attest rail.",
        superVerifierMode:
            "Use verify_and_attest as the canonical leaderboard and attestation layer after each Noir circuit verification.",
        learningSteps: [
            "Install Noir toolchain with noirup, then initialize and run a starter circuit with nargo.",
            "Learn ACIR + witness flow: nargo check -> nargo execute -> witness output.",
            "Install and use Barretenberg (bb) to generate and verify UltraHonk proofs.",
            "Run the public ultrahonk_soroban_contract quickstart on localnet end-to-end.",
        ],
        implementationSteps: [
            "Define one dedicated Noir circuit per game mechanic (win path, dodge trace, pattern lock).",
            "Generate vk/proof/public_inputs artifacts for each circuit and pin versions by game season.",
            "Wire game payload encoding so each run maps deterministically into circuit inputs.",
            "Submit final attestation through Super Verifier verify_and_attest with run commitment and tier hint.",
        ],
        judgeSignals: [
            "Show reproducible artifact generation commands and deterministic inputs.",
            "Show on-chain verifier contract txs plus Super Verifier attest txs for the same run.",
            "Demonstrate vkey rotation policy and rollback-safe release notes.",
        ],
        references: [
            {
                label: "Stellar ZK proofs overview",
                href: "https://developers.stellar.org/docs/build/apps/zk/overview",
            },
            {
                label: "UltraHonk Soroban verifier repo",
                href: "https://github.com/indextree/ultrahonk_soroban_contract",
            },
            {
                label: "Noir quick start",
                href: "https://noir-lang.org/docs/getting_started/quick_start/",
            },
        ],
    },
    {
        id: "risc0-zkvm",
        label: "RISC Zero zkVM Track",
        engine: "cargo risczero + zkVM",
        statusLabel: "Evidence-ready bridge",
        onchainFlow: "arcade",
        onchainButton: "Verify Arcade Rail Receipt",
        summary:
            "Prove full game logic inside zkVM guest programs, verify receipts against image IDs, then bridge verified outputs into Stellar attestations.",
        stellarPath:
            "Use receipt journal hash and image-id anchored metadata as game commitments, then submit compatibility attestations on Stellar while Soroban-native zkVM verification path matures.",
        superVerifierMode:
            "Treat Super Verifier as the settlement and badge rail for receipt-derived commitments.",
        learningSteps: [
            "Install rzup and cargo-risczero, then scaffold a starter zkVM project.",
            "Build deterministic guest binaries and record image IDs for each release.",
            "Understand receipts: journal + seal, and verify receipts against expected image ID.",
            "Learn Bonsai remote proving flow and optional STARK-to-SNARK conversion lifecycle.",
        ],
        implementationSteps: [
            "Move at least one arcade game scorer into a zkVM guest program with fixed I/O schema.",
            "Emit compact journal outputs (score class, run hash, nonce domain) for on-chain consumption.",
            "Verify receipt server-side before any contract submission, then sign run payload metadata.",
            "Submit receipt-derived commitment to Super Verifier as canonical on-chain attestation.",
        ],
        judgeSignals: [
            "Publish image ID manifest and matching guest source hash per release.",
            "Demonstrate failing verification for mismatched image IDs and tampered journals.",
            "Show receipt verification logs tied to final on-chain attestation transaction hash.",
        ],
        references: [
            {
                label: "Stellar ZK proofs overview",
                href: "https://developers.stellar.org/docs/build/apps/zk/overview",
            },
            {
                label: "RISC Zero receipts",
                href: "https://dev.risczero.com/api/zkvm/receipts",
            },
            {
                label: "RISC Zero verifier contracts",
                href: "https://dev.risczero.com/api/blockchain-integration/contracts/verifier",
            },
        ],
    },
];

export function formatToolchainRunbook(track: ToolchainTrack): string {
    const lines: string[] = [];
    lines.push(`Track: ${track.label}`);
    lines.push(`Engine: ${track.engine}`);
    lines.push(`Status: ${track.statusLabel}`);
    lines.push(`On-chain flow: ${track.onchainFlow}`);
    lines.push("");
    lines.push("Summary:");
    lines.push(track.summary);
    lines.push("");
    lines.push("Stellar path:");
    lines.push(track.stellarPath);
    lines.push("");
    lines.push("Super Verifier mode:");
    lines.push(track.superVerifierMode);
    lines.push("");
    lines.push("Learning steps:");
    track.learningSteps.forEach((step, idx) => lines.push(`${idx + 1}. ${step}`));
    lines.push("");
    lines.push("Implementation steps:");
    track.implementationSteps.forEach((step, idx) =>
        lines.push(`${idx + 1}. ${step}`),
    );
    lines.push("");
    lines.push("Proctor signals:");
    track.judgeSignals.forEach((step, idx) => lines.push(`${idx + 1}. ${step}`));
    lines.push("");
    lines.push("References:");
    track.references.forEach((reference, idx) =>
        lines.push(`${idx + 1}. ${reference.label}: ${reference.href}`),
    );
    return lines.join("\n");
}
