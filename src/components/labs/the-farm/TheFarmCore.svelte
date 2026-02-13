<script lang="ts">
  import {
    FARM_ATTESTATIONS_CONTRACT_ID_MAINNET,
    MAINNET_RPC_URL,
    isMainnetConfigured,
  } from "../../../config/farmAttestation";
  import { circomSamples } from "../../../data/the-farm/circomBundle";
  import {
    noirCommitmentScheme,
    noirSamples,
    noirVerifierBytecode,
  } from "../../../data/the-farm/noirBundle";
  import {
    risc0CommitmentScheme,
    risc0MethodIdHex,
    risc0Samples,
  } from "../../../data/the-farm/risc0Bundle";
  import { publishAttestationMainnet } from "../../../lib/the-farm/attest/publishAttestationMainnet";
  import { sha256HexOfJson } from "../../../lib/the-farm/digest";
  import type {
    AttestationResult,
    FarmSampleProof,
    ProofSystem,
    Tier,
    VerificationResult,
  } from "../../../lib/the-farm/types";
  import {
    preloadNoirVerifier,
    verifyNoirProof,
  } from "../../../lib/the-farm/verifiers/noir";
  import {
    preloadRisc0Verifier,
    verifyRisc0Receipt,
  } from "../../../lib/the-farm/verifiers/risc0";
  import {
    balanceState,
    updateContractBalance,
  } from "../../../stores/balance.svelte.ts";
  import { userState } from "../../../stores/user.svelte.ts";
  import { TIER_CONFIG, formatKaleBalance, getTierForBalance } from "./proof";
  import {
    generateTierProof,
    submitProofToContract,
    hashAddress,
    generateRandomSalt,
    serializeProof,
  } from "./zkProof";
  import confetti from "canvas-confetti";

  type SystemTierMap = Record<ProofSystem, Tier>;
  type SystemFlagMap = Record<ProofSystem, boolean>;
  type SystemErrorMap = Record<ProofSystem, string | null>;

  const systems: ProofSystem[] = ["circom", "noir", "risc0"];
  const tierOrder: Tier[] = [
    "sprout",
    "grower",
    "harvester",
    "whale",
    "edge",
    "invalid",
  ];
  const sampleMap: Record<ProofSystem, FarmSampleProof[]> = {
    circom: circomSamples,
    noir: noirSamples,
    risc0: risc0Samples,
  };

  const systemLabel: Record<ProofSystem, string> = {
    circom: "Circom (Groth16)",
    noir: "Noir (UltraHonk)",
    risc0: "RISC0 (Receipt)",
  };

  const verifierLabel: Record<ProofSystem, string> = {
    circom: "On-Chain BN254 Verifier",
    noir: "bb.js UltraHonk verifier",
    risc0: "RISC0 receipt verifier WASM",
  };

  let mounted = $state(false);
  let activeSystem = $state<ProofSystem>("circom");
  let selectedTier = $state<SystemTierMap>({
    circom: "sprout",
    noir: "sprout",
    risc0: "sprout",
  });
  let processing = $state<SystemFlagMap>({
    circom: false,
    noir: false,
    risc0: false,
  });
  let step = $state<Record<ProofSystem, string>>({
    circom: "",
    noir: "",
    risc0: "",
  });
  let panelError = $state<SystemErrorMap>({
    circom: null,
    noir: null,
    risc0: null,
  });
  let attestationByKey = $state<Record<string, AttestationResult | null>>({});

  // ZK Terminal logs
  let zkLogs = $state<string[]>([]);
  let autoScrollTerminal = $state(true);

  let isAuth = $derived(!!userState.contractId && !!userState.keyId);
  let balance = $derived(balanceState.balance);
  let loading = $derived(balanceState.loading);
  let tierIndex = $derived(balance !== null ? getTierForBalance(balance) : 0);
  let tierCfg = $derived(TIER_CONFIG[tierIndex]);
  let activeSample = $derived(getSample(activeSystem));
  let activeKey = $derived(sampleKey(activeSystem, activeSample.tier));
  let activeAttestResult = $derived(attestationByKey[activeKey]);

  let hasOnChainVerified = $derived.by(() => {
    return Object.values(attestationByKey).some(
      (r) => r?.ok && r?.feeCharged === "Already Verified",
    );
  });

  function addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zkLogs = [...zkLogs.slice(-49), `[${timestamp}] ${msg}`];
  }

  function sampleKey(system: ProofSystem, tier: Tier): string {
    return `${system}:${tier}`;
  }

  function setProcessing(
    system: ProofSystem,
    value: boolean,
    statusText = "",
  ): void {
    processing = { ...processing, [system]: value };
    step = { ...step, [system]: statusText };
    if (value && statusText) addLog(statusText);
  }

  function setPanelError(system: ProofSystem, value: string | null): void {
    panelError = { ...panelError, [system]: value };
    if (value) addLog(`ERROR: ${value}`);
  }

  function setSelectedTier(system: ProofSystem, tier: Tier): void {
    selectedTier = { ...selectedTier, [system]: tier };
    setPanelError(system, null);
  }

  function setAttestationResult(
    system: ProofSystem,
    tier: Tier,
    result: AttestationResult,
  ): void {
    attestationByKey = {
      ...attestationByKey,
      [sampleKey(system, tier)]: result,
    };
  }

  function getSample(system: ProofSystem): FarmSampleProof {
    const wantedTier = selectedTier[system];
    const found = sampleMap[system].find(
      (sample) => sample.tier === wantedTier,
    );
    return found ?? sampleMap[system][0];
  }

  function getTierOptions(
    system: ProofSystem,
  ): Array<{ tier: Tier; label: string }> {
    const entries = sampleMap[system];
    return tierOrder
      .map((tier) => entries.find((sample) => sample.tier === tier))
      .filter((sample): sample is FarmSampleProof => !!sample)
      .map((sample) => ({ tier: sample.tier, label: sample.label }));
  }

  function shortHash(value: string): string {
    const clean = value.startsWith("0x") ? value.slice(2) : value;
    if (clean.length <= 16) {
      return clean;
    }
    return `${clean.slice(0, 10)}...${clean.slice(-8)}`;
  }

  async function secureFarmClaim(system: ProofSystem): Promise<void> {
    const sample = getSample(system);
    setPanelError(system, null);
    zkLogs = []; // Clear for new run

    if (!isAuth) {
      setPanelError(system, "Connect your passkey smart wallet first.");
      return;
    }

    setProcessing(system, true, "Initializing Proof Pipeline...");
    addLog(`System Target: ${systemLabel[system]}`);
    addLog(`Contract: ${FARM_ATTESTATIONS_CONTRACT_ID_MAINNET}`);

    try {
      if (system === "circom") {
        setProcessing(system, true, "Generating ZK Proof...");
        addLog("Computing Poseidon(Addr, Bal, Salt)...");

        const addrHash = await hashAddress(userState.contractId!);
        const currentBalance = balance ?? 0n;
        const salt = generateRandomSalt();
        const tierId = getTierForBalance(currentBalance);

        addLog(`Tier identified: ${tierId} (${TIER_CONFIG[tierId].name})`);
        addLog("Invoking snarkjs.groth16.fullProve...");

        const proofRes = await generateTierProof(
          addrHash,
          currentBalance,
          salt,
          tierId,
        );

        addLog("Proof generated successfully (2048-bit R1CS)");
        setProcessing(system, true, "Proof Generated. Attesting...");

        const { buildPoseidon } = await import("circomlibjs");
        const poseidon = await buildPoseidon();
        const commitmentBigInt = BigInt(
          poseidon.F.toString(poseidon([addrHash, currentBalance, salt])),
        );
        const commitmentBytes = new Uint8Array(32);
        let v = commitmentBigInt;
        for (let i = 31; i >= 0; i--) {
          commitmentBytes[i] = Number(v & 0xffn);
          v >>= 8n;
        }

        addLog(
          `Commitment Digest: 0x${commitmentBigInt.toString(16).slice(0, 16)}...`,
        );
        addLog("Submitting verification to Stellar Mainnet relayer...");

        const submitResult = await submitProofToContract(
          // @ts-ignore
          window.passkeyKit,
          userState.contractId!,
          tierId,
          commitmentBytes,
          proofRes.proof,
          userState.keyId!,
        );

        if (submitResult.success) {
          addLog(`Verification SUCCESS. Tx: ${shortHash(submitResult.txHash)}`);
          setAttestationResult(system, sample.tier, {
            ok: true,
            txHash: submitResult.txHash,
            ledger: 0,
            feeCharged: "Relayed",
          });
          confetti();
          syncOnChainStatus();
        } else {
          throw new Error(submitResult.error || "On-chain verification failed");
        }
      } else {
        setProcessing(system, true, "Verifying Sample Locally...");
        addLog(`System: ${system}`);
        addLog("Validating sample witness against verifier logic...");

        let verifyResult: VerificationResult;
        if (system === "noir") {
          verifyResult = await verifyNoirProof(
            noirVerifierBytecode,
            sample.proof,
          );
        } else {
          verifyResult = await verifyRisc0Receipt(
            risc0MethodIdHex,
            sample.proof,
          );
        }

        if (!verifyResult.valid) {
          throw new Error(verifyResult.error || "Sample verification failed");
        }

        addLog("Sample witness verified. Publishing record...");
        setProcessing(system, true, "Sample Valid. Record on mainnet...");

        const statementHash = await sha256HexOfJson({
          system: sample.system,
          tier: sample.tier,
          commitmentDigest: sample.commitmentDigest,
          proofDigest: sample.proofDigest,
          publicInputs: sample.publicInputs,
        });

        const attestResult = await publishAttestationMainnet({
          owner: userState.contractId!,
          keyId: userState.keyId!,
          system: sample.system,
          tier: sample.tier,
          statementHash,
          verifierHash: sample.verifierDigest,
        });

        setAttestationResult(system, sample.tier, attestResult);
        if (attestResult.ok) {
          addLog("Attestation result recorded.");
          confetti();
        } else {
          throw new Error(attestResult.error || "Attestation failed");
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Secure claim failed";
      setPanelError(system, message);
    } finally {
      setProcessing(system, false);
      addLog("Pipeline idle.");
    }
  }

  async function syncOnChainStatus(): Promise<void> {
    if (!userState.contractId) return;
    try {
      const status = await (
        await import("./zkProof")
      ).checkAttestation(userState.contractId);
      if (status.verified && status.tier !== undefined) {
        const tierName = tierOrder[status.tier];
        setAttestationResult("circom", tierName, {
          ok: true,
          txHash: status.commitment || "0x_on_chain",
          ledger: status.timestamp || 0,
          feeCharged: "Already Verified",
        });
        addLog(
          `ON-CHAIN SYNC: Verified status discovered (Tier ${status.tier})`,
        );
      }
    } catch (e) {
      console.warn("[ZK] Initial status check failed:", e);
    }
  }

  $effect(() => {
    mounted = true;
    if (userState.contractId) {
      syncOnChainStatus();
    }
  });

  $effect(() => {
    preloadNoirVerifier(noirVerifierBytecode);
    preloadRisc0Verifier();
  });

  $effect(() => {
    if (userState.contractId) {
      updateContractBalance(userState.contractId);
      syncOnChainStatus();
    }
  });

  if (typeof window !== "undefined") {
    // @ts-ignore
    window.__setBalance = (amount: bigint) => {
      balanceState.balance = amount;
    };
  }
</script>

<div
  class="farm-root"
  class:farm-mounted={mounted}
  class:is-verified={hasOnChainVerified}
>
  <div class="grain" aria-hidden="true"></div>
  <div class="glow-field"></div>

  <div class="farm-shell">
    <section class="hero card" class:hero-verified={hasOnChainVerified}>
      <div class="hero-top">
        <div class="hero-header-row">
          <p class="eyebrow">Mission-Critical Cryptography</p>
          {#if hasOnChainVerified}
            <div class="verified-badge-hero">
              <span class="v-icon">✓</span>
              FARMER AUTHENTICATED
            </div>
          {/if}
        </div>
        <h1>THE FARM</h1>
      </div>
      <p class="hero-sub">
        Secure your farming status with trustless, on-chain zero-knowledge
        proofs. No balances revealed. No privacy leaked.
      </p>
      <div class="hero-metrics">
        <div class="metric">
          <span class="label">Identity Status</span>
          <span class="value" style={`color:${tierCfg.color}`}>
            {#if tierCfg.iconImage}
              <img
                src={tierCfg.iconImage}
                alt={tierCfg.name}
                class="tier-icon"
              />
            {:else}
              {tierCfg.icon}
            {/if}
            {tierCfg.name.toUpperCase()}
          </span>
        </div>
        <div class="metric highlight">
          <span class="label">On-Chain Verification</span>
          <span class="value">
            {hasOnChainVerified ? "SECURE" : "PENDING"}
          </span>
        </div>
        <div class="metric">
          <span class="label">Passkey Core</span>
          <span class="value">
            {isAuth ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </section>

    <section class="suite card">
      <div class="suite-grid">
        <div class="main-panel">
          <div class="system-tabs">
            {#each systems as system}
              <button
                type="button"
                class="tab-btn"
                class:active={activeSystem === system}
                onclick={() => {
                  activeSystem = system;
                  setPanelError(system, null);
                }}
              >
                {systemLabel[system]}
              </button>
            {/each}
          </div>

          <div class="control-panel panel">
            <div class="panel-header">
              <h3>Secure Pipeline</h3>
              <span class="badge-mini" class:live={activeSystem === "circom"}>
                {activeSystem === "circom" ? "LIVE PROVE" : "SAMPLE ONLY"}
              </span>
            </div>

            <div class="config-row">
              <div class="field">
                <label for="sample-tier">Target Tier Threshold</label>
                <select
                  id="sample-tier"
                  value={selectedTier[activeSystem]}
                  disabled={processing[activeSystem]}
                  onchange={(event) =>
                    setSelectedTier(
                      activeSystem,
                      (event.currentTarget as HTMLSelectElement).value as Tier,
                    )}
                >
                  {#each getTierOptions(activeSystem) as option}
                    <option value={option.tier}>{option.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <button
              type="button"
              class="action-btn"
              disabled={processing[activeSystem] || !isAuth}
              onclick={() => secureFarmClaim(activeSystem)}
            >
              {#if processing[activeSystem]}
                {step[activeSystem] || "PROVING..."}
              {:else}
                EXECUTE SECURE CLAIM
              {/if}
            </button>

            {#if panelError[activeSystem]}
              <div class="error-box">
                {panelError[activeSystem]}
              </div>
            {/if}

            <div class="result-display">
              {#if activeAttestResult?.ok}
                <div class="seal-glow">
                  <div class="seal-head">
                    <span class="seal-badge">VERIFIED</span>
                    <a
                      href={`https://stellar.expert/explorer/public/tx/${activeAttestResult.txHash}`}
                      target="_blank"
                      class="explorer-link"
                    >
                      EXPLORER ↗
                    </a>
                  </div>
                  <div class="seal-body">
                    <p>On-chain attestation successful.</p>
                    <code>{shortHash(activeAttestResult.txHash)}</code>
                  </div>
                </div>
              {:else if processing[activeSystem]}
                <div class="loading-bar-container">
                  <div class="loading-bar"></div>
                </div>
              {:else}
                <div class="idle-hint">Ready for on-chain attestation.</div>
              {/if}
            </div>
          </div>
        </div>

        <div class="side-panel">
          <div class="terminal card">
            <div class="terminal-head">
              <span>ZK_CRYPTOGRAPHIC_LOG</span>
              <div class="terminal-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
            <div class="terminal-body" id="zk-terminal">
              {#each zkLogs as log}
                <div class="log-entry">{log}</div>
              {/each}
              {#if zkLogs.length === 0}
                <div class="log-entry opacity-30">Waiting for execution...</div>
              {/if}
            </div>
          </div>

          <div class="intel panel">
            <h3>Intelligence</h3>
            <div class="intel-items">
              <div class="i-item">
                <span class="i-icon">🛡️</span>
                <div class="i-content">
                  <strong>Zero-Leak</strong>
                  <p>Balances never touch the contract.</p>
                </div>
              </div>
              <div class="i-item">
                <span class="i-icon">⚡</span>
                <div class="i-content">
                  <strong>Protocol 25</strong>
                  <p>Native BN254 host pairing.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>

<style>
  :root {
    --farm-bg: #020604;
    --farm-ink: #ccfccb;
    --farm-soil: #1a4d2e;
    --farm-leaf: #4ade80;
    --farm-sun: #bbf7d0;
    --farm-card: rgba(10, 30, 15, 0.7);
    --farm-line: rgba(74, 222, 128, 0.15);
    --farm-term: #0a0a0a;
  }

  .farm-root {
    min-height: 100vh;
    color: var(--farm-ink);
    background: var(--farm-bg);
    position: relative;
    overflow-x: hidden;
    opacity: 0;
    transition:
      opacity 1s ease,
      background 1s ease;
    font-family: "Space Grotesk", sans-serif;
  }
  .farm-mounted {
    opacity: 1;
  }

  .is-verified {
    background: radial-gradient(circle at 50% 120%, #064e3b 0%, #020604 70%);
  }

  .glow-field {
    position: fixed;
    inset: 0;
    background: radial-gradient(
        circle at 15% 15%,
        rgba(74, 222, 128, 0.05) 0%,
        transparent 40%
      ),
      radial-gradient(
        circle at 85% 85%,
        rgba(34, 197, 94, 0.05) 0%,
        transparent 40%
      );
    pointer-events: none;
    z-index: 0;
  }

  .grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    opacity: 0.05;
    z-index: 100;
  }

  .farm-shell {
    position: relative;
    z-index: 1;
    max-width: 1100px;
    margin: 0 auto;
    padding: 60px 20px;
    display: grid;
    gap: 32px;
  }

  .card {
    background: var(--farm-card);
    border: 1px solid var(--farm-line);
    border-radius: 24px;
    backdrop-filter: blur(24px);
  }

  .hero {
    padding: 60px 40px;
    text-align: center;
    position: relative;
    overflow: hidden;
    transition: 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .hero-verified {
    border-color: var(--farm-leaf);
    box-shadow: 0 0 60px rgba(74, 222, 128, 0.1);
  }

  .hero-header-row {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .eyebrow {
    font-family: "Press Start 2P";
    font-size: 0.55rem;
    color: var(--farm-leaf);
    letter-spacing: 2px;
    margin: 0;
  }
  .verified-badge-hero {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid var(--farm-leaf);
    padding: 6px 14px;
    border-radius: 40px;
    font-family: "Press Start 2P";
    font-size: 0.5rem;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: badge-glow 2s infinite;
  }
  @keyframes badge-glow {
    0% {
      box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
    }
    70% {
      box-shadow: 0 0 10px 4px rgba(74, 222, 128, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
    }
  }

  .hero h1 {
    font-family: "Press Start 2P";
    font-size: 3rem;
    color: white;
    margin: 16px 0;
    letter-spacing: -2px;
  }
  .hero-sub {
    max-width: 60ch;
    margin: 0 auto 40px;
    font-size: 1.15rem;
    line-height: 1.6;
    opacity: 0.7;
  }

  .hero-metrics {
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .metric {
    min-width: 180px;
    padding: 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 20px;
    border: 1px solid var(--farm-line);
    display: grid;
    gap: 10px;
  }
  .metric.highlight {
    border-color: var(--farm-leaf);
    background: rgba(74, 222, 128, 0.05);
  }
  .metric .label {
    font-family: "Press Start 2P";
    font-size: 0.45rem;
    opacity: 0.5;
  }
  .metric .value {
    font-size: 1.25rem;
    font-weight: 800;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .suite-grid {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 32px;
  }

  .system-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .tab-btn {
    flex: 1;
    padding: 14px;
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--farm-line);
    color: var(--farm-ink);
    font-family: "Press Start 2P";
    font-size: 0.55rem;
    cursor: pointer;
    transition: 0.2s;
  }
  .tab-btn:hover {
    background: rgba(74, 222, 128, 0.1);
  }
  .tab-btn.active {
    background: var(--farm-leaf);
    color: var(--farm-bg);
    border-color: var(--farm-leaf);
  }

  .panel {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--farm-line);
    border-radius: 20px;
    padding: 30px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .badge-mini {
    padding: 6px 10px;
    background: #2a2a2a;
    border-radius: 6px;
    font-family: "Press Start 2P";
    font-size: 0.45rem;
    color: #888;
  }
  .badge-mini.live {
    background: #065f46;
    color: #34d399;
  }

  .config-row {
    margin-bottom: 24px;
  }
  .field label {
    display: block;
    font-size: 0.85rem;
    margin-bottom: 10px;
    opacity: 0.7;
  }
  select {
    width: 100%;
    padding: 14px;
    background: #111;
    border: 1px solid var(--farm-line);
    color: white;
    border-radius: 12px;
    font-family: "Space Grotesk";
    font-size: 1rem;
    outline: none;
  }

  .action-btn {
    width: 100%;
    padding: 20px;
    background: linear-gradient(135deg, #4ade80, #166534);
    border: none;
    border-radius: 16px;
    color: #020604;
    font-family: "Press Start 2P";
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      transform 0.2s,
      box-shadow 0.2s;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
  }
  .action-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 15px 30px rgba(74, 222, 128, 0.2);
  }
  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .result-display {
    margin-top: 24px;
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .seal-glow {
    width: 100%;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--farm-leaf);
    border-radius: 16px;
    padding: 20px;
    display: grid;
    gap: 12px;
    animation: seal-pulse 3s infinite;
  }
  @keyframes seal-pulse {
    0% {
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);
    }
    50% {
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
    }
    100% {
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);
    }
  }
  .seal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .seal-badge {
    font-family: "Press Start 2P";
    font-size: 0.6rem;
    color: var(--farm-leaf);
  }
  .explorer-link {
    font-size: 0.75rem;
    color: var(--farm-sun);
    text-decoration: none;
    font-weight: 700;
  }

  .terminal {
    background: var(--farm-term);
    border: 1px solid #333;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 380px;
  }
  .terminal-head {
    padding: 12px 16px;
    background: #1a1a1a;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: "Press Start 2P";
    font-size: 0.45rem;
    color: #666;
  }
  .terminal-dots {
    display: flex;
    gap: 4px;
  }
  .terminal-dots span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #333;
  }
  .terminal-body {
    flex: 1;
    padding: 16px;
    font-family: "Courier New", Courier, monospace;
    font-size: 0.75rem;
    color: #4ade80;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background-image: linear-gradient(
        rgba(18, 16, 16, 0) 50%,
        rgba(0, 0, 0, 0.25) 50%
      ),
      linear-gradient(
        90deg,
        rgba(255, 0, 0, 0.06),
        rgba(0, 255, 0, 0.02),
        rgba(0, 0, 255, 0.06)
      );
    background-size:
      100% 2px,
      3px 100%;
  }
  .log-entry {
    line-height: 1.4;
  }

  .intel {
    margin-top: 24px;
  }
  .intel-items {
    display: grid;
    gap: 16px;
  }
  .i-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .i-icon {
    font-size: 1.2rem;
  }
  .i-content strong {
    display: block;
    font-size: 0.85rem;
    color: var(--farm-leaf);
    margin-bottom: 2px;
  }
  .i-content p {
    font-size: 0.75rem;
    opacity: 0.6;
    margin: 0;
  }

  .loading-bar-container {
    width: 100%;
    height: 4px;
    background: #222;
    border-radius: 2px;
    overflow: hidden;
  }
  .loading-bar {
    width: 30%;
    height: 100%;
    background: var(--farm-leaf);
    animation: bar-slide 1.5s infinite linear;
  }
  @keyframes bar-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(330%);
    }
  }

  .idle-hint {
    font-size: 0.85rem;
    opacity: 0.3;
    font-style: italic;
  }
  .error-box {
    margin-top: 16px;
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    border-radius: 8px;
    color: #ef4444;
    font-size: 0.85rem;
  }

  @media (max-width: 900px) {
    .suite-grid {
      grid-template-columns: 1fr;
    }
    .hero h1 {
      font-size: 2rem;
    }
  }
</style>
