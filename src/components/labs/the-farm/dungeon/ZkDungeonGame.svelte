<script lang="ts">
    import { userState } from "../../../../stores/user.svelte.ts";
    import {
        balanceState,
        updateContractBalance,
    } from "../../../../stores/balance.svelte.ts";
    import {
        evaluateDoorAttempt,
        type Mode as DungeonMode,
    } from "../../../../lib/dungeon/evaluateDoorAttempt";
    import {
        getFloorDefinition,
        laneCodeForSeed,
        tierLabel,
        vaultLaneFromCode,
        type DoorDefinition,
        type DoorId,
        type VaultLaneName,
    } from "../../../../lib/dungeon/policies";
    import {
        dungeonLore,
        type DungeonRoomId,
    } from "../../../../data/dungeon/lore";
    import {
        publishDungeonStampMainnet,
        type DungeonStampKind,
    } from "../../../../lib/dungeon/publishDungeonStampMainnet";
    import {
        sha256Hex,
        sha256HexOfJson,
    } from "../../../../lib/the-farm/digest";
    import { getTierForBalance, TIER_CONFIG } from "../proof";
    import type { VerifierType } from "../../../../lib/dungeon/verifyCredential";
    import { attemptDoor as submitDoorAttempt } from "./dungeonService";
    import {
        connectTestnetWallet,
        disconnectTestnetWallet,
        getTestnetPublicKey,
        isTestnetConnected,
        hubStartGame,
        hubEndGame,
        fundWithFriendbot,
        HUB_CONTRACT_ID as TESTNET_HUB_CONTRACT,
    } from "./dungeonTestnetWallet";
    import {
        testnetConfig,
        type DungeonNetworkConfig,
    } from "../../../../lib/dungeon/networkConfig";

    // ── Game State ──────────────────────────────────────────────────────
    type GamePhase =
        | "title"
        | "lobby"
        | "airlock"
        | "playing"
        | "ledger"
        | "victory"
        | "defeat";
    type LobbyRole = "host" | "guest" | null;
    type DoorState = "idle" | "proving" | "correct" | "wrong";
    type RelayStatus = "disconnected" | "connecting" | "connected" | "error";

    const DOOR_COUNT = 8;
    const emptyDoorStates = () =>
        Array.from({ length: DOOR_COUNT }, () => "idle" as DoorState);

    const TOTAL_FLOORS = 3;
    const GATE_FLOORS = [1];

    let phase = $state<GamePhase>("title");
    let runId = $state<string>("");
    let runStartedAt = $state<number>(0);
    let entryClearanceGranted = $state<boolean>(false);
    let entryStamp = $state<{
        status:
            | "idle"
            | "simulating"
            | "assembling"
            | "signing"
            | "submitted"
            | "confirmed"
            | "error";
        txHash?: string;
        error?: string;
    }>({ status: "idle" });
    let withdrawalStamp = $state<{
        status:
            | "idle"
            | "simulating"
            | "assembling"
            | "signing"
            | "submitted"
            | "confirmed"
            | "error";
        txHash?: string;
        error?: string;
    }>({ status: "idle" });
    let lobbyCode = $state<string>("");
    let lobbyInput = $state<string>("");
    let lobbyRole = $state<LobbyRole>(null);
    let playerName = $state<string>("");
    let opponentName = $state<string>("");
    let currentFloor = $state<number>(1);
    let attempts = $state<number>(0);
    let doorStates = $state<DoorState[]>(emptyDoorStates());
    let activeDoor = $state<number | null>(null);
    let runLog = $state<RunLogEntry[]>([]);
    let gateWaiting = $state<boolean>(false);
    let fullscreen = $state<boolean>(false);
    let showHowItWorks = $state<boolean>(false);
    let floorTransition = $state<boolean>(false);
    let trainingMode = $state<boolean>(false);
    let presentedVerifierType = $state<VerifierType>("GROTH16");
    let presentedTouched = $state<boolean>(false);
    let advancedOnChainGuards = $state<boolean>(false);
    let attestedTierId = $state<number | null>(null);
    let trainingTierOverride = $state<number>(0);
    let credentialLoadError = $state<string | null>(null);
    let lastForensics = $state<
        import("./dungeonService").DoorAttemptResult | null
    >(null);
    // Freeze the credential snapshot + policy seed at run start so door policies remain stable.
    let runTierId = $state<number>(0);
    let runPolicySeed = $state<string>("");
    let groth16OnChain = $state<{
        status:
            | "idle"
            | "simulating"
            | "assembling"
            | "signing"
            | "submitted"
            | "confirmed"
            | "error";
        txHash?: string;
        error?: string;
    }>({ status: "idle" });
    let noirUltraHonkOnChain = $state<{
        status:
            | "idle"
            | "simulating"
            | "assembling"
            | "signing"
            | "submitted"
            | "confirmed"
            | "error";
        txHash?: string;
        error?: string;
    }>({ status: "idle" });
    let risc0Groth16OnChain = $state<{
        status:
            | "idle"
            | "simulating"
            | "assembling"
            | "signing"
            | "submitted"
            | "confirmed"
            | "error";
        txHash?: string;
        error?: string;
    }>({ status: "idle" });

    // Stable per-run salts used by the local prover endpoints for Noir/RISC0 on-chain proofs.
    // These are NOT secrets in this demo: they only bind artifacts to a specific run.
    let noirRoleSalt = $state<string>("");
    let risc0SaltByte = $state<number>(0);

    // ── Hackathon Mode (Testnet Game Hub via SWK/Freighter) ─────────
    let hackathonMode = $state<boolean>(false);
    let testnetAddress = $state<string | null>(null);
    let hackathonSessionId = $state<number>(0);
    let hubStartTxHash = $state<string | null>(null);
    let hubEndTxHash = $state<string | null>(null);
    let hubStatus = $state<
        | "idle"
        | "connecting"
        | "starting"
        | "started"
        | "ending"
        | "ended"
        | "error"
    >("idle");
    let hubError = $state<string | null>(null);

    /** When hackathon mode is active and testnet wallet connected, returns testnet config; otherwise undefined (mainnet default). */
    function getHackathonNet(): DungeonNetworkConfig | undefined {
        if (hackathonMode && testnetAddress) return testnetConfig();
        return undefined;
    }

    // Relay (real multiplayer presence via server state, Labs-only)
    type DungeonRosterEntry = {
        id: string;
        account: string;
        name: string;
        joinedAt: number;
        lastSeenAt: number;
        ready: boolean;
        floor: number;
        attempts: number;
        testnetAddress?: string;
    };
    type DungeonEvent =
        | { seq: number; kind: "system"; message: string; ts: number }
        | {
              seq: number;
              kind: "ready";
              account: string;
              ready: boolean;
              ts: number;
          }
        | { seq: number; kind: "start"; ts: number }
        | {
              seq: number;
              kind: "progress";
              account: string;
              floor: number;
              attempts: number;
              ts: number;
          };
    type DungeonEventInput =
        | { kind: "ready"; account: string; ready: boolean; ts: number }
        | { kind: "start"; ts: number }
        | {
              kind: "progress";
              account: string;
              floor: number;
              attempts: number;
              ts: number;
          };

    let relayStatus = $state<RelayStatus>("disconnected");
    let relayError = $state<string | null>(null);
    let relayToken = $state<string>("");
    let relayCursor = $state<number>(0);
    let relayRoster = $state<DungeonRosterEntry[]>([]);
    let readySelf = $state<boolean>(false);
    let pollHandle = $state<number | null>(null);

    interface RunLogEntry {
        floor: number;
        door: number;
        attempt: number;
        result: "correct" | "wrong" | "pending";
        proofType: string;
        txHash: string | null;
        timestamp: number;
        verified?: boolean;
        provingTimeMs?: number;
        commitment?: string | null;
        reasonCode?: string;
    }

    interface TxScienceEvent {
        id: string;
        hash: string;
        txKind: "PROOF_VERIFY" | "AUDIT_RECORD";
        roomLabel: string;
        actionLabel: string;
        proofSystem: string;
        timestamp: number;
        learningNote: string;
        network?: "mainnet" | "testnet";
        commitment?: string | null; // Poseidon commitment (Groth16 public input)
    }

    function proofSystemLabel(proofType: string): string {
        if (proofType.includes("UltraHonk") || proofType.includes("Noir"))
            return "Noir UltraHonk";
        if (proofType.includes("RISC0")) return "RISC0 Receipt/Groth16";
        if (proofType.includes("Groth16")) return "Groth16 BN254";
        return "Soroban Contract Tx";
    }

    function txKindBadge(kind: TxScienceEvent["txKind"]): string {
        return kind === "PROOF_VERIFY" ? "ON-CHAIN VERIFY" : "AUDIT RECORD";
    }

    let txScienceEvents = $derived(
        (() => {
            const out: TxScienceEvent[] = [];
            const seen = new Set<string>();

            const add = (event: TxScienceEvent) => {
                if (!event.hash || seen.has(event.hash)) return;
                seen.add(event.hash);
                out.push(event);
            };

            const verifyNetwork: "mainnet" | "testnet" | undefined =
                hackathonMode && testnetAddress ? "testnet" : undefined;

            if (entryStamp.txHash) {
                add({
                    id: `entry:${entryStamp.txHash}`,
                    hash: entryStamp.txHash,
                    txKind: "AUDIT_RECORD",
                    roomLabel: "ROOM 0 AIRLOCK",
                    actionLabel: "ENTRY STAMP",
                    proofSystem:
                        verifyNetwork === "testnet"
                            ? "SWK/Freighter + Soroban Record"
                            : "Passkey + Soroban Record",
                    timestamp: runStartedAt || 0,
                    learningNote:
                        "Digest-only audit marker. Proves run start without exposing private room data.",
                    network: verifyNetwork,
                });
            }

            for (const entry of runLog) {
                if (!entry.txHash) continue;
                const proofSystem = proofSystemLabel(entry.proofType);
                const txKind: TxScienceEvent["txKind"] =
                    entry.reasonCode === "ONCHAIN_VERIFIED"
                        ? "PROOF_VERIFY"
                        : "AUDIT_RECORD";

                // Per-system action labels and learning notes
                const isNoir =
                    proofSystem.includes("Noir") ||
                    proofSystem.includes("UltraHonk");
                const isRisc0 = proofSystem.includes("RISC0");
                const isGroth16 = proofSystem.includes("Groth16") && !isRisc0;

                const actionLabel =
                    txKind === "PROOF_VERIFY"
                        ? isNoir
                            ? "ULTRAHONK PROOF ACCEPTED"
                            : isRisc0
                              ? "RISC0 RECEIPT ACCEPTED"
                              : "GROTH16 PROOF ACCEPTED"
                        : "RUN EVENT";

                const learningNote =
                    txKind === "PROOF_VERIFY"
                        ? isNoir
                            ? "Noir UltraHonk proof verified on-chain via the farm-attestations verifier bridge. bb.js generated the proof in-browser; Soroban ran the pairing check."
                            : isRisc0
                              ? "RISC0 zkVM receipt wrapped in a BN254 Groth16 proof, verified on-chain via the risc0-groth16-verifier contract. Proves execution of the RISC0 guest program without revealing inputs."
                              : "Groth16 BN254 proof verified on-chain by the Tier Verifier contract (CAP-0074 bn254 host functions). snarkjs generated the proof using a Poseidon commitment (address + balance + salt) as the public input binding; Soroban ran the pairing check."
                        : "Run metadata recorded on-chain.";

                add({
                    id: `${entry.timestamp}:${entry.txHash}`,
                    hash: entry.txHash,
                    txKind,
                    roomLabel:
                        entry.door >= 0
                            ? `ROOM ${entry.floor} DOOR ${entry.door + 1}`
                            : `ROOM ${entry.floor}`,
                    actionLabel,
                    proofSystem,
                    timestamp: entry.timestamp,
                    learningNote,
                    network: verifyNetwork,
                    commitment: entry.commitment,
                });
            }

            if (withdrawalStamp.txHash) {
                add({
                    id: `withdrawal:${withdrawalStamp.txHash}`,
                    hash: withdrawalStamp.txHash,
                    txKind: "AUDIT_RECORD",
                    roomLabel: "ROOM 4 LEDGER",
                    actionLabel: "WITHDRAWAL RECORD",
                    proofSystem:
                        verifyNetwork === "testnet"
                            ? "SWK/Freighter + Soroban Record"
                            : "Passkey + Soroban Record",
                    timestamp:
                        runLog[runLog.length - 1]?.timestamp ??
                        runStartedAt ??
                        0,
                    learningNote:
                        "Digest-only completion record for reviewer/audit traceability.",
                    network: verifyNetwork,
                });
            }

            // Hackathon Mode: game hub contract calls (testnet)
            if (hubStartTxHash) {
                add({
                    id: `hub-start:${hubStartTxHash}`,
                    hash: hubStartTxHash,
                    txKind: "AUDIT_RECORD",
                    roomLabel: "GAME HUB",
                    actionLabel: "start_game()",
                    proofSystem: "Testnet Hub (SWK/Freighter)",
                    timestamp: runStartedAt || 0,
                    learningNote:
                        "Registers game session with the hackathon game hub contract on Stellar Testnet.",
                    network: "testnet",
                });
            }
            if (hubEndTxHash) {
                add({
                    id: `hub-end:${hubEndTxHash}`,
                    hash: hubEndTxHash,
                    txKind: "AUDIT_RECORD",
                    roomLabel: "GAME HUB",
                    actionLabel: "end_game()",
                    proofSystem: "Testnet Hub (SWK/Freighter)",
                    timestamp:
                        runLog[runLog.length - 1]?.timestamp ??
                        runStartedAt ??
                        0,
                    learningNote:
                        "Finalizes game session with the hackathon game hub contract on Stellar Testnet.",
                    network: "testnet",
                });
            }

            out.sort((a, b) => a.timestamp - b.timestamp);
            return out;
        })(),
    );

    let txScienceStats = $derived(
        (() => {
            const total = txScienceEvents.length;
            const verifies = txScienceEvents.filter(
                (e) => e.txKind === "PROOF_VERIFY",
            ).length;
            const records = txScienceEvents.filter(
                (e) => e.txKind === "AUDIT_RECORD",
            ).length;
            const proofSamples = runLog.filter(
                (e) =>
                    e.door >= 0 &&
                    typeof e.provingTimeMs === "number" &&
                    e.provingTimeMs > 0,
            );
            const avgProofMs =
                proofSamples.length > 0
                    ? Math.round(
                          proofSamples.reduce(
                              (sum, e) => sum + Number(e.provingTimeMs || 0),
                              0,
                          ) / proofSamples.length,
                      )
                    : 0;
            return { total, verifies, records, avgProofMs };
        })(),
    );

    // ── Derived State ───────────────────────────────────────────────────
    let walletAddress = $derived(
        hackathonMode && testnetAddress ? testnetAddress : userState.contractId,
    );
    let isConnected = $derived(
        hackathonMode
            ? !!testnetAddress
            : !!userState.contractId && !!userState.keyId,
    );
    let isGateFloor = $derived(GATE_FLOORS.includes(currentFloor));
    let progressPct = $derived(((currentFloor - 1) / TOTAL_FLOORS) * 100);
    let walletLabel = $derived(
        walletAddress
            ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
            : "",
    );
    let tierFromBalance = $derived(
        balanceState.balance !== null
            ? getTierForBalance(balanceState.balance)
            : null,
    );
    let effectiveTierId = $derived(
        trainingMode && !isConnected
            ? trainingTierOverride
            : tierFromBalance !== null
              ? tierFromBalance
              : attestedTierId !== null
                ? attestedTierId
                : trainingTierOverride,
    );
    let policySeed = $derived(
        (runPolicySeed || runId || walletAddress || "demo").toString(),
    );
    let activeLaneCode = $derived(laneCodeForSeed(policySeed, currentFloor));
    let activeLane = $derived(vaultLaneFromCode(activeLaneCode));
    let floorDef = $derived(
        getFloorDefinition(currentFloor, {
            seed: policySeed,
            tierId: runTierId || effectiveTierId,
        }),
    );
    let effectiveMode = $derived<DungeonMode>(
        trainingMode ? "training" : "normal",
    );
    let shownTierId = $derived(runTierId || effectiveTierId);
    let shownTierParity = $derived(shownTierId % 2 === 0 ? "EVEN" : "ODD");
    let hasOpponent = $derived(
        relayRoster.filter((r) => r.account !== walletAddress).length > 0,
    );
    let allReady = $derived(
        relayRoster.length >= 2 && relayRoster.every((r) => r.ready),
    );
    let opponentProgress = $derived(
        relayRoster.find((r) => r.account !== walletAddress) || null,
    );
    let opponentReady = $derived(!!opponentProgress && opponentProgress.ready);
    let multiplayerEnabled = $derived(
        relayToken.length > 0 && relayRoster.length >= 2,
    );
    let roomId = $derived<DungeonRoomId>(
        phase === "airlock"
            ? "airlock"
            : phase === "ledger" || phase === "victory"
              ? "ledger"
              : floorDef.roomId,
    );
    let roomThemeClass = $derived(`dg-room-${roomId}`);
    let roomLore = $derived(dungeonLore[roomId]);
    let roomHeaderArt = $derived<string>(
        roomId === "airlock"
            ? "/labs/zkdungeon/art/room-airlock.webp"
            : roomId === "intake"
              ? "/labs/zkdungeon/art/room-intake.webp"
              : roomId === "catalog"
                ? "/labs/zkdungeon/art/room-catalog.webp"
                : roomId === "cold"
                  ? "/labs/zkdungeon/art/room-cold.webp"
                  : "/labs/zkdungeon/art/room-ledger.webp",
    );
    let guardianArt = $derived<string>(
        roomId === "catalog"
            ? "/labs/zkdungeon/art/guardian-noir.webp"
            : roomId === "cold"
              ? "/labs/zkdungeon/art/guardian-risc0.webp"
              : "/labs/zkdungeon/art/guardian-groth16.webp",
    );
    let verifierBadgeArt = $derived<string>(
        roomId === "catalog"
            ? "/labs/zkdungeon/art/badge-noir.webp"
            : roomId === "cold"
              ? "/labs/zkdungeon/art/badge-risc0.webp"
              : "/labs/zkdungeon/art/badge-groth16.webp",
    );

    // DEV-only local prover service (Node + WSL). This is intentionally out-of-band from
    // the Cloudflare adapter build, so the frontend stays deployable.
    // In production, the browser calls same-origin `/api/dungeon/prover/*` which proxies to a configured prover service.
    // In local dev, you can optionally bypass the proxy by setting PUBLIC_LOCAL_PROVER_URL.
    function proverUrl(path: string): string {
        const local = (import.meta.env.PUBLIC_LOCAL_PROVER_URL ?? "")
            .toString()
            .trim();
        const isDev = ((import.meta as any)?.env?.DEV ?? false) === true;
        if (isDev && local) {
            const base = local.endsWith("/") ? local.slice(0, -1) : local;
            return `${base}${path.startsWith("/") ? path : `/${path}`}`;
        }
        return `/api/dungeon/prover${path.startsWith("/") ? path : `/${path}`}`;
    }
    let localProverHealth = $state<{ ok: boolean; error?: string }>({
        ok: false,
    });

    async function refreshLocalProverHealth(): Promise<void> {
        // Do not probe same-origin `/api/*` in production (Cloudflare Pages may not have these routes).
        // In DEV, if `PUBLIC_LOCAL_PROVER_URL` is set, this gives a quick "connected/offline" hint.
        const local = (import.meta.env.PUBLIC_LOCAL_PROVER_URL ?? "")
            .toString()
            .trim();
        const isDev = ((import.meta as any)?.env?.DEV ?? false) === true;
        if (!isDev || !local) {
            localProverHealth = { ok: false };
            return;
        }
        try {
            const res = await fetch(proverUrl("/health"), { method: "GET" });
            const json = await res.json().catch(() => null);
            localProverHealth = { ok: !!json?.ok };
        } catch (e) {
            localProverHealth = {
                ok: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    async function pasteRoomCode(): Promise<void> {
        try {
            const text = await navigator.clipboard.readText();
            const cleaned = (text || "")
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 12);
            if (cleaned.length >= 4) lobbyInput = cleaned;
        } catch {}
    }

    function lobbyInviteLink(code: string): string {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set("room", code);
            return url.toString();
        } catch {
            return "";
        }
    }

    async function copyLobbyInviteLink(): Promise<void> {
        try {
            const link = lobbyInviteLink(lobbyCode);
            if (link) await navigator.clipboard.writeText(link);
        } catch {}
    }

    function txExplorerUrlMainnet(txHash: string): string {
        return `https://stellar.expert/explorer/public/tx/${txHash}`;
    }

    function txExplorerUrlTestnet(txHash: string): string {
        return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    }

    /** Returns the correct explorer URL — uses testnet explorer when hackathon mode is active. */
    function txExplorerUrl(txHash: string, isTestnet?: boolean): string {
        const useTestnet = isTestnet ?? (hackathonMode && !!testnetAddress);
        return useTestnet
            ? txExplorerUrlTestnet(txHash)
            : txExplorerUrlMainnet(txHash);
    }

    function doorDef(doorId: DoorId): DoorDefinition {
        return floorDef.doors.find((d) => d.id === doorId) as DoorDefinition;
    }

    function doorWouldAccept(door: DoorDefinition): boolean {
        const out = evaluateDoorAttempt({
            floor: currentFloor,
            doorId: door.id,
            policySeed,
            proofOk: true,
            provenInputs: { tierId: runTierId || effectiveTierId },
            lobbyState: { enabled: false },
            mode: effectiveMode,
        });
        return out.accepted;
    }

    // Reset the presented verifier to the expected wing verifier when the floor changes.
    // (Players can override to see a truthful "wrong format" forensic.)
    let lastFloorSeen = 0;
    $effect(() => {
        if (currentFloor !== lastFloorSeen) {
            lastFloorSeen = currentFloor;
            presentedTouched = false;
            presentedVerifierType = floorDef.verifierType as VerifierType;
        }
    });

    $effect(() => {
        attestedTierId = null;
        credentialLoadError = null;

        if (!isConnected || !walletAddress) return;

        let cancelled = false;
        (async () => {
            const { readFarmAttestationTier } = await import(
                "../../../../lib/dungeon/readFarmAttestationTier"
            );
            const res = await readFarmAttestationTier(
                walletAddress,
                getHackathonNet(),
            );
            if (cancelled) return;
            if (res.ok) {
                attestedTierId = res.tierId;
            } else {
                credentialLoadError = res.reason;
            }

            // Keep KALE balance fresh for Groth16 tier proofs (the circuit may enforce thresholds).
            if (!hackathonMode) {
                try {
                    await updateContractBalance(walletAddress);
                } catch {}
            }
        })().catch((err) => {
            if (cancelled) return;
            credentialLoadError =
                err instanceof Error ? err.message : String(err);
        });

        return () => {
            cancelled = true;
        };
    });

    // One-click join: if the URL has `?room=XXXX`, prefill and auto-join once (wallet required for relay).
    let autoJoinTried = false;
    $effect(() => {
        if (autoJoinTried) return;
        if (phase !== "title") return;
        if (!isConnected) return;
        if (typeof window === "undefined") return;
        const room = new URLSearchParams(window.location.search).get("room");
        if (!room) return;
        const cleaned = room
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 12);
        if (cleaned.length < 4) return;
        autoJoinTried = true;
        lobbyInput = cleaned;
        setTimeout(() => joinLobby(), 50);
    });

    async function waitForTx(
        hash: string,
        rpcUrl?: string,
    ): Promise<"success" | "failed" | "timeout"> {
        const { rpc } = await import("@stellar/stellar-sdk/minimal");
        let resolvedUrl = rpcUrl;
        if (!resolvedUrl) {
            const { getBestRpcUrl } = await import("../../../../utils/rpc");
            resolvedUrl = getBestRpcUrl();
        }
        const server = new rpc.Server(resolvedUrl);

        for (let attempt = 0; attempt < 50; attempt += 1) {
            try {
                const tx = await server.getTransaction(hash);
                if (tx.status === rpc.Api.GetTransactionStatus.SUCCESS)
                    return "success";
                if (tx.status === rpc.Api.GetTransactionStatus.FAILED)
                    return "failed";
            } catch {
                // Transient RPC error (network blip, 503, etc.) — keep polling.
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 1200));
        }

        return "timeout";
    }

    // ── Actions ─────────────────────────────────────────────────────────

    function generateLobbyCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    function stopRelayPolling() {
        if (pollHandle !== null) {
            window.clearInterval(pollHandle);
            pollHandle = null;
        }
    }

    function applyRoster(roster: DungeonRosterEntry[]) {
        relayRoster = roster;
        if (!walletAddress) {
            console.log(
                "[ApplyRoster] No local walletAddress, cannot find opponent.",
            );
            return;
        }
        const other = roster.find((r) => r.account !== walletAddress);
        console.log(
            "[ApplyRoster] Searching for opponent. Local:",
            walletAddress,
            "Found:",
            other,
        );
        opponentName = other?.name || "";
    }

    // The game state API is proxying to the main app domain `kalefarm.xyz`.
    // We use a Cloudflare Pages Function proxy (our own /api/dungeon routes)
    // to forward these requests server-side, completely bypassing browser CORS.
    const RELAY_API_BASE = "";

    async function relayJoin(roomId: string) {
        relayStatus = "connecting";
        relayError = null;

        const account = hackathonMode
            ? testnetAddress || ""
            : userState.contractId || "";
        if (!account) throw new Error("Wallet not connected");

        console.log(
            `[RelayJoin] Joining Room:${roomId} as Account:${account} (Hackathon:${hackathonMode})`,
        );

        // Append /api/dungeon... to the base URL
        // If RELAY_API_BASE is "https://kalefarm.xyz", we want "https://kalefarm.xyz/api/dungeon/..."
        const url = `${RELAY_API_BASE}/api/dungeon/rooms/${encodeURIComponent(roomId)}/join`;

        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account,
                name: playerName || walletLabel || "Seeker",
                ...(testnetAddress ? { testnetAddress } : {}),
            }),
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `Join failed (${resp.status})`);
        }

        const data = (await resp.json()) as {
            token: string;
            roster: DungeonRosterEntry[];
            cursor: number;
        };
        relayToken = data.token || "";
        relayCursor = typeof data.cursor === "number" ? data.cursor : 0;
        applyRoster(Array.isArray(data.roster) ? data.roster : []);
        relayStatus = "connected";
    }

    async function relayPollOnce() {
        if (!relayToken || !lobbyCode) return;

        // Clear any previous transient error so the UI doesn't show stale errors
        // once the relay is responding successfully again.
        relayError = null;
        if (relayStatus === "error") relayStatus = "connected";

        const url = `${RELAY_API_BASE}/api/dungeon/rooms/${encodeURIComponent(lobbyCode)}/events?cursor=${encodeURIComponent(String(relayCursor))}`;

        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${relayToken}` },
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `Relay poll failed (${resp.status})`);
        }

        const data = (await resp.json()) as {
            roster: DungeonRosterEntry[];
            events: DungeonEvent[];
            cursor: number;
        };

        // DEBUG: Log roster updates to debug visibility issues
        if (phase === "lobby") {
            console.log(
                `[RelayPoll] Room:${lobbyCode} Roster:${data.roster.length}`,
                data.roster,
                "Local:",
                walletAddress,
            );
        }

        relayCursor =
            typeof data.cursor === "number" ? data.cursor : relayCursor;
        applyRoster(Array.isArray(data.roster) ? data.roster : []);

        const events = Array.isArray(data.events) ? data.events : [];
        for (const evt of events) {
            if (evt.kind === "start") {
                if (phase === "lobby") {
                    console.log("[RelayPoll] Received START event from host");
                    await startGameLocal({ fromRemote: true });
                }
            }
        }

        // Only manage the multiplayer-sync gate when the player is NOT on a gate floor.
        // When currentFloor IS a gate floor (e.g. floor 1), gateWaiting may be set
        // by the on-chain verification overlay — polling must not clear it early.
        // After advancing past a gate floor (e.g. currentFloor=2), isGateFloor=false
        // and polling manages the sync gate normally.
        if (gateWaiting && !isGateFloor) {
            if (!multiplayerEnabled) {
                // Opponent disconnected — unblock so the player isn't stuck indefinitely.
                gateWaiting = false;
            } else {
                const roster = relayRoster;
                if (
                    roster.length >= 2 &&
                    roster.every((r) => r.floor >= currentFloor)
                ) {
                    gateWaiting = false;
                }
            }
        }
    }

    async function relayPost(event: DungeonEventInput) {
        if (!relayToken || !lobbyCode) return;
        const resp = await fetch(
            `/api/dungeon/rooms/${encodeURIComponent(lobbyCode)}/events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${relayToken}`,
                },
                body: JSON.stringify(event),
            },
        );
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `Relay post failed (${resp.status})`);
        }
    }

    function startRelayPolling() {
        stopRelayPolling();
        if (!relayToken || !lobbyCode) return;
        pollHandle = window.setInterval(() => {
            relayPollOnce().catch((err) => {
                relayStatus = "error";
                relayError = err instanceof Error ? err.message : String(err);
            });
        }, 850);
    }

    async function setReady(nextReady: boolean) {
        readySelf = nextReady;
        if (!walletAddress) return;
        await relayPost({
            kind: "ready",
            account: walletAddress,
            ready: nextReady,
            ts: Date.now(),
        });
    }

    async function createLobby() {
        warmupDungeonVerifiers();

        lobbyCode = generateLobbyCode();
        lobbyRole = "host";
        playerName = walletLabel || "Seeker-1";
        opponentName = "";
        phase = "lobby";

        try {
            await relayJoin(lobbyCode);
            await setReady(true);
            startRelayPolling();
        } catch (err) {
            relayStatus = "error";
            relayError = err instanceof Error ? err.message : String(err);
            readySelf = false;
        }
    }

    async function joinLobby() {
        warmupDungeonVerifiers();

        if (lobbyInput.length < 4) return;
        lobbyCode = lobbyInput.toUpperCase();
        lobbyRole = "guest";
        playerName = walletLabel || "Seeker-2";
        opponentName = "";
        phase = "lobby";

        try {
            await relayJoin(lobbyCode);
            startRelayPolling();
        } catch (err) {
            relayStatus = "error";
            relayError = err instanceof Error ? err.message : String(err);
        }
    }

    async function startGameLocal(opts?: { fromRemote?: boolean }) {
        // Ensure per-run identifiers/salts exist even when starting from a 2P lobby flow.
        if (!runId || !runStartedAt) {
            runId = crypto.randomUUID();
            runStartedAt = Date.now();
            {
                const bytes = crypto.getRandomValues(new Uint8Array(4));
                noirRoleSalt = String(
                    new DataView(bytes.buffer).getUint32(0, false),
                );
                risc0SaltByte = Number(bytes[0] || 22);
            }
        }

        // Freeze policy seed + clearance snapshot for the run so doors don't reshuffle mid-session.
        if (!runPolicySeed) runPolicySeed = runId;
        runTierId = effectiveTierId;
        await refreshLocalProverHealth();

        currentFloor = 1;
        attempts = 0;
        runLog = [];
        doorStates = emptyDoorStates();
        gateWaiting = false;
        lastForensics = null;
        groth16OnChain = { status: "idle" };
        noirUltraHonkOnChain = { status: "idle" };
        risc0Groth16OnChain = { status: "idle" };

        // ── Hackathon Mode: call start_game() on testnet hub ────────
        // Only the host (or a solo player) registers the session — the guest skips this
        // so we avoid duplicate registrations for the same run.
        if (hackathonMode && testnetAddress && !opts?.fromRemote) {
            try {
                hubStatus = "starting";
                hubError = null;
                hackathonSessionId = Math.floor(Math.random() * 0x7fffffff);
                // Find opponent's testnet G-address from the relay roster (stored at join time).
                // Use opponentProgress (derived from roster) rather than the display-only
                // opponentName string, which can be empty even when a real opponent exists.
                const opponentEntry = opponentProgress ?? undefined;
                const txHash = await hubStartGame({
                    gameId: TESTNET_HUB_CONTRACT,
                    sessionId: hackathonSessionId,
                    player1: testnetAddress,
                    player2: opponentEntry?.testnetAddress || undefined,
                });
                hubStartTxHash = txHash;
                hubStatus = "started";
                console.log("[HackathonMode] start_game() tx:", txHash);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("[HackathonMode] start_game() failed:", msg);
                hubError = msg;
                hubStatus = "error";
                // Don't block gameplay — the ZK proof flow still works
            }
        }

        phase = "playing";

        addLogEntry({
            floor: 0,
            door: -1,
            attempt: 0,
            result: "correct",
            proofType: "Local",
            txHash: null,
            timestamp: Date.now(),
        });

        if (relayToken && walletAddress) {
            try {
                await relayPost({
                    kind: "progress",
                    account: walletAddress,
                    floor: 1,
                    attempts: 0,
                    ts: Date.now(),
                });
            } catch {}
        }

        if (opts?.fromRemote && relayToken) startRelayPolling();
    }

    async function hostStartGame() {
        try {
            if (hasOpponent) await relayPost({ kind: "start", ts: Date.now() });
            await startGameLocal();
        } catch (err) {
            relayStatus = "error";
            relayError = err instanceof Error ? err.message : String(err);
        }
    }

    async function chooseDoor(doorIndex: number) {
        if (doorStates[doorIndex] !== "idle" || activeDoor !== null) return;
        if (gateWaiting) return;

        activeDoor = doorIndex;
        doorStates[doorIndex] = "proving";
        attempts++;

        let result: import("./dungeonService").DoorAttemptResult;
        try {
            // Submit door attempt via dungeon service (local proof gen + local verify)
            result = await submitDoorAttempt({
                lobbyId: lobbyCode || "SOLO",
                floor: currentFloor,
                doorChoice: doorIndex,
                attemptNonce: attempts,
                playerAddress: walletAddress ?? "anonymous",
                keyId: userState.keyId ?? "",
                contractId: userState.contractId ?? "",
                policySeed,
                tierId: runTierId || effectiveTierId,
                balance: balanceState.balance ?? 0n,
                mode: effectiveMode,
                lobbyState: {
                    enabled: multiplayerEnabled,
                    waiting: gateWaiting,
                    reason: gateWaiting
                        ? "Waiting for the other player to reach this floor"
                        : undefined,
                },
                presentedVerifierType,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[Dungeon] submitDoorAttempt failed:", msg);
            lastForensics = {
                accepted: false,
                reasonCode: "ERROR",
                reasonHuman: "Internal error",
                forensics: {
                    policyName: floorDef.policyName,
                    policyRule: floorDef.briefing,
                    doorRequirement: `Door ${doorIndex + 1}`,
                    yourCredentialSummary: `Tier ${tierLabel(runTierId || effectiveTierId)} (T${runTierId || effectiveTierId})`,
                    mismatchExplanation: msg,
                    nextAction:
                        "Retry. If it keeps happening, refresh the page.",
                },
                tierId: runTierId || effectiveTierId,
                proofOk: false,
                txHash: null,
                proofType: "Unknown",
                verifierType: floorDef.verifierType,
                commitment: null,
                provingTimeMs: 0,
                error: msg,
            } as any;
            doorStates = emptyDoorStates();
            activeDoor = null;
            gateWaiting = false;
            return;
        }

        lastForensics = result;
        const accepted = result.accepted;
        doorStates[doorIndex] = accepted ? "correct" : "wrong";

        addLogEntry({
            floor: currentFloor,
            door: doorIndex,
            attempt: attempts,
            result: accepted ? "correct" : "wrong",
            proofType: result.proofType,
            txHash: result.txHash,
            timestamp: Date.now(),
            verified: result.proofOk,
            provingTimeMs: result.provingTimeMs,
            commitment: result.commitment,
            reasonCode: result.reasonCode,
        });

        // Progress event (keep roster attempts fresh even on wrong doors)
        if (relayToken && walletAddress) {
            try {
                await relayPost({
                    kind: "progress",
                    account: walletAddress,
                    floor: currentFloor,
                    attempts,
                    ts: Date.now(),
                });
            } catch {}
        }

        // Animate then advance
        await new Promise((r) => setTimeout(r, 800));

        if (accepted) {
            // Room 1 (Groth16 wing): if a passkey wallet is connected (or testnet wallet in hackathon mode),
            // require real on-chain proof verification via Tier Verifier before advancing.
            const hackathonNet = getHackathonNet();
            if (currentFloor === 1 && (isConnected || hackathonNet)) {
                if (
                    !result.groth16 ||
                    (!hackathonNet &&
                        (!userState.contractId || !userState.keyId))
                ) {
                    lastForensics = {
                        ...result,
                        accepted: false,
                        reasonCode: "ERROR",
                        reasonHuman:
                            "Cannot submit on-chain verification (missing proof bundle or wallet)",
                        forensics: {
                            ...result.forensics,
                            mismatchExplanation:
                                "On-chain Groth16 verification requires a connected passkey wallet and a generated proof bundle.",
                            nextAction:
                                "Connect your passkey wallet and retry the door.",
                        },
                    };
                    doorStates = emptyDoorStates();
                    activeDoor = null;
                    return;
                }

                try {
                    gateWaiting = true;
                    groth16OnChain = { status: "simulating" };

                    const { submitProofToContract } = await import(
                        "../zkProof"
                    );
                    const submitRes = await submitProofToContract(
                        // @ts-ignore
                        (window as any).passkeyKit,
                        (hackathonNet
                            ? testnetAddress
                            : userState.contractId) as string,
                        result.tierId,
                        result.groth16.commitmentBytes,
                        result.groth16.proof,
                        result.groth16.publicSignals,
                        userState.keyId ?? undefined,
                        {
                            net: hackathonNet,
                            onStage: (stage) => {
                                if (stage === "simulating")
                                    groth16OnChain = { status: "simulating" };
                                if (stage === "assembling")
                                    groth16OnChain = { status: "assembling" };
                                if (stage === "signing")
                                    groth16OnChain = { status: "signing" };
                                if (stage === "submitted")
                                    groth16OnChain = { status: "submitted" };
                            },
                        },
                    );

                    if (!submitRes.success || !submitRes.txHash) {
                        throw new Error(
                            submitRes.error || "On-chain verification failed",
                        );
                    }

                    groth16OnChain = {
                        status: "submitted",
                        txHash: submitRes.txHash,
                    };

                    addLogEntry({
                        floor: currentFloor,
                        door: doorIndex,
                        attempt: attempts,
                        result: "correct",
                        proofType: "On-chain Groth16 (Tier Verifier)",
                        txHash: submitRes.txHash,
                        timestamp: Date.now(),
                        verified: true,
                        provingTimeMs: result.provingTimeMs,
                        commitment: result.commitment,
                        reasonCode: "ONCHAIN_VERIFIED",
                    });

                    const confirmed = await waitForTx(
                        submitRes.txHash,
                        hackathonNet?.rpcUrl,
                    );
                    if (confirmed === "success") {
                        groth16OnChain = {
                            status: "confirmed",
                            txHash: submitRes.txHash,
                        };
                    } else if (confirmed === "failed") {
                        groth16OnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "On-chain tx failed",
                        };
                        throw new Error(
                            "On-chain verification transaction failed",
                        );
                    } else {
                        groth16OnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "Confirmation timed out",
                        };
                        throw new Error(
                            "On-chain verification confirmation timed out",
                        );
                    }
                } catch (err) {
                    groth16OnChain = {
                        status: "error",
                        error: err instanceof Error ? err.message : String(err),
                        txHash: groth16OnChain.txHash,
                    };
                    lastForensics = {
                        ...result,
                        accepted: false,
                        reasonCode: "ONCHAIN_VERIFY_FAILED",
                        reasonHuman:
                            "Door policy matched, but on-chain proof verification failed",
                        forensics: {
                            ...result.forensics,
                            mismatchExplanation:
                                groth16OnChain.error ||
                                "On-chain verification failed.",
                            nextAction:
                                "Retry the door. If RPC is flaky, wait a moment and retry.",
                        },
                    };
                    doorStates = emptyDoorStates();
                    activeDoor = null;
                    gateWaiting = false;
                    return;
                } finally {
                    gateWaiting = false;
                }
            }

            // Room 2 (Noir wing): if a passkey wallet is connected, optionally perform *real*
            // on-chain UltraHonk verification (via the app's SSOT farm-attestations contract,
            // which delegates to an upgradeable ultrahonk verifier contract).
            //
            // Production: proof generation requires an external prover service (proxied via /api/dungeon/prover/*).
            // If the prover is unavailable, we fall back to a bundled training proof (still cryptographically real),
            // and we label it as training-only.
            if (currentFloor === 2 && isConnected && advancedOnChainGuards) {
                if (!userState.contractId || !userState.keyId) {
                    lastForensics = {
                        ...result,
                        accepted: false,
                        reasonCode: "ERROR",
                        reasonHuman:
                            "Cannot submit on-chain UltraHonk verification (wallet missing)",
                        forensics: {
                            ...result.forensics,
                            mismatchExplanation:
                                "On-chain UltraHonk verification requires a connected passkey wallet.",
                            nextAction:
                                "Connect your passkey wallet and retry the door.",
                        },
                    };
                    doorStates = emptyDoorStates();
                    activeDoor = null;
                    return;
                }

                try {
                    noirUltraHonkOnChain = { status: "simulating" };

                    // Generate a proof bound to this dungeon run (prover service via proxy; optional direct URL in DEV).
                    const requiredRole =
                        floorDef?.doors?.[doorIndex]?.policy?.kind ===
                        "exact-tier+lane"
                            ? floorDef.doors[doorIndex].policy.requiredTierExact
                            : runTierId || effectiveTierId;

                    const {
                        noirUltraHonkRoleLegacyBundle,
                        noirUltraHonkRoleLegacyVkDigestHex,
                    } = await import(
                        "../../../../data/dungeon/noirUltraHonkRoleLegacyBundle"
                    );

                    let usedTrainingNoir = false;
                    let proofOverride: {
                        proofBase64: string;
                        publicInputs: string[];
                    };

                    try {
                        const proverResp = await fetch(
                            proverUrl("/noir-ultrahonk-role"),
                            {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                    requiredRole,
                                    role: runTierId || effectiveTierId,
                                    salt: noirRoleSalt || "0",
                                }),
                            },
                        );

                        const proverJson = await proverResp
                            .json()
                            .catch(() => null);
                        if (!proverResp.ok || !proverJson?.ok) {
                            throw new Error(
                                proverJson?.error || "Prover unavailable",
                            );
                        }

                        proofOverride = {
                            proofBase64: String(
                                proverJson.sample?.proof?.proofBase64 ?? "",
                            ),
                            publicInputs: Array.isArray(
                                proverJson.sample?.proof?.publicInputs,
                            )
                                ? proverJson.sample.proof.publicInputs
                                : [],
                        };
                        if (
                            !proofOverride.proofBase64 ||
                            proofOverride.publicInputs.length === 0
                        ) {
                            throw new Error(
                                "Prover returned an invalid proof payload",
                            );
                        }
                    } catch {
                        // Contest-friendly fallback: use a bundled training proof (real verifier still runs).
                        usedTrainingNoir = true;
                        const sample =
                            noirUltraHonkRoleLegacyBundle.samples.find(
                                (s) => s.expectedValid,
                            ) ?? noirUltraHonkRoleLegacyBundle.samples[0];
                        proofOverride = {
                            proofBase64: String(
                                sample?.proof?.proofBase64 ?? "",
                            ),
                            publicInputs: Array.isArray(
                                sample?.proof?.publicInputs,
                            )
                                ? sample.proof.publicInputs
                                : [],
                        };
                        if (
                            !proofOverride.proofBase64 ||
                            proofOverride.publicInputs.length === 0
                        ) {
                            throw new Error(
                                "No bundled Noir training proof available",
                            );
                        }
                    }

                    // Integrity: locally verify the returned proof against this room's VK before submitting on-chain.
                    const { verifyUltraHonkProofWithVk } = await import(
                        "../../../../lib/dungeon/verifiers/noirUltraHonkVk"
                    );
                    const localVerify = await verifyUltraHonkProofWithVk({
                        vkBase64:
                            noirUltraHonkRoleLegacyBundle.verifier.vkBase64,
                        oracleHash:
                            noirUltraHonkRoleLegacyBundle.verifier.oracleHash,
                        proofBase64: proofOverride.proofBase64,
                        publicInputs: proofOverride.publicInputs,
                    });
                    if (!localVerify.valid) {
                        throw new Error(
                            localVerify.error ||
                                "Local UltraHonk verification failed",
                        );
                    }

                    // Replace any training-only verifier labels with the live proof identity.
                    result.proofOk = true;
                    result.trainingOnly = usedTrainingNoir;
                    result.proofType = usedTrainingNoir
                        ? "UltraHonk (Noir) [training]"
                        : "UltraHonk (Noir)";
                    result.verifierType = "NOIR_ULTRAHONK";

                    const noirNet = getHackathonNet();
                    const { publishNoirUltraHonkVerifyMainnet } = await import(
                        "../../../../lib/dungeon/publishNoirUltraHonkVerifyMainnet"
                    );
                    const submitRes = await publishNoirUltraHonkVerifyMainnet({
                        owner: noirNet
                            ? testnetAddress!
                            : (userState.contractId as string),
                        keyId: userState.keyId as string,
                        tierId: effectiveTierId,
                        proofOverride,
                        vkId: "NOIR_ROLE_V1",
                        verifierHashHex: noirUltraHonkRoleLegacyVkDigestHex,
                        tierTag: `ROLE${requiredRole}`,
                        net: noirNet,
                        onStage: (stage) => {
                            if (stage === "simulating")
                                noirUltraHonkOnChain = { status: "simulating" };
                            if (stage === "assembling")
                                noirUltraHonkOnChain = { status: "assembling" };
                            if (stage === "signing")
                                noirUltraHonkOnChain = { status: "signing" };
                            if (stage === "submitted")
                                noirUltraHonkOnChain = { status: "submitted" };
                        },
                    });

                    if (!submitRes.ok) {
                        throw new Error(
                            submitRes.error ||
                                "On-chain UltraHonk verification failed",
                        );
                    }
                    if (!submitRes.txHash) {
                        throw new Error(
                            "On-chain UltraHonk verification did not return a tx hash",
                        );
                    }

                    noirUltraHonkOnChain = {
                        status: "submitted",
                        txHash: submitRes.txHash,
                    };

                    addLogEntry({
                        floor: currentFloor,
                        door: doorIndex,
                        attempt: attempts,
                        result: "correct",
                        proofType: usedTrainingNoir
                            ? "On-chain UltraHonk (Noir) [training]"
                            : "On-chain UltraHonk (Noir)",
                        txHash: submitRes.txHash,
                        timestamp: Date.now(),
                        verified: true,
                        provingTimeMs: result.provingTimeMs,
                        commitment: result.commitment,
                        reasonCode: "ONCHAIN_VERIFIED",
                    });

                    const confirmed = await waitForTx(
                        submitRes.txHash,
                        noirNet?.rpcUrl,
                    );
                    if (confirmed === "success") {
                        noirUltraHonkOnChain = {
                            status: "confirmed",
                            txHash: submitRes.txHash,
                        };
                    } else if (confirmed === "failed") {
                        noirUltraHonkOnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "On-chain tx failed",
                        };
                        throw new Error(
                            "On-chain UltraHonk verification transaction failed",
                        );
                    } else {
                        noirUltraHonkOnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "Confirmation timed out",
                        };
                        throw new Error(
                            "On-chain UltraHonk verification confirmation timed out",
                        );
                    }
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    noirUltraHonkOnChain = {
                        status: "error",
                        error: message,
                        txHash: noirUltraHonkOnChain.txHash,
                    };

                    // Never brick run progression for Room 2; record failure as non-blocking.
                    console.warn(
                        "[Dungeon] Noir on-chain verify failed (non-blocking):",
                        message,
                    );
                } finally {
                    // Do not use gateWaiting for Room 2.
                }
            }

            // Room 3 (RISC0 wing): if a passkey wallet is connected, optionally perform *real*
            // on-chain BN254 Groth16 verification of a RISC0 receipt proof before advancing.
            //
            // Production: proof generation requires an external prover service (proxied via /api/dungeon/prover/*).
            // If the prover is unavailable, we fall back to bundled training receipt + bundled Groth16 wrapper proof,
            // and we label it as training-only.
            if (currentFloor === 3 && isConnected && advancedOnChainGuards) {
                if (!userState.contractId || !userState.keyId) {
                    lastForensics = {
                        ...result,
                        accepted: false,
                        reasonCode: "ERROR",
                        reasonHuman:
                            "Cannot submit on-chain receipt verification (wallet missing)",
                        forensics: {
                            ...result.forensics,
                            mismatchExplanation:
                                "On-chain receipt verification requires a connected passkey wallet.",
                            nextAction:
                                "Connect your passkey wallet and retry the door.",
                        },
                    };
                    doorStates = emptyDoorStates();
                    activeDoor = null;
                    return;
                }

                try {
                    risc0Groth16OnChain = { status: "simulating" };

                    // Generate a Groth16 receipt proof bound to this dungeon run via the prover service.
                    const door = floorDef?.doors?.[doorIndex];
                    const requiredTierMin =
                        door?.policy?.kind === "min-tier+parity+lane"
                            ? door.policy.requiredTierMin
                            : 0;
                    const thresholdWhole = Number(
                        TIER_CONFIG[requiredTierMin]?.min ?? 0,
                    );
                    const balanceWhole = Number(
                        (balanceState.balance ?? 0n) / 10_000_000n,
                    );

                    let usedTrainingRisc0 = false;
                    let receiptJson = "";
                    let risc0MethodIdHex = "";
                    let proofOverride:
                        | {
                              claim_digest_hex: string;
                              public_inputs_hex: string[];
                              proof: {
                                  pi_a_b64: string;
                                  pi_b_b64: string;
                                  pi_c_b64: string;
                              };
                          }
                        | undefined;

                    try {
                        const proverResp = await fetch(
                            proverUrl("/risc0-groth16"),
                            {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                    tierIndex: runTierId || effectiveTierId,
                                    threshold: thresholdWhole,
                                    balance: balanceWhole,
                                    saltByte: risc0SaltByte || 22,
                                }),
                            },
                        );

                        const proverJson = await proverResp
                            .json()
                            .catch(() => null);
                        if (!proverResp.ok || !proverJson?.ok) {
                            throw new Error(
                                proverJson?.error || "Prover unavailable",
                            );
                        }

                        receiptJson = String(
                            proverJson.proof?.receipt_json ?? "",
                        );
                        if (!receiptJson)
                            throw new Error(
                                "Prover did not return receipt_json",
                            );

                        const { risc0MethodIdHex: methodId } = await import(
                            "../../../../data/the-farm/risc0Bundle"
                        );
                        risc0MethodIdHex = methodId;

                        proofOverride = {
                            claim_digest_hex: String(
                                proverJson.proof?.claim_digest_hex ?? "",
                            ),
                            public_inputs_hex: Array.isArray(
                                proverJson.proof?.public_inputs_hex,
                            )
                                ? proverJson.proof.public_inputs_hex
                                : [],
                            proof: {
                                pi_a_b64: String(
                                    proverJson.proof?.proof?.pi_a_b64 ?? "",
                                ),
                                pi_b_b64: String(
                                    proverJson.proof?.proof?.pi_b_b64 ?? "",
                                ),
                                pi_c_b64: String(
                                    proverJson.proof?.proof?.pi_c_b64 ?? "",
                                ),
                            },
                        };
                    } catch {
                        // Contest-friendly fallback: verify a bundled training receipt locally.
                        usedTrainingRisc0 = true;
                        const { risc0MethodIdHex: methodId, risc0Samples } =
                            await import(
                                "../../../../data/the-farm/risc0Bundle"
                            );
                        risc0MethodIdHex = methodId;
                        const sample =
                            (risc0Samples as any[]).find(
                                (s) => s?.expectedValid,
                            ) ?? (risc0Samples as any[])[0];
                        receiptJson = String(sample?.proof?.receiptJson ?? "");
                        if (!receiptJson)
                            throw new Error(
                                "No bundled RISC0 training receipt available",
                            );
                        proofOverride = undefined;
                    }

                    // Integrity: locally verify the receipt before submitting on-chain.
                    const { verifyRisc0Receipt } = await import(
                        "../../../../lib/the-farm/verifiers/risc0"
                    );
                    const localVerify = await verifyRisc0Receipt(
                        risc0MethodIdHex,
                        { receiptJson },
                    );
                    if (!localVerify.valid) {
                        throw new Error(
                            localVerify.error ||
                                "Local RISC0 receipt verification failed",
                        );
                    }

                    // Replace any training-only verifier labels with the live proof identity.
                    result.proofOk = true;
                    result.trainingOnly = usedTrainingRisc0;
                    result.proofType = usedTrainingRisc0
                        ? "RISC0 Receipt (zkVM) [training]"
                        : "RISC0 Receipt (zkVM)";
                    result.verifierType = "RISC0_RECEIPT";

                    const risc0Net = getHackathonNet();
                    const { publishRisc0Groth16VerifyMainnet } = await import(
                        "../../../../lib/dungeon/publishRisc0Groth16VerifyMainnet"
                    );
                    const submitRes = await publishRisc0Groth16VerifyMainnet({
                        owner: risc0Net
                            ? testnetAddress!
                            : (userState.contractId as string),
                        keyId: userState.keyId as string,
                        proofOverride,
                        net: risc0Net,
                        onStage: (stage) => {
                            if (stage === "simulating")
                                risc0Groth16OnChain = { status: "simulating" };
                            if (stage === "assembling")
                                risc0Groth16OnChain = { status: "assembling" };
                            if (stage === "signing")
                                risc0Groth16OnChain = { status: "signing" };
                            if (stage === "submitted")
                                risc0Groth16OnChain = { status: "submitted" };
                        },
                    });

                    if (!submitRes.ok) {
                        throw new Error(
                            submitRes.error ||
                                "On-chain receipt verification failed",
                        );
                    }
                    if (!submitRes.txHash) {
                        throw new Error(
                            "On-chain receipt verification did not return a tx hash",
                        );
                    }

                    risc0Groth16OnChain = {
                        status: "submitted",
                        txHash: submitRes.txHash,
                    };

                    addLogEntry({
                        floor: currentFloor,
                        door: doorIndex,
                        attempt: attempts,
                        result: "correct",
                        proofType: usedTrainingRisc0
                            ? "On-chain RISC0 Groth16 Receipt [training]"
                            : "On-chain RISC0 Groth16 Receipt",
                        txHash: submitRes.txHash,
                        timestamp: Date.now(),
                        verified: true,
                        provingTimeMs: result.provingTimeMs,
                        commitment: result.commitment,
                        reasonCode: "ONCHAIN_VERIFIED",
                    });

                    const confirmed = await waitForTx(
                        submitRes.txHash,
                        risc0Net?.rpcUrl,
                    );
                    if (confirmed === "success") {
                        risc0Groth16OnChain = {
                            status: "confirmed",
                            txHash: submitRes.txHash,
                        };
                    } else if (confirmed === "failed") {
                        risc0Groth16OnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "On-chain tx failed",
                        };
                        throw new Error(
                            "On-chain receipt verification transaction failed",
                        );
                    } else {
                        risc0Groth16OnChain = {
                            status: "error",
                            txHash: submitRes.txHash,
                            error: "Confirmation timed out",
                        };
                        throw new Error(
                            "On-chain receipt verification confirmation timed out",
                        );
                    }
                } catch (err) {
                    const message =
                        err instanceof Error ? err.message : String(err);
                    risc0Groth16OnChain = {
                        status: "error",
                        error: message,
                        txHash: risc0Groth16OnChain.txHash,
                    };

                    // Never brick run progression for Room 3; record failure as non-blocking.
                    console.warn(
                        "[Dungeon] RISC0 on-chain verify failed (non-blocking):",
                        message,
                    );
                } finally {
                    // Do not use gateWaiting for Room 3.
                }
            }

            if (currentFloor >= TOTAL_FLOORS) {
                addLogEntry({
                    floor: TOTAL_FLOORS,
                    door: -1,
                    attempt: attempts,
                    result: "correct",
                    proofType: "Local",
                    txHash: null,
                    timestamp: Date.now(),
                });
                phase = "ledger";
            } else {
                // Advance to next floor
                floorTransition = true;
                await new Promise((r) => setTimeout(r, 600));
                const nextFloor = currentFloor + 1;
                currentFloor = nextFloor;
                doorStates = emptyDoorStates();
                activeDoor = null;
                floorTransition = false;
                lastForensics = null;

                // Progress event (multiplayer presence)
                if (relayToken && walletAddress) {
                    try {
                        await relayPost({
                            kind: "progress",
                            account: walletAddress,
                            floor: nextFloor,
                            attempts,
                            ts: Date.now(),
                        });
                    } catch {}
                }

                // Gate floors: only used for co-op sync. Solo should never be blocked by a gate overlay.
                if (GATE_FLOORS.includes(nextFloor - 1) && multiplayerEnabled) {
                    gateWaiting = true;
                } else {
                    gateWaiting = false;
                }
            }
        } else {
            // Wrong door - reset door states after animation
            await new Promise((r) => setTimeout(r, 400));
            doorStates = emptyDoorStates();
            activeDoor = null;
        }
    }

    function addLogEntry(entry: RunLogEntry) {
        runLog = [...runLog, entry];
    }

    function resetGame() {
        phase = "title";
        lobbyCode = "";
        lobbyInput = "";
        lobbyRole = null;
        relayToken = "";
        relayCursor = 0;
        relayRoster = [];
        relayStatus = "disconnected";
        relayError = null;
        readySelf = false;
        stopRelayPolling();
        currentFloor = 1;
        attempts = 0;
        doorStates = emptyDoorStates();
        activeDoor = null;
        runLog = [];
        entryClearanceGranted = false;
        gateWaiting = false;
        floorTransition = false;
        lastForensics = null;
        groth16OnChain = { status: "idle" };
        noirUltraHonkOnChain = { status: "idle" };
        risc0Groth16OnChain = { status: "idle" };
        // Clear per-run identifiers so a fresh run gets new IDs, a new policy seed,
        // and reshuffled doors — not the same assignment as the previous run.
        runId = "";
        runStartedAt = 0;
        runPolicySeed = "";
        runTierId = 0;
        // Reset hackathon hub state (keep hackathonMode + testnetAddress for next run)
        hackathonSessionId = 0;
        hubStartTxHash = null;
        hubEndTxHash = null;
        hubStatus = "idle";
        hubError = null;
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
            fullscreen = true;
        } else {
            document.exitFullscreen().catch(() => {});
            fullscreen = false;
        }
    }

    async function connectWallet() {
        try {
            const { useAuthentication } = await import(
                "../../../../hooks/useAuthentication"
            );
            const auth = useAuthentication();
            await auth.login();
        } catch (err) {
            console.error("[ZkDungeon] Wallet connect failed:", err);
        }
    }

    async function proceedFromAirlock() {
        // Gameplay begins after Room 0. (Room 0 can be recorded on-chain, but demo mode can proceed without it.)
        await startGameLocal();
    }

    async function stampEntryAndEnter() {
        try {
            await stampOnChain("ENTRY");
        } catch (err) {
            // stampOnChain already updates entryStamp status; keep this silent to avoid double-reporting.
            console.warn("[Dungeon] Entry stamp failed:", err);
        }
    }

    let zkWarmupStarted = false;
    function warmupDungeonVerifiers(): void {
        if (zkWarmupStarted) return;
        zkWarmupStarted = true;

        // Preload Noir (bb.js backend) + RISC0 WASM verifier in the background.
        // This keeps Room 2/3 transitions snappy and avoids "first-verify" stalls.
        void (async () => {
            try {
                const [
                    { preloadNoirVerifier },
                    { preloadRisc0Verifier },
                    noirBundle,
                ] = await Promise.all([
                    import("../../../../lib/the-farm/verifiers/noir"),
                    import("../../../../lib/the-farm/verifiers/risc0"),
                    import("../../../../data/the-farm/noirBundle"),
                ]);
                preloadNoirVerifier(noirBundle.noirVerifierBytecode);
                preloadRisc0Verifier();
            } catch {
                // Non-fatal; verifier calls will surface any real issues.
            }
        })();
    }

    async function stampOnChain(kind: DungeonStampKind) {
        const hackathonNet = getHackathonNet();
        if (!hackathonNet && (!userState.contractId || !userState.keyId)) {
            throw new Error("Connect your passkey wallet first.");
        }

        const plan = ["GROTH16", "NOIR_ULTRAHONK", "RISC0_RECEIPT"];
        const statementHash = await sha256HexOfJson({
            dungeon: "kale-seed-vault",
            kind,
            runId,
            startedAt: runStartedAt,
            plan,
            floorsCompleted: currentFloor - 1,
            attempts,
        });
        const verifierHash = await sha256Hex(`zkdungeon:stamp:v1:${kind}`);

        const target = kind === "ENTRY" ? entryStamp : withdrawalStamp;
        if (
            target.status === "simulating" ||
            target.status === "assembling" ||
            target.status === "signing"
        )
            return;
        if (kind === "ENTRY" && entryClearanceGranted) return;

        if (kind === "ENTRY") entryStamp = { status: "simulating" };
        else withdrawalStamp = { status: "simulating" };

        const res = await publishDungeonStampMainnet({
            owner: (hackathonNet
                ? testnetAddress
                : userState.contractId) as string,
            keyId: (userState.keyId ?? "") as string,
            kind,
            statementHash,
            verifierHash,
            net: hackathonNet,
            onStage: (stage) => {
                const update = (tx: typeof entryStamp) => {
                    if (kind === "ENTRY") entryStamp = tx;
                    else withdrawalStamp = tx;
                };
                if (stage === "simulating") update({ status: "simulating" });
                if (stage === "assembling") update({ status: "assembling" });
                if (stage === "signing") update({ status: "signing" });
                if (stage === "submitted") update({ status: "submitted" });
                if (stage === "confirmed") update({ status: "confirmed" });
            },
        });

        if (!res.ok) {
            if (kind === "ENTRY")
                entryStamp = {
                    status: "error",
                    error: res.error,
                    txHash: res.txHash,
                };
            else
                withdrawalStamp = {
                    status: "error",
                    error: res.error,
                    txHash: res.txHash,
                };
            return;
        }

        if (kind === "ENTRY") {
            entryStamp = { status: "confirmed", txHash: res.txHash };
            entryClearanceGranted = true;
        } else withdrawalStamp = { status: "confirmed", txHash: res.txHash };
    }

    async function finishRun() {
        // If hackathon mode is active, call end_game() on the testnet hub
        if (hackathonMode && testnetAddress && hackathonSessionId) {
            try {
                hubStatus = "ending";
                hubError = null;
                const txHash = await hubEndGame({
                    sessionId: hackathonSessionId,
                    player1Won: true,
                });
                hubEndTxHash = txHash;
                hubStatus = "ended";
                console.log("[HackathonMode] end_game() tx:", txHash);
            } catch (err) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : typeof err === "object" && err && "message" in err
                          ? String((err as any).message)
                          : typeof err === "object"
                            ? JSON.stringify(err)
                            : String(err);
                console.error("[HackathonMode] end_game() failed:", msg);
                hubError = msg;
                hubStatus = "error";
                // Don't block the victory screen
            }
        }
        phase = "victory";
    }

    async function playSolo() {
        warmupDungeonVerifiers();

        stopRelayPolling();
        lobbyCode = "SOLO";
        lobbyRole = null;
        playerName = walletLabel || "Solo Seeker";
        opponentName = "";
        relayToken = "";
        relayRoster = [];
        relayStatus = "disconnected";
        relayError = null;

        // Initialize a new run and enter the Airlock (Room 0) before gameplay.
        runId = crypto.randomUUID();
        runStartedAt = Date.now();
        runPolicySeed = runId;
        runTierId = effectiveTierId;
        // Generate stable per-run salts for the WSL-based prover endpoints.
        {
            const bytes = crypto.getRandomValues(new Uint8Array(4));
            noirRoleSalt = String(
                new DataView(bytes.buffer).getUint32(0, false),
            );
            risc0SaltByte = Number(bytes[0] || 22);
        }

        await refreshLocalProverHealth();
        entryStamp = { status: "idle" };
        entryClearanceGranted = false;
        withdrawalStamp = { status: "idle" };
        groth16OnChain = { status: "idle" };
        noirUltraHonkOnChain = { status: "idle" };
        risc0Groth16OnChain = { status: "idle" };
        phase = "airlock";
    }

    // Door symbols
    const DOOR_SYMBOLS = [
        "\u16B1",
        "\u16C7",
        "\u16A6",
        "\u16D2",
        "\u16DF",
        "\u16DE",
        "\u16C9",
        "\u16BB",
    ]; // 8 rune-like markers
    const DOOR_COLORS = [
        "#4ad0ff",
        "#9b7bff",
        "#ffc47a",
        "#7bffb0",
        "#ff7bbd",
        "#9ae600",
        "#60a5fa",
        "#f97316",
    ];
    const LANE_BADGE_STYLES: Record<VaultLaneName, string> = {
        INDIGO: "color:#9eddff;border-color:rgba(74,208,255,0.5);background:rgba(74,208,255,0.14)",
        AMBER: "color:#ffe4ba;border-color:rgba(255,196,122,0.5);background:rgba(255,196,122,0.15)",
        MINT: "color:#c9ffe1;border-color:rgba(123,255,176,0.5);background:rgba(123,255,176,0.14)",
        ROSE: "color:#ffd3e6;border-color:rgba(255,123,189,0.5);background:rgba(255,123,189,0.14)",
    };
    function laneTagStyle(tagShort: string): string | undefined {
        const laneName = tagShort
            .replace(/^LANE:\s*/i, "")
            .trim()
            .toUpperCase() as VaultLaneName;
        return LANE_BADGE_STYLES[laneName];
    }
</script>

<!-- ── Title Screen ──────────────────────────────────────────────── -->
{#if phase === "title"}
    <div class="dg-root dg-title-screen">
        <div class="dg-stars"></div>
        <div class="dg-title-content">
            <p class="dg-eyebrow">THE FARM LABS</p>
            <h1 class="dg-game-title">KALE-SEED VAULT</h1>
            <p class="dg-subtitle">
                Three rooms. Three proof systems. Eight doors per room — one
                correct door, determined by your clearance tier and routing
                lane. Every attempt generates a real ZK proof. The vault
                decides, not a random roll.
            </p>

            <div class="dg-title-actions">
                <button class="dg-btn dg-btn-primary" onclick={playSolo}>
                    PLAY SOLO
                </button>

                {#if isConnected}
                    <div
                        style="display:flex;align-items:center;gap:0.5rem;justify-content:center;margin-bottom:1rem"
                    >
                        <p class="dg-wallet-badge" style="margin-bottom:0">
                            {walletLabel}
                        </p>
                        {#if hackathonMode}
                            <button
                                class="dg-btn dg-btn-sm dg-btn-ghost"
                                style="font-size:0.7rem;padding:0.2rem 0.6rem;height:auto;min-height:0"
                                onclick={() => fundWithFriendbot()}
                            >
                                FRIEND-BOT
                            </button>
                        {/if}
                    </div>
                    <button
                        class="dg-btn dg-btn-secondary"
                        onclick={createLobby}>CREATE 2P LOBBY</button
                    >
                    <div class="dg-join-row">
                        <label class="dg-join-label" for="dg-room-code"
                            >ROOM CODE</label
                        >
                        <div class="dg-join-controls">
                            <input
                                id="dg-room-code"
                                class="dg-input"
                                type="text"
                                inputmode="text"
                                autocomplete="one-time-code"
                                placeholder="ENTER 6-CHAR CODE"
                                maxlength="12"
                                bind:value={lobbyInput}
                                onkeydown={(e) =>
                                    e.key === "Enter" && joinLobby()}
                            />
                            <button
                                class="dg-btn dg-btn-secondary dg-btn-sm dg-btn-paste"
                                onclick={pasteRoomCode}>PASTE</button
                            >
                            <button
                                class="dg-btn dg-btn-primary dg-btn-join"
                                onclick={joinLobby}>JOIN LOBBY</button
                            >
                        </div>
                    </div>
                {:else}
                    <button
                        class="dg-btn dg-btn-secondary"
                        onclick={hackathonMode
                            ? () => {
                                  hubStatus = "connecting";
                                  connectTestnetWallet()
                                      .then((addr) => {
                                          testnetAddress = addr;
                                          hubStatus = "idle";
                                      })
                                      .catch((err) => {
                                          hubError = err.message;
                                          hubStatus = "error";
                                      });
                              }
                            : connectWallet}
                    >
                        {hackathonMode
                            ? "CONNECT WALLET (FREIGHTER)"
                            : "CONNECT WALLET (2P)"}
                    </button>
                    <p class="dg-hint">
                        2-player lobby uses a Labs-only relay (no SEP-10 auth
                        yet).
                    </p>
                {/if}
            </div>

            <div class="dg-cred-card" aria-live="polite">
                <p class="dg-cred-line">
                    CLEARANCE: {tierLabel(effectiveTierId)}
                    <span class="dg-cred-tiny">(T{effectiveTierId})</span>
                    {#if attestedTierId !== null}
                        <span class="dg-cred-source">ON-CHAIN</span>
                    {:else}
                        <span class="dg-cred-source dg-cred-source-demo"
                            >LOCAL</span
                        >
                    {/if}
                </p>
                <p class="dg-cred-subline" style="margin-top:6px;opacity:0.65">
                    Your tier and lane are fixed at run start. Every door in
                    every room checks them — find the one door where all tags
                    match, and the ZK proof gets you through.
                </p>
                {#if credentialLoadError}
                    <p class="dg-cred-warn">
                        On-chain clearance unavailable: {credentialLoadError}
                    </p>
                {/if}

                {#if localProverHealth.ok}
                    <p class="dg-cred-line dg-cred-subline">
                        LOCAL PROVER (DEV): CONNECTED
                    </p>
                {/if}

                <div class="dg-cred-controls">
                    <label class="dg-toggle">
                        <input type="checkbox" bind:checked={trainingMode} />
                        <span>TRAINING MODE — highlights correct doors + shows your lane</span>
                    </label>

                    {#if trainingMode && attestedTierId === null}
                        <div class="dg-cred-override">
                            <label class="dg-join-label" for="dg-demo-tier"
                                >DEMO TIER</label
                            >
                            <select
                                id="dg-demo-tier"
                                class="dg-select"
                                bind:value={trainingTierOverride}
                            >
                                <option value={0}>SPROUT (T0)</option>
                                <option value={1}>GROWER (T1)</option>
                                <option value={2}>HARVEST (T2)</option>
                                <option value={3}>WHALE (T3)</option>
                            </select>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- ── Hackathon Mode (Testnet Game Hub) ──────────────────── -->
            <div class="dg-cred-card dg-hackathon-card" aria-live="polite">
                <div class="dg-cred-controls">
                    <label class="dg-toggle">
                        <input
                            type="checkbox"
                            bind:checked={hackathonMode}
                            onchange={() => {
                                if (!hackathonMode) {
                                    disconnectTestnetWallet();
                                    testnetAddress = null;
                                    hubStatus = "idle";
                                    hubError = null;
                                }
                            }}
                        />
                        <span>HACKATHON MODE (TESTNET GAME HUB)</span>
                    </label>
                </div>

                {#if hackathonMode}
                    <p
                        class="dg-cred-line dg-cred-subline"
                        style="margin-top:0.5rem"
                    >
                        Calls <code>start_game()</code> and
                        <code>end_game()</code> on the game hub contract via Freighter
                        (Stellar Testnet).
                    </p>
                    <p
                        class="dg-cred-line dg-cred-subline"
                        style="font-size:0.55rem;opacity:0.6"
                    >
                        HUB: {TESTNET_HUB_CONTRACT.slice(
                            0,
                            8,
                        )}...{TESTNET_HUB_CONTRACT.slice(-4)}
                    </p>

                    {#if testnetAddress}
                        <p class="dg-wallet-badge" style="margin-top:0.5rem">
                            TESTNET: {testnetAddress.slice(
                                0,
                                6,
                            )}...{testnetAddress.slice(-4)}
                        </p>
                        <button
                            class="dg-btn dg-btn-secondary dg-btn-sm"
                            onclick={() => {
                                disconnectTestnetWallet();
                                testnetAddress = null;
                                hubStatus = "idle";
                            }}
                        >
                            DISCONNECT TESTNET WALLET
                        </button>
                    {:else}
                        <button
                            class="dg-btn dg-btn-primary"
                            style="margin-top:0.5rem"
                            disabled={hubStatus === "connecting"}
                            onclick={async () => {
                                try {
                                    hubStatus = "connecting";
                                    hubError = null;
                                    const addr = await connectTestnetWallet();
                                    testnetAddress = addr;
                                    hubStatus = "idle";
                                } catch (err) {
                                    hubError =
                                        err instanceof Error
                                            ? err.message
                                            : typeof err === "object" &&
                                                err &&
                                                "message" in err
                                              ? String((err as any).message)
                                              : typeof err === "object"
                                                ? JSON.stringify(err)
                                                : String(err);
                                    hubStatus = "error";
                                }
                            }}
                        >
                            {hubStatus === "connecting"
                                ? "CONNECTING..."
                                : "CONNECT TESTNET WALLET (FREIGHTER)"}
                        </button>
                    {/if}
                    {#if hubStatus === "connecting"}
                        <p
                            class="dg-hint"
                            style="margin-top:0.3rem;color:var(--dg-accent)"
                        >
                            Check your wallet popup. If it takes >5s, please
                            reload.
                        </p>
                    {/if}

                    {#if hubError}
                        <p class="dg-cred-warn" style="margin-top:0.3rem">
                            {hubError}
                        </p>
                    {/if}
                {/if}
            </div>

            <button
                class="dg-link-btn"
                onclick={() => (showHowItWorks = !showHowItWorks)}
            >
                {showHowItWorks ? "CLOSE" : "HOW IT WORKS"}
            </button>

            {#if showHowItWorks}
                <div class="dg-how-it-works">
                    <div class="dg-hiw-item">
                        <span class="dg-hiw-num">1</span>
                        <div>
                            <strong>Airlock — optional entry stamp</strong>
                            <p>
                                Sign an on-chain digest of your run start with your passkey — no
                                private data, just proof the run happened. Skip it and go straight
                                to the proof rooms in demo mode. Either way, the rooms work.
                            </p>
                        </div>
                    </div>
                    <div class="dg-hiw-item">
                        <span class="dg-hiw-num">2</span>
                        <div>
                            <strong>Read the tags, find your door</strong>
                            <p>
                                Each door shows policy tags: MIN tier, LANE, ROLE, PARITY.
                                Your credential has a tier and a lane — locked in at run start.
                                Find the one door where every tag fits. A valid ZK proof at
                                the wrong door is still a rejection.
                            </p>
                        </div>
                    </div>
                    <div class="dg-hiw-item">
                        <span class="dg-hiw-num">3</span>
                        <div>
                            <strong>Wrong door? The Forensics panel tells you exactly why</strong>
                            <p>
                                Every failed attempt shows your credential, the door's policy,
                                and which constraint didn't match. No guesswork — the verifier
                                makes the call and explains it.
                            </p>
                        </div>
                    </div>
                    <div class="dg-hiw-item">
                        <span class="dg-hiw-num">4</span>
                        <div>
                            <strong>Three rooms, three real proof systems</strong>
                            <p>
                                Room 1: Groth16 (Circom/BN254) — compact proofs, on-chain pairing
                                check via Tier Verifier. Room 2: UltraHonk (Noir) — fast local
                                verify, optional on-chain record. Room 3: RISC0 zkVM receipt —
                                arbitrary computation attested, optional on-chain record.
                            </p>
                        </div>
                    </div>
                    <div class="dg-hiw-item">
                        <span class="dg-hiw-num">5</span>
                        <div>
                            <strong>Ledger chamber — sign the completion record</strong>
                            <p>
                                Stamp the run closed with a digest-only record: rooms cleared,
                                proof systems used, run ID. Optional, but if the run counted
                                for something — sign it. The ledger doesn't accept verbal
                                confirmation.
                            </p>
                        </div>
                    </div>
                </div>
            {/if}
        </div>

        <div class="dg-title-footer">
            <a href="/labs/the-farm" class="dg-footer-link">DASHBOARD</a>
            <span class="dg-footer-sep">|</span>
            <button class="dg-footer-link" onclick={toggleFullscreen}
                >FULLSCREEN</button
            >
        </div>
    </div>

    <!-- ── Lobby ──────────────────────────────────────────────────────── -->
{:else if phase === "airlock"}
    <div class={`dg-root dg-vault-screen dg-airlock ${roomThemeClass}`}>
        <div class="dg-vault-bg" aria-hidden="true"></div>
        <div class="dg-vault-shell">
            <button class="dg-back-btn" onclick={resetGame}>&larr; BACK</button>

            <div class="dg-vault-header">
                <img
                    class="dg-room-art"
                    src={roomHeaderArt}
                    alt=""
                    loading="eager"
                />
                <div class="dg-vault-roomtitle">
                    <p class="dg-eyebrow">THE KALE-SEED VAULT</p>
                    <h2 class="dg-lobby-title">{roomLore.roomTitle}</h2>
                    <p class="dg-subtitle">{roomLore.roomSubtitle}</p>
                </div>
            </div>

            <div class="dg-vault-grid">
                <section
                    class="dg-panel dg-panel-lore"
                    aria-label="Lore Scroll"
                >
                    <div class="dg-panel-head">LORE SCROLL</div>
                    {#each roomLore.briefingMarkdown.split("\n\n") as para (para)}
                        <p class="dg-lore-p">{para}</p>
                    {/each}
                </section>

                <section
                    class="dg-panel dg-panel-placard"
                    aria-label="Protocol Placard"
                >
                    <div class="dg-panel-head">PROTOCOL PLACARD</div>
                    <div class="dg-stamp-box" style="border-color:rgba(154,230,0,0.3);background:rgba(154,230,0,0.04);margin-bottom:14px">
                        <p class="dg-placard" style="margin:0 0 6px">
                            TL;DR: This is the optional entry checkpoint.
                        </p>
                        <p class="dg-placard-sub" style="margin:0">
                            Stamping entry records an on-chain audit marker via passkey (no private data). Skip it and you can still play all three proof-gated rooms in demo mode — the ZK verification is real either way.
                        </p>
                    </div>
                    <p class="dg-placard">{roomLore.protocolPlacard}</p>
                    <div class="dg-placard-sub">
                        {roomLore.verifierExplainer}
                    </div>

                    <div class="dg-stamp-box">
                        <div class="dg-stamp-title">ENTRY STAMP (MAINNET)</div>
                        <div class="dg-stamp-status">
                            STATUS: {entryStamp.status.toUpperCase()}
                        </div>
                        <div class="dg-stamp-status">
                            CLEARANCE: {entryClearanceGranted
                                ? "GRANTED"
                                : "LOCKED"}
                        </div>
                        {#if entryStamp.txHash}
                            <a
                                class="dg-stamp-link"
                                href={txExplorerUrl(entryStamp.txHash)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                VIEW TX {entryStamp.txHash.slice(0, 8)}...
                            </a>
                        {/if}
                        {#if entryStamp.error}
                            <div class="dg-stamp-error">{entryStamp.error}</div>
                        {/if}

                        {#if isConnected || testnetAddress}
                            {#if entryClearanceGranted}
                                <div class="dg-placard-sub">
                                    Entry stamp confirmed. Clearance is active
                                    for this run.
                                </div>
                            {:else}
                                <button
                                    class="dg-btn dg-btn-primary"
                                    disabled={entryStamp.status ===
                                        "simulating" ||
                                        entryStamp.status === "assembling" ||
                                        entryStamp.status === "signing"}
                                    onclick={stampEntryAndEnter}
                                >
                                    STAMP ENTRY TO GRANT CLEARANCE
                                </button>
                            {/if}
                        {:else}
                            <button
                                class="dg-btn dg-btn-secondary"
                                onclick={connectWallet}
                                >CONNECT WALLET TO ENABLE STAMP + ENTER</button
                            >
                        {/if}
                    </div>

                    <div class="dg-vault-actions">
                        {#if isConnected || testnetAddress}
                            {#if entryClearanceGranted}
                                <button
                                    class="dg-btn dg-btn-primary dg-btn-kale"
                                    onclick={proceedFromAirlock}
                                >
                                    ENTER INTAKE (CLEARANCE GRANTED) →
                                </button>
                            {:else}
                                <button
                                    class="dg-btn dg-btn-secondary"
                                    disabled
                                >
                                    ENTER LOCKED - STAMP REQUIRED
                                </button>
                                <button
                                    class="dg-btn dg-btn-secondary"
                                    onclick={proceedFromAirlock}
                                >
                                    ENTER WITHOUT STAMP (DEMO)
                                </button>
                            {/if}
                        {:else}
                            <button
                                class="dg-btn dg-btn-primary dg-btn-kale"
                                onclick={proceedFromAirlock}
                            >
                                ENTER INTAKE WING →
                            </button>
                            <p class="dg-hint">
                                Demo mode: you can proceed without an on-chain
                                entry stamp.
                            </p>
                        {/if}
                    </div>
                </section>
            </div>
        </div>
    </div>

    <!-- ── Lobby ──────────────────────────────────────────────────────── -->
{:else if phase === "lobby"}
    <div class={`dg-root dg-lobby-screen ${roomThemeClass}`}>
        <div class="dg-stars"></div>
        <div class="dg-lobby-content">
            <button class="dg-back-btn" onclick={resetGame}>&larr; BACK</button>
            <p class="dg-eyebrow">LOBBY</p>
            <h2 class="dg-lobby-title">
                {lobbyRole === "host"
                    ? "WAITING FOR PLAYER 2"
                    : "JOINING LOBBY"}
            </h2>

            <div class="dg-lobby-code-display">
                <p class="dg-lobby-code-label">LOBBY CODE</p>
                <p class="dg-lobby-code">{lobbyCode}</p>
                <button
                    class="dg-btn dg-btn-ghost dg-btn-sm"
                    onclick={() => {
                        navigator.clipboard.writeText(lobbyCode);
                    }}>COPY CODE</button
                >
                <button
                    class="dg-btn dg-btn-ghost dg-btn-sm"
                    onclick={copyLobbyInviteLink}>COPY LINK</button
                >
            </div>

            <div class="dg-relay-status" aria-live="polite">
                <span class="dg-relay-pill dg-relay-{relayStatus}">
                    RELAY: {relayStatus.toUpperCase()}
                </span>
                {#if relayError}
                    <span class="dg-relay-detail">{relayError}</span>
                {/if}
            </div>

            <div class="dg-lobby-players">
                <div
                    class="dg-lobby-player {readySelf
                        ? 'dg-lobby-player-ready'
                        : 'dg-lobby-player-waiting'}"
                >
                    <span class="dg-lobby-player-icon"
                        >{lobbyRole === "host" ? "P1" : "P2"}</span
                    >
                    <span class="dg-lobby-player-name">{playerName}</span>
                    <span class="dg-lobby-player-status"
                        >{readySelf ? "READY" : "NOT READY"}</span
                    >
                </div>
                <div
                    class="dg-lobby-player {opponentName
                        ? opponentReady
                            ? 'dg-lobby-player-ready'
                            : 'dg-lobby-player-waiting'
                        : 'dg-lobby-player-waiting'}"
                >
                    <span class="dg-lobby-player-icon"
                        >{lobbyRole === "host" ? "P2" : "P1"}</span
                    >
                    <span class="dg-lobby-player-name"
                        >{opponentName || "..."}</span
                    >
                    <span class="dg-lobby-player-status"
                        >{opponentName
                            ? opponentReady
                                ? "READY"
                                : "NOT READY"
                            : "WAITING"}</span
                    >
                </div>
            </div>

            {#if lobbyRole === "host"}
                <p class="dg-hint">
                    Share the code with another player, or start solo.
                </p>
                <button
                    class="dg-btn dg-btn-primary"
                    disabled={hasOpponent && !allReady}
                    onclick={hostStartGame}
                >
                    {hasOpponent
                        ? allReady
                            ? "START GAME"
                            : "WAITING FOR READY"
                        : "START SOLO"}
                </button>
            {:else}
                <button
                    class="dg-btn dg-btn-primary"
                    onclick={async () => {
                        try {
                            await setReady(true);
                        } catch (err) {
                            relayStatus = "error";
                            relayError =
                                err instanceof Error
                                    ? err.message
                                    : String(err);
                        }
                    }}
                    disabled={readySelf || relayStatus !== "connected"}
                >
                    {readySelf ? "READY" : "READY UP"}
                </button>
                <p class="dg-hint">
                    Host will start the run when both players are ready.
                </p>
            {/if}
        </div>
    </div>

    <!-- ── Playing ────────────────────────────────────────────────────── -->
{:else if phase === "playing"}
    <div
        class={`dg-root dg-vault-screen dg-game ${roomThemeClass}`}
        class:dg-floor-transition={floorTransition}
    >
        <div class="dg-vault-bg" aria-hidden="true"></div>
        <div class="dg-vault-shell">
            <!-- HUD -->
            <div class="dg-hud">
                <div class="dg-hud-left">
                    <span class="dg-hud-floor"
                        >ROOM {currentFloor}/{TOTAL_FLOORS}</span
                    >
                    <span class="dg-hud-proof-type">
                        {#if floorDef.verifierType === "GROTH16"}
                            VERIFIER: GROTH16 (BN254)
                        {:else if floorDef.verifierType === "NOIR_ULTRAHONK"}
                            VERIFIER: ULTRAHONK (NOIR)
                        {:else}
                            VERIFIER: RISC0 RECEIPT (ZKVM)
                        {/if}
                        {#if floorDef.verifierType !== "GROTH16"}
                            <span class="dg-proof-note"
                                >TRAINING CREDENTIAL</span
                            >
                        {/if}
                    </span>
                </div>
                <div class="dg-hud-center">
                    <div class="dg-progress-bar">
                        <div
                            class="dg-progress-fill"
                            style="width: {progressPct}%"
                        ></div>
                    </div>
                </div>
                <div class="dg-hud-right">
                    <span class="dg-hud-attempts">ATTEMPTS: {attempts}</span>
                    {#if multiplayerEnabled && opponentProgress}
                        <span class="dg-hud-opponent">
                            P2 R{opponentProgress.floor} A{opponentProgress.attempts}
                        </span>
                    {/if}
                    <button class="dg-hud-btn" onclick={toggleFullscreen}>
                        {fullscreen ? "EXIT FS" : "FS"}
                    </button>
                    {#if hackathonMode}
                        <span
                            class="dg-hud-hub"
                            style="font-size:0.5rem;padding:0.15rem 0.4rem;border:1px solid {hubStatus ===
                            'started'
                                ? 'rgba(154,230,0,0.5)'
                                : hubStatus === 'error'
                                  ? 'rgba(255,100,100,0.5)'
                                  : 'rgba(255,255,255,0.2)'};border-radius:4px;color:{hubStatus ===
                            'started'
                                ? '#9ae600'
                                : hubStatus === 'error'
                                  ? '#ff6464'
                                  : 'rgba(255,255,255,0.5)'}"
                        >
                            HUB: {hubStatus === "started"
                                ? "ACTIVE"
                                : hubStatus === "starting"
                                  ? "CALLING..."
                                  : hubStatus === "error"
                                    ? "ERR"
                                    : "IDLE"}
                        </span>
                    {/if}
                </div>
            </div>

            <div class="dg-room-grid">
                <!-- Left: Lore + placard + forensics -->
                <section
                    class="dg-panel dg-panel-lore"
                    aria-label="Lore Scroll"
                >
                    <div class="dg-panel-head">LORE SCROLL</div>
                    <div class="dg-room-title">{roomLore.roomTitle}</div>
                    <div class="dg-room-sub">{roomLore.roomSubtitle}</div>
                    {#each roomLore.briefingMarkdown.split("\n\n") as para (para)}
                        <p class="dg-lore-p">{para}</p>
                    {/each}

                    <div class="dg-panel-split"></div>
                    <div class="dg-panel-head">PROTOCOL PLACARD</div>
                    <p class="dg-placard">{roomLore.protocolPlacard}</p>
                    <div class="dg-placard-sub">
                        {roomLore.verifierExplainer}
                    </div>

                    {#if floorDef.verifierType === "GROTH16"}
                        <div class="dg-stamp-box">
                            <div class="dg-stamp-title">
                                ON-CHAIN PROOF VERIFY ({testnetAddress
                                    ? "TESTNET"
                                    : "MAINNET"})
                            </div>
                            {#if isConnected || testnetAddress}
                                <div class="dg-stamp-status">
                                    STATUS: {groth16OnChain.status.toUpperCase()}
                                </div>
                                {#if groth16OnChain.txHash}
                                    <a
                                        class="dg-stamp-link"
                                        href={txExplorerUrl(
                                            groth16OnChain.txHash,
                                        )}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        VIEW TX {groth16OnChain.txHash.slice(
                                            0,
                                            8,
                                        )}...
                                    </a>
                                {/if}
                                {#if groth16OnChain.error}
                                    <div class="dg-stamp-error">
                                        {groth16OnChain.error}
                                    </div>
                                {/if}
                                {#if currentFloor === 1 && groth16OnChain.status === "idle"}
                                    <div class="dg-placard-sub">
                                        Tip: clearing the correct door will
                                        trigger a real Tier Verifier
                                        `verify_and_attest` tx ({testnetAddress
                                            ? "Freighter"
                                            : "passkey"}-signed).
                                    </div>
                                {/if}
                            {:else}
                                <div class="dg-stamp-status">
                                    STATUS: DISABLED (WALLET NOT CONNECTED)
                                </div>
                            {/if}
                        </div>
                    {/if}

                    {#if floorDef.verifierType === "NOIR_ULTRAHONK"}
                        <div class="dg-stamp-box">
                            <div class="dg-stamp-title">
                                ON-CHAIN ULTRAHONK ({testnetAddress
                                    ? "TESTNET"
                                    : "MAINNET"})
                            </div>
                            {#if !isConnected && !testnetAddress}
                                <div class="dg-stamp-status">
                                    STATUS: DISABLED (WALLET NOT CONNECTED)
                                </div>
                            {:else if !advancedOnChainGuards}
                                <div class="dg-stamp-status">
                                    STATUS: DISABLED (ADVANCED MODE OFF)
                                </div>
                                <div class="dg-placard-sub">
                                    This wing verifies UltraHonk locally
                                    in-browser. On-chain UltraHonk requires an
                                    external prover service (to generate a proof
                                    bound to your run).
                                </div>
                            {:else}
                                <div class="dg-stamp-status">
                                    STATUS: {noirUltraHonkOnChain.status.toUpperCase()}{noirUltraHonkOnChain.status ===
                                    "error"
                                        ? " (NON-BLOCKING)"
                                        : ""}
                                </div>
                                {#if noirUltraHonkOnChain.txHash}
                                    <a
                                        class="dg-stamp-link"
                                        href={txExplorerUrl(
                                            noirUltraHonkOnChain.txHash,
                                        )}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        VIEW TX {noirUltraHonkOnChain.txHash.slice(
                                            0,
                                            8,
                                        )}...
                                    </a>
                                {/if}
                                {#if noirUltraHonkOnChain.error}
                                    <div class="dg-stamp-error">
                                        {noirUltraHonkOnChain.error}
                                    </div>
                                {/if}
                                {#if currentFloor === 2 && noirUltraHonkOnChain.status === "idle"}
                                    <div class="dg-placard-sub">
                                        Tip: clearing the correct door will
                                        attempt an on-chain UltraHonk
                                        verification tx (passkey-signed) via the
                                        verifier bridge.
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/if}

                    {#if floorDef.verifierType === "RISC0_RECEIPT"}
                        <div class="dg-stamp-box">
                            <div class="dg-stamp-title">
                                ON-CHAIN RECEIPT ({testnetAddress
                                    ? "TESTNET"
                                    : "MAINNET"})
                            </div>
                            {#if !isConnected && !testnetAddress}
                                <div class="dg-stamp-status">
                                    STATUS: DISABLED (WALLET NOT CONNECTED)
                                </div>
                            {:else if !advancedOnChainGuards}
                                <div class="dg-stamp-status">
                                    STATUS: DISABLED (ADVANCED MODE OFF)
                                </div>
                                <div class="dg-placard-sub">
                                    This wing verifies a RISC0 receipt locally
                                    in-browser. On-chain receipt verification
                                    requires an external prover service plus a
                                    deployed verifier contract.
                                </div>
                            {:else}
                                <div class="dg-stamp-status">
                                    STATUS: {risc0Groth16OnChain.status.toUpperCase()}{risc0Groth16OnChain.status ===
                                    "error"
                                        ? " (NON-BLOCKING)"
                                        : ""}
                                </div>
                                {#if risc0Groth16OnChain.txHash}
                                    <a
                                        class="dg-stamp-link"
                                        href={txExplorerUrl(
                                            risc0Groth16OnChain.txHash,
                                        )}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        VIEW TX {risc0Groth16OnChain.txHash.slice(
                                            0,
                                            8,
                                        )}...
                                    </a>
                                {/if}
                                {#if risc0Groth16OnChain.error}
                                    <div class="dg-stamp-error">
                                        {risc0Groth16OnChain.error}
                                    </div>
                                {/if}
                                {#if currentFloor === 3 && risc0Groth16OnChain.status === "idle"}
                                    <div class="dg-placard-sub">
                                        Tip: clearing the correct door will
                                        attempt an on-chain receipt verification
                                        tx (passkey-signed) if the verifier
                                        contract is deployed + configured.
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    {/if}

                    {#if lastForensics}
                        <div class="dg-panel-split"></div>
                        <div class="dg-panel-head">FORENSICS</div>
                        <div
                            class="dg-forensics dg-forensics-{lastForensics.accepted
                                ? 'ok'
                                : 'no'}"
                            aria-live="polite"
                        >
                            <p class="dg-forensics-outcome">
                                {lastForensics.accepted
                                    ? "ACCESS GRANTED"
                                    : "ACCESS DENIED"}
                            </p>
                            <p class="dg-forensics-why">
                                {lastForensics.reasonHuman}
                            </p>
                            <div class="dg-forensics-grid">
                                <div class="dg-forensics-item">
                                    <span class="k">Door Policy</span>
                                    <span class="v"
                                        >{lastForensics.forensics
                                            .policyRule}</span
                                    >
                                </div>
                                <div class="dg-forensics-item">
                                    <span class="k">Verifier</span>
                                    <span class="v">
                                        {lastForensics.proofOk
                                            ? "PROOF VALID"
                                            : "PROOF INVALID"}
                                        {#if lastForensics.trainingOnly}
                                            <span class="dg-proof-note"
                                                >TRAINING</span
                                            >
                                        {/if}
                                    </span>
                                </div>
                                <div class="dg-forensics-item">
                                    <span class="k">Your Credential</span>
                                    <span class="v"
                                        >{lastForensics.forensics
                                            .yourCredentialSummary}</span
                                    >
                                </div>
                                <div class="dg-forensics-item">
                                    <span class="k">Mismatch</span>
                                    <span class="v"
                                        >{lastForensics.forensics
                                            .mismatchExplanation}</span
                                    >
                                </div>
                                <div class="dg-forensics-item">
                                    <span class="k">Next Action</span>
                                    <span class="v"
                                        >{lastForensics.forensics
                                            .nextAction}</span
                                    >
                                </div>
                            </div>

                            {#if trainingMode && lastForensics.debug}
                                <div class="dg-forensics-debug">
                                    <p class="dg-debug-title">
                                        TRAINING: COMPARISON TRACE
                                    </p>
                                    <ul class="dg-debug-list">
                                        {#each lastForensics.debug.comparisons as line}
                                            <li>{line}</li>
                                        {/each}
                                    </ul>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </section>

                <!-- Center: Doors -->
                <section class="dg-panel dg-panel-doors" aria-label="Doors">
                    <div class="dg-floor-header">
                        <h2 class="dg-floor-name">
                            POLICY: {floorDef.policyName}
                        </h2>
                        <p class="dg-floor-desc">{floorDef.briefing}</p>
                        <p class="dg-floor-desc" style="margin-top:6px;font-style:italic;opacity:0.75">
                            Find the ONE door where every tag matches your credential (shown below). Wrong choices show exactly why in the Forensics panel.
                        </p>
                        <div class="dg-floor-controls">
                            <label class="dg-toggle">
                                <input
                                    type="checkbox"
                                    bind:checked={trainingMode}
                                />
                                <span>TRAINING MODE</span>
                            </label>
                            <label
                                class="dg-toggle dg-present"
                                title="Submit a different proof format to see how the guardian rejects a format mismatch. Normally auto-set to match this room's verifier."
                            >
                                <span>PROOF FORMAT{presentedTouched ? " ⚠" : ""}</span>
                                <select
                                    class="dg-select"
                                    bind:value={presentedVerifierType}
                                    onchange={() => (presentedTouched = true)}
                                    disabled={activeDoor !== null}
                                >
                                    <option value="GROTH16"
                                        >Groth16 (BN254)</option
                                    >
                                    <option value="NOIR_ULTRAHONK"
                                        >Noir (UltraHonk)</option
                                    >
                                    <option value="RISC0_RECEIPT"
                                        >RISC0 Receipt</option
                                    >
                                </select>
                            </label>
                            <span class="dg-hint-pill">
                                CREDENTIAL: T{shownTierId} ({tierLabel(
                                    shownTierId,
                                )}) • PARITY {shownTierParity} • LANE <span style="color: {activeLane.color}">{activeLane.name}</span>
                            </span>
                            {#if attestedTierId !== null}
                                <span class="dg-cred-source">ON-CHAIN</span>
                            {:else}
                                <span class="dg-cred-source dg-cred-source-demo"
                                    >LOCAL</span
                                >
                            {/if}
                            {#if isConnected || testnetAddress}
                                <label class="dg-toggle dg-advanced">
                                    <input
                                        type="checkbox"
                                        bind:checked={advancedOnChainGuards}
                                    />
                                    <span>ADVANCED ON-CHAIN</span>
                                </label>
                            {/if}
                        </div>
                    </div>

                    {#if gateWaiting}
                        <div class="dg-gate-overlay">
                            <div class="dg-gate-panel">
                                {#if currentFloor === 1 && (isConnected || testnetAddress) && groth16OnChain.status !== "idle" && groth16OnChain.status !== "confirmed"}
                                    <p class="dg-gate-title">
                                        {testnetAddress ? "TESTNET" : "MAINNET"}
                                        PROOF VERIFY
                                    </p>
                                    <p class="dg-gate-desc">
                                        Verifying your Groth16 credential
                                        on-chain (Tier Verifier). This is real
                                        proof verification.
                                    </p>
                                    <p class="dg-gate-desc">
                                        STATUS: {groth16OnChain.status.toUpperCase()}
                                    </p>
                                    {#if groth16OnChain.txHash}
                                        <a
                                            class="dg-stamp-link"
                                            href={txExplorerUrl(
                                                groth16OnChain.txHash,
                                            )}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            VIEW TX {groth16OnChain.txHash.slice(
                                                0,
                                                8,
                                            )}...
                                        </a>
                                    {/if}
                                    {#if groth16OnChain.error}
                                        <p class="dg-stamp-error">
                                            {groth16OnChain.error}
                                        </p>
                                    {/if}
                                {:else if currentFloor === 3 && isConnected && risc0Groth16OnChain.status !== "idle" && risc0Groth16OnChain.status !== "confirmed"}
                                    <p class="dg-gate-title">
                                        MAINNET RECEIPT VERIFY
                                    </p>
                                    <p class="dg-gate-desc">
                                        Verifying a RISC0 Groth16 receipt
                                        on-chain (BN254 pairing checks). This is
                                        real proof verification.
                                    </p>
                                    <p class="dg-gate-desc">
                                        STATUS: {risc0Groth16OnChain.status.toUpperCase()}
                                    </p>
                                    {#if risc0Groth16OnChain.txHash}
                                        <a
                                            class="dg-stamp-link"
                                            href={txExplorerUrl(
                                                risc0Groth16OnChain.txHash,
                                            )}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            VIEW TX {risc0Groth16OnChain.txHash.slice(
                                                0,
                                                8,
                                            )}...
                                        </a>
                                    {/if}
                                    {#if risc0Groth16OnChain.error}
                                        <p class="dg-stamp-error">
                                            {risc0Groth16OnChain.error}
                                        </p>
                                    {/if}
                                {:else}
                                    <p class="dg-gate-title">CO-OP GATE</p>
                                    <p class="dg-gate-desc">
                                        Waiting for both auditors to reach this
                                        room...
                                    </p>
                                {/if}
                                <div class="dg-gate-spinner"></div>
                            </div>
                        </div>
                    {:else}
                        <div class="dg-doors">
                            {#each doorStates as state, i}
                                {@const def = doorDef(i as any)}
                                <button
                                    class="dg-door dg-door-{state}"
                                    class:dg-door-suggested={trainingMode &&
                                        doorWouldAccept(def)}
                                    disabled={state !== "idle" ||
                                        activeDoor !== null}
                                    onclick={() => chooseDoor(i)}
                                >
                                    <span class="dg-door-rune"
                                        >{DOOR_SYMBOLS[i]}</span
                                    >
                                    <span class="dg-door-label"
                                        >DOOR {i + 1}</span
                                    >
                                    <div
                                        class="dg-door-tags"
                                        aria-label="Door policy tags"
                                    >
                                        {#each def.tags as tag}
                                            {@const laneStyle = laneTagStyle(
                                                tag.short,
                                            )}
                                            <span
                                                class="dg-door-tag"
                                                class:dg-door-tag-lane={!!laneStyle}
                                                style={laneStyle}
                                            >
                                                {tag.short}
                                            </span>
                                        {/each}
                                    </div>
                                    {#if state === "proving"}
                                        <span class="dg-door-status"
                                            >VERIFYING...</span
                                        >
                                    {:else if state === "correct"}
                                        <span
                                            class="dg-door-status dg-status-correct"
                                            >OPENED</span
                                        >
                                    {:else if state === "wrong"}
                                        <span
                                            class="dg-door-status dg-status-wrong"
                                            >SEALED</span
                                        >
                                    {/if}
                                    <div
                                        class="dg-door-glow"
                                        style="--door-color: {DOOR_COLORS[i]}"
                                    ></div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </section>

                <!-- Right: Notebook / log -->
                <section
                    class="dg-panel dg-panel-notebook"
                    aria-label="Runner's Notebook"
                >
                    <div class="dg-panel-head">RUNNER'S NOTEBOOK</div>
                    <div class="dg-notebook-art">
                        <img
                            class="dg-notebook-guardian"
                            src={guardianArt}
                            alt=""
                            loading="lazy"
                        />
                        <img
                            class="dg-notebook-badge"
                            src={verifierBadgeArt}
                            alt=""
                            loading="lazy"
                        />
                    </div>
                    <div class="dg-note-line">
                        RUN ID: <span class="dg-mono"
                            >{runId ? runId.slice(0, 8) + "..." : "—"}</span
                        >
                    </div>
                    <div class="dg-note-line">
                        CREDENTIAL: <span class="dg-mono"
                            >{tierLabel(runTierId || effectiveTierId)} (T{runTierId ||
                                effectiveTierId})</span
                        >
                    </div>
                    <div class="dg-note-line">
                        LANE:
                        <span
                            class="dg-mono dg-lane-chip"
                            style={laneTagStyle(`LANE: ${activeLane.name}`)}
                        >
                            {activeLane.name}
                        </span>
                    </div>
                    <div class="dg-note-line">
                        ENTRY STAMP: <span class="dg-mono"
                            >{entryStamp.status}</span
                        >
                        {#if entryStamp.txHash}
                            <a
                                class="dg-mini-link"
                                href={txExplorerUrl(entryStamp.txHash)}
                                target="_blank"
                                rel="noreferrer">tx</a
                            >
                        {/if}
                    </div>
                    <div class="dg-note-line">
                        WITHDRAWAL: <span class="dg-mono"
                            >{withdrawalStamp.status}</span
                        >
                        {#if withdrawalStamp.txHash}
                            <a
                                class="dg-mini-link"
                                href={txExplorerUrl(withdrawalStamp.txHash)}
                                target="_blank"
                                rel="noreferrer">tx</a
                            >
                        {/if}
                    </div>

                    <div class="dg-panel-split"></div>
                    <div class="dg-run-log">
                        <div class="dg-run-log-header">
                            <span>RUN LOG</span>
                            <span class="dg-run-log-count">{runLog.length}</span
                            >
                        </div>
                        <div class="dg-run-log-entries">
                            {#each runLog.toReversed() as entry}
                                <div class="dg-log-entry dg-log-{entry.result}">
                                    {#if entry.floor === 0}
                                        <span class="dg-log-text"
                                            >Run initialized</span
                                        >
                                    {:else if entry.door === -1}
                                        <span class="dg-log-text"
                                            >Puzzle rooms cleared</span
                                        >
                                    {:else}
                                        <span class="dg-log-floor"
                                            >R{entry.floor}</span
                                        >
                                        <span class="dg-log-door"
                                            >D{entry.door + 1}</span
                                        >
                                        <span class="dg-log-result"
                                            >{entry.result === "correct"
                                                ? "OK"
                                                : "MISS"}</span
                                        >
                                        <span class="dg-log-proof"
                                            >{entry.proofType}</span
                                        >
                                        {#if entry.verified}
                                            <span class="dg-log-verified"
                                                >ZK</span
                                            >
                                        {/if}
                                        {#if entry.provingTimeMs}
                                            <span class="dg-log-time"
                                                >{entry.provingTimeMs}ms</span
                                            >
                                        {/if}
                                    {/if}
                                    {#if entry.txHash}
                                        <a
                                            class="dg-log-tx"
                                            href={txExplorerUrl(entry.txHash)}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {entry.txHash.slice(0, 8)}...
                                        </a>
                                    {:else}
                                        <span
                                            class="dg-log-tx dg-log-tx-pending"
                                            >--</span
                                        >
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>

                    <div class="dg-panel-split"></div>
                    <p class="dg-hint">
                        Rooms 2–3 use verified training credentials (real
                        verifiers) unless live proving is added later.
                    </p>
                    <img
                        class="dg-notebook-blueprint"
                        src="/labs/zkdungeon/art/vault-blueprint-map.webp"
                        alt=""
                        loading="lazy"
                    />
                </section>
            </div>
        </div>
    </div>

    <!-- ── Ledger Chamber ──────────────────────────────────────────────── -->
{:else if phase === "ledger"}
    <div class={`dg-root dg-vault-screen dg-ledger ${roomThemeClass}`}>
        <div class="dg-vault-bg" aria-hidden="true"></div>
        <div class="dg-vault-shell">
            <button class="dg-back-btn" onclick={resetGame}>&larr; BACK</button>

            <div class="dg-vault-header">
                <img
                    class="dg-room-art"
                    src={roomHeaderArt}
                    alt=""
                    loading="eager"
                />
                <div class="dg-vault-roomtitle">
                    <p class="dg-eyebrow">THE KALE-SEED VAULT</p>
                    <h2 class="dg-lobby-title">{roomLore.roomTitle}</h2>
                    <p class="dg-subtitle">{roomLore.roomSubtitle}</p>
                </div>
            </div>

            <div class="dg-vault-grid">
                <section
                    class="dg-panel dg-panel-lore"
                    aria-label="Lore Scroll"
                >
                    <div class="dg-panel-head">LORE SCROLL</div>
                    {#each roomLore.briefingMarkdown.split("\n\n") as para (para)}
                        <p class="dg-lore-p">{para}</p>
                    {/each}
                </section>

                <section
                    class="dg-panel dg-panel-placard"
                    aria-label="Protocol Placard"
                >
                    <div class="dg-panel-head">PROTOCOL PLACARD</div>
                    <p class="dg-placard">{roomLore.protocolPlacard}</p>
                    <div class="dg-placard-sub">
                        {roomLore.verifierExplainer}
                    </div>

                    <div class="dg-stamp-box">
                        <div class="dg-stamp-title">
                            WITHDRAWAL RECORD (MAINNET)
                        </div>
                        <div class="dg-stamp-status">
                            STATUS: {withdrawalStamp.status.toUpperCase()}
                        </div>
                        {#if withdrawalStamp.txHash}
                            <a
                                class="dg-stamp-link"
                                href={txExplorerUrl(withdrawalStamp.txHash)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                VIEW TX {withdrawalStamp.txHash.slice(0, 8)}...
                            </a>
                        {/if}
                        {#if withdrawalStamp.error}
                            <div class="dg-stamp-error">
                                {withdrawalStamp.error}
                            </div>
                        {/if}

                        {#if isConnected || testnetAddress}
                            <button
                                class="dg-btn dg-btn-primary"
                                disabled={withdrawalStamp.status ===
                                    "simulating" ||
                                    withdrawalStamp.status === "assembling" ||
                                    withdrawalStamp.status === "signing"}
                                onclick={() => stampOnChain("WITHDRAWAL")}
                            >
                                RECORD SEED WITHDRAWAL ON-CHAIN ({testnetAddress
                                    ? "FREIGHTER"
                                    : "PASSKEY"})
                            </button>
                        {:else}
                            <button
                                class="dg-btn dg-btn-secondary"
                                onclick={connectWallet}
                                >CONNECT WALLET (PASSKEY)</button
                            >
                        {/if}
                    </div>

                    {#if hackathonMode}
                        <div
                            class="dg-stamp-box"
                            style="border-color:rgba(154,230,0,0.3);background:rgba(154,230,0,0.04)"
                        >
                            <div class="dg-stamp-title" style="color:#9ae600">
                                GAME HUB (TESTNET)
                            </div>
                            <div class="dg-stamp-status">
                                STATUS: {hubStatus === "started"
                                    ? "GAME REGISTERED"
                                    : hubStatus.toUpperCase()}
                                {#if hubStartTxHash}
                                    <a
                                        class="dg-stamp-link"
                                        href={txExplorerUrlTestnet(
                                            hubStartTxHash,
                                        )}
                                        target="_blank"
                                        rel="noreferrer"
                                        style="display:inline;margin-left:0.5rem"
                                    >
                                        start_game() TX
                                    </a>
                                {/if}
                            </div>
                            {#if hubError}
                                <div class="dg-stamp-error">{hubError}</div>
                            {/if}
                            <p class="dg-hint" style="margin-top:0.3rem">
                                Clicking FINISH RUN will call <code
                                    >end_game()</code
                                > on the testnet hub contract.
                            </p>
                        </div>
                    {/if}

                    <div class="dg-vault-actions">
                        <button
                            class="dg-btn dg-btn-primary"
                            onclick={finishRun}
                        >
                            {hackathonMode && testnetAddress
                                ? "FINISH RUN + end_game() →"
                                : "FINISH RUN →"}
                        </button>
                        {#if withdrawalStamp.status !== "confirmed" && !hackathonMode}
                            <p class="dg-hint">
                                No completion stamp yet. Reviewer-proof run
                                includes the withdrawal record.
                            </p>
                        {/if}
                    </div>
                </section>
            </div>

            <section
                class="dg-panel dg-panel-txscience"
                aria-label="Transaction Science Board"
            >
                <div class="dg-panel-head">TRANSACTION SCIENCE BOARD</div>
                <p class="dg-placard-sub">
                    Every row below is a real transaction emitted in this run.
                    Use it to learn what was verified on-chain vs what was
                    recorded as an audit digest.
                </p>

                <div class="dg-tx-stats">
                    <div class="dg-tx-stat">
                        <span class="dg-tx-stat-value"
                            >{txScienceStats.total}</span
                        >
                        <span class="dg-tx-stat-label">TOTAL TX</span>
                    </div>
                    <div class="dg-tx-stat">
                        <span class="dg-tx-stat-value"
                            >{txScienceStats.verifies}</span
                        >
                        <span class="dg-tx-stat-label">ON-CHAIN VERIFY</span>
                    </div>
                    <div class="dg-tx-stat">
                        <span class="dg-tx-stat-value"
                            >{txScienceStats.records}</span
                        >
                        <span class="dg-tx-stat-label">AUDIT RECORDS</span>
                    </div>
                    <div class="dg-tx-stat">
                        <span class="dg-tx-stat-value"
                            >{txScienceStats.avgProofMs}ms</span
                        >
                        <span class="dg-tx-stat-label">AVG LOCAL PROOF</span>
                    </div>
                </div>

                <div class="dg-tx-flow-pill">
                    SCIENTIFIC FLOW: snarkjs/bb.js/RISC0 prove → simulate →
                    assemble → {testnetAddress ? "Freighter" : "passkey"} sign/send
                    → Soroban contract result
                </div>

                {#if txScienceEvents.length === 0}
                    <p class="dg-hint">
                        No on-chain transactions yet in this run.
                    </p>
                {:else}
                    <div class="dg-tx-grid">
                        {#each txScienceEvents as tx, idx}
                            <article class="dg-tx-card">
                                <div class="dg-tx-card-head">
                                    <span class="dg-tx-step">TX {idx + 1}</span>
                                    <span class="dg-tx-kind"
                                        >{txKindBadge(tx.txKind)}</span
                                    >
                                </div>
                                <div class="dg-tx-title">
                                    {tx.roomLabel} • {tx.actionLabel}
                                </div>
                                <div class="dg-tx-meta">
                                    <span>SYSTEM: {tx.proofSystem}</span>
                                    <span
                                        >HASH: {tx.hash.slice(
                                            0,
                                            10,
                                        )}...{tx.hash.slice(-8)}</span
                                    >
                                    {#if tx.commitment}
                                        <span
                                            title="Poseidon(address_hash, balance, salt) — public input submitted on-chain"
                                        >
                                            POSEIDON COMMIT: {BigInt(
                                                tx.commitment,
                                            )
                                                .toString(16)
                                                .slice(0, 10)}...
                                        </span>
                                    {/if}
                                </div>
                                <p class="dg-tx-note">{tx.learningNote}</p>
                                <a
                                    class="dg-stamp-link"
                                    href={txExplorerUrl(
                                        tx.hash,
                                        tx.network === "testnet",
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    OPEN IN STELLAR EXPERT {tx.network ===
                                    "testnet"
                                        ? "(TESTNET)"
                                        : ""}
                                </a>
                            </article>
                        {/each}
                    </div>
                {/if}
            </section>

            <section
                class="dg-panel dg-panel-comingsoon"
                aria-label="Sealed Door Room Five"
            >
                <div class="dg-panel-head">SEALED VAULT DOOR: ROOM 5</div>
                <div class="dg-comingsoon-wrap">
                    <div class="dg-comingsoon-seal" aria-hidden="true">V</div>
                    <div class="dg-comingsoon-copy">
                        <p class="dg-comingsoon-title">
                            Beyond This Chamber: The Root Genome Annex
                        </p>
                        <p class="dg-comingsoon-text">
                            Your run established a verified trail through
                            intake, custody, and cold storage. The next sealed
                            wing is designed as a cross-system proving gauntlet
                            where one audit flow composes Groth16, UltraHonk,
                            and RISC0 evidence into a single compliance
                            narrative.
                        </p>
                        <p class="dg-comingsoon-text">
                            This door stays locked for now, but your ledger
                            trail is preserved and can be used as the preflight
                            context for the next release.
                        </p>
                        <div class="dg-comingsoon-list">
                            <span
                                >• Composite verifier chain: Groth16 → Noir →
                                RISC0 in one mission</span
                            >
                            <span
                                >• Deeper policy graph: tier, lane, parity, and
                                custody continuity</span
                            >
                            <span
                                >• Expanded science board with attempt-level
                                forensic timelines</span
                            >
                        </div>
                        <div class="dg-comingsoon-actions">
                            <button
                                class="dg-btn dg-btn-secondary"
                                type="button"
                                disabled
                            >
                                BREACH ROOM 5 (COMING SOON)
                            </button>
                            <span class="dg-comingsoon-tag"
                                >PREPARED FOR NEXT DEPLOYMENT</span
                            >
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>

    <!-- ── Victory ────────────────────────────────────────────────────── -->
{:else if phase === "victory"}
    <div class={`dg-root dg-victory-screen ${roomThemeClass}`}>
        <div class="dg-stars"></div>
        <div class="dg-victory-content">
            <p class="dg-eyebrow">DUNGEON CLEARED</p>
            <h1 class="dg-victory-title">VICTORY</h1>
            <p class="dg-victory-subtitle">
                You passed every policy gate. Groth16, Noir, RISC0 — each
                door was a live cryptographic check. On-chain stamps, if
                used, are digest-only records signed with your passkey.
                The ledger has your run.
            </p>

            <div class="dg-victory-stats">
                <div class="dg-stat">
                    <span class="dg-stat-value">{TOTAL_FLOORS}</span>
                    <span class="dg-stat-label">ROOMS</span>
                </div>
                <div class="dg-stat">
                    <span class="dg-stat-value">{attempts}</span>
                    <span class="dg-stat-label">ATTEMPTS</span>
                </div>
                <div class="dg-stat">
                    <span class="dg-stat-value"
                        >{runLog.filter((e) => e.door >= 0).length}</span
                    >
                    <span class="dg-stat-label">PROOFS</span>
                </div>
            </div>

            <div class="dg-victory-log-summary">
                <p class="dg-victory-log-title">PROOF TYPES USED</p>
                <div class="dg-proof-types">
                    {#each [...new Set(runLog
                                .filter((e) => e.door >= 0)
                                .map((e) => e.proofType))] as pt}
                        <span class="dg-proof-badge">{pt}</span>
                    {/each}
                </div>
            </div>

            {#if hackathonMode && (hubStartTxHash || hubEndTxHash)}
                <div
                    class="dg-victory-hub"
                    style="margin-top:1.5rem;padding:1rem;border:1px solid rgba(154,230,0,0.3);border-radius:8px;background:rgba(154,230,0,0.06);text-align:left;max-width:32rem;margin-left:auto;margin-right:auto"
                >
                    <p
                        style="font-size:0.65rem;letter-spacing:0.15em;color:#9ae600;margin-bottom:0.5rem"
                    >
                        TESTNET GAME HUB TRANSACTIONS
                    </p>
                    <p
                        style="font-size:0.55rem;opacity:0.6;margin-bottom:0.5rem"
                    >
                        Contract: {TESTNET_HUB_CONTRACT}
                    </p>
                    {#if hubStartTxHash}
                        <p style="font-size:0.6rem;margin-bottom:0.25rem">
                            <span style="color:#9ae600">start_game()</span> TX:
                            <a
                                href="https://stellar.expert/explorer/testnet/tx/{hubStartTxHash}"
                                target="_blank"
                                rel="noreferrer"
                                style="color:#4ad0ff;text-decoration:underline"
                                >{hubStartTxHash.slice(
                                    0,
                                    12,
                                )}...{hubStartTxHash.slice(-8)}</a
                            >
                        </p>
                    {/if}
                    {#if hubEndTxHash}
                        <p style="font-size:0.6rem;margin-bottom:0.25rem">
                            <span style="color:#9ae600">end_game()</span> TX:
                            <a
                                href="https://stellar.expert/explorer/testnet/tx/{hubEndTxHash}"
                                target="_blank"
                                rel="noreferrer"
                                style="color:#4ad0ff;text-decoration:underline"
                                >{hubEndTxHash.slice(
                                    0,
                                    12,
                                )}...{hubEndTxHash.slice(-8)}</a
                            >
                        </p>
                    {/if}
                    {#if hackathonSessionId}
                        <p
                            style="font-size:0.55rem;opacity:0.5;margin-top:0.3rem"
                        >
                            Session ID: {hackathonSessionId}
                        </p>
                    {/if}
                </div>
            {/if}

            <div class="dg-victory-actions">
                <button class="dg-btn dg-btn-primary" onclick={resetGame}
                    >PLAY AGAIN</button
                >
                <a href="/labs/the-farm" class="dg-btn dg-btn-secondary"
                    >VIEW DASHBOARD</a
                >
            </div>
        </div>
    </div>
{/if}

<style>
    /* ── Root & Shared ─────────────────────────────────────────────── */
    :root {
        --dg-bg: #04060b;
        --dg-surface: rgba(10, 13, 22, 0.85);
        --dg-border: rgba(255, 255, 255, 0.1);
        --dg-text: #e8f0ff;
        --dg-text-dim: #8ba3c7;
        --dg-accent: #4ad0ff;
        --dg-accent-2: #9b7bff;
        --dg-accent-3: #ffc47a;
        --dg-accent-glow: rgba(74, 208, 255, 0.32);
        --dg-correct: #4ade80;
        --dg-wrong: #f87171;
        --dg-room-glow-1: rgba(154, 230, 0, 0.1);
        --dg-room-glow-2: rgba(74, 208, 255, 0.12);
        --dg-room-glow-3: rgba(155, 123, 255, 0.1);
        --dg-room-ambient: #03060b;
        --dg-vault-bg-opacity: 0.35;
        --dg-vault-bg-filter: saturate(1.05) contrast(1.05);
        --dg-panel-bg: rgba(8, 12, 20, 0.78);
        --dg-panel-border: rgba(255, 255, 255, 0.1);
        --dg-panel-head-text: rgba(232, 240, 255, 0.7);
        --dg-hud-bg: rgba(4, 6, 11, 0.9);
        --dg-proof-chip-border: rgba(155, 123, 255, 0.3);
        --dg-proof-chip-bg: transparent;
        --dg-btn-primary-a: rgba(54, 72, 45, 0.96);
        --dg-btn-primary-b: rgba(34, 48, 30, 0.98);
        --dg-btn-primary-text: rgba(236, 248, 220, 0.96);
        --dg-btn-primary-border: rgba(154, 230, 0, 0.28);
        --dg-btn-primary-hover-border: rgba(154, 230, 0, 0.4);
        --dg-btn-kale-a: rgba(86, 118, 52, 0.98);
        --dg-btn-kale-b: rgba(58, 84, 39, 0.98);
        --dg-btn-kale-text: rgba(248, 255, 235, 0.97);
        --dg-btn-kale-border: rgba(172, 236, 84, 0.46);
        --dg-btn-kale-hover-border: rgba(194, 246, 122, 0.62);
        --dg-btn-secondary-bg: rgba(23, 32, 20, 0.82);
        --dg-btn-secondary-text: rgba(220, 234, 203, 0.94);
        --dg-btn-secondary-border: rgba(126, 161, 92, 0.36);
        --dg-btn-secondary-hover-bg: rgba(30, 42, 26, 0.92);
        --dg-btn-secondary-hover-border: rgba(154, 230, 0, 0.34);
        --dg-font-display: "Press Start 2P", "JetBrains Mono", monospace;
        --dg-font-body: "Inter", system-ui, -apple-system, sans-serif;
    }

    .dg-root {
        position: fixed;
        inset: 0;
        height: 100dvh;
        background: var(--dg-bg);
        color: var(--dg-text);
        font-family: var(--dg-font-body);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition:
            background 240ms ease,
            color 240ms ease;
    }

    .dg-room-airlock {
        --dg-accent: #8de7ff;
        --dg-accent-2: #a9b9ff;
        --dg-accent-3: #ffd5a8;
        --dg-accent-glow: rgba(141, 231, 255, 0.34);
        --dg-room-glow-1: rgba(113, 188, 214, 0.16);
        --dg-room-glow-2: rgba(109, 149, 255, 0.13);
        --dg-room-glow-3: rgba(185, 203, 255, 0.11);
        --dg-room-ambient: #04070f;
        --dg-panel-bg: rgba(9, 15, 26, 0.8);
        --dg-btn-primary-a: rgba(53, 79, 87, 0.95);
        --dg-btn-primary-b: rgba(34, 55, 62, 0.98);
        --dg-btn-primary-border: rgba(141, 231, 255, 0.34);
        --dg-btn-primary-hover-border: rgba(141, 231, 255, 0.52);
        --dg-btn-kale-a: rgba(66, 104, 113, 0.97);
        --dg-btn-kale-b: rgba(41, 72, 79, 0.98);
        --dg-btn-kale-border: rgba(170, 230, 244, 0.48);
        --dg-btn-kale-hover-border: rgba(191, 241, 252, 0.64);
    }

    .dg-room-intake {
        --dg-accent: #9ae600;
        --dg-accent-2: #7fd3ff;
        --dg-accent-3: #ffe28f;
        --dg-accent-glow: rgba(154, 230, 0, 0.34);
        --dg-room-glow-1: rgba(154, 230, 0, 0.18);
        --dg-room-glow-2: rgba(89, 200, 142, 0.14);
        --dg-room-glow-3: rgba(127, 211, 255, 0.12);
        --dg-room-ambient: #04080a;
        --dg-panel-bg: rgba(10, 16, 11, 0.8);
        --dg-btn-primary-a: rgba(73, 106, 38, 0.97);
        --dg-btn-primary-b: rgba(49, 73, 29, 0.98);
        --dg-btn-primary-border: rgba(178, 241, 84, 0.42);
        --dg-btn-primary-hover-border: rgba(196, 247, 112, 0.58);
        --dg-btn-kale-a: rgba(94, 131, 44, 0.98);
        --dg-btn-kale-b: rgba(66, 96, 35, 0.99);
        --dg-btn-kale-border: rgba(196, 247, 112, 0.52);
        --dg-btn-kale-hover-border: rgba(216, 255, 150, 0.68);
    }

    .dg-room-catalog {
        --dg-accent: #ffcf86;
        --dg-accent-2: #9bd1ff;
        --dg-accent-3: #caa7ff;
        --dg-accent-glow: rgba(255, 207, 134, 0.34);
        --dg-room-glow-1: rgba(255, 178, 95, 0.14);
        --dg-room-glow-2: rgba(126, 195, 255, 0.15);
        --dg-room-glow-3: rgba(202, 167, 255, 0.12);
        --dg-room-ambient: #08070b;
        --dg-panel-bg: rgba(16, 13, 17, 0.8);
        --dg-btn-primary-a: rgba(103, 78, 44, 0.97);
        --dg-btn-primary-b: rgba(74, 55, 33, 0.98);
        --dg-btn-primary-border: rgba(255, 207, 134, 0.42);
        --dg-btn-primary-hover-border: rgba(255, 221, 161, 0.58);
        --dg-btn-kale-a: rgba(119, 89, 50, 0.98);
        --dg-btn-kale-b: rgba(82, 60, 35, 0.99);
        --dg-btn-kale-border: rgba(255, 214, 148, 0.5);
        --dg-btn-kale-hover-border: rgba(255, 227, 180, 0.66);
        --dg-btn-secondary-bg: rgba(29, 23, 17, 0.84);
        --dg-btn-secondary-border: rgba(182, 140, 95, 0.36);
    }

    .dg-room-cold {
        --dg-accent: #82eaff;
        --dg-accent-2: #9cb8ff;
        --dg-accent-3: #b5ffe8;
        --dg-accent-glow: rgba(130, 234, 255, 0.34);
        --dg-room-glow-1: rgba(94, 189, 255, 0.14);
        --dg-room-glow-2: rgba(156, 184, 255, 0.13);
        --dg-room-glow-3: rgba(181, 255, 232, 0.11);
        --dg-room-ambient: #03070d;
        --dg-panel-bg: rgba(9, 14, 24, 0.82);
        --dg-btn-primary-a: rgba(45, 83, 103, 0.97);
        --dg-btn-primary-b: rgba(29, 58, 75, 0.98);
        --dg-btn-primary-border: rgba(130, 234, 255, 0.4);
        --dg-btn-primary-hover-border: rgba(160, 242, 255, 0.56);
        --dg-btn-kale-a: rgba(62, 99, 119, 0.98);
        --dg-btn-kale-b: rgba(40, 72, 90, 0.99);
        --dg-btn-kale-border: rgba(160, 242, 255, 0.48);
        --dg-btn-kale-hover-border: rgba(190, 248, 255, 0.64);
    }

    .dg-room-ledger {
        --dg-accent: #d9ff93;
        --dg-accent-2: #ffcf86;
        --dg-accent-3: #93d6ff;
        --dg-accent-glow: rgba(217, 255, 147, 0.32);
        --dg-room-glow-1: rgba(217, 255, 147, 0.15);
        --dg-room-glow-2: rgba(255, 207, 134, 0.12);
        --dg-room-glow-3: rgba(147, 214, 255, 0.11);
        --dg-room-ambient: #0a0906;
        --dg-panel-bg: rgba(18, 15, 10, 0.8);
        --dg-btn-primary-a: rgba(90, 107, 45, 0.97);
        --dg-btn-primary-b: rgba(63, 75, 33, 0.98);
        --dg-btn-primary-border: rgba(217, 255, 147, 0.4);
        --dg-btn-primary-hover-border: rgba(228, 255, 176, 0.56);
        --dg-btn-kale-a: rgba(104, 121, 56, 0.98);
        --dg-btn-kale-b: rgba(72, 84, 38, 0.99);
        --dg-btn-kale-border: rgba(230, 255, 184, 0.48);
        --dg-btn-kale-hover-border: rgba(236, 255, 205, 0.64);
    }

    .dg-stars {
        position: absolute;
        inset: 0;
        background: radial-gradient(
                1px 1px at 10% 20%,
                rgba(255, 255, 255, 0.4),
                transparent
            ),
            radial-gradient(
                1px 1px at 30% 70%,
                rgba(255, 255, 255, 0.3),
                transparent
            ),
            radial-gradient(
                1px 1px at 50% 10%,
                rgba(255, 255, 255, 0.5),
                transparent
            ),
            radial-gradient(
                1px 1px at 70% 40%,
                rgba(255, 255, 255, 0.3),
                transparent
            ),
            radial-gradient(
                1px 1px at 90% 80%,
                rgba(255, 255, 255, 0.4),
                transparent
            ),
            radial-gradient(
                2px 2px at 20% 50%,
                rgba(74, 208, 255, 0.2),
                transparent
            ),
            radial-gradient(
                2px 2px at 80% 30%,
                rgba(155, 123, 255, 0.2),
                transparent
            );
        pointer-events: none;
        z-index: 0;
    }

    /* ── Buttons ──────────────────────────────────────────────────── */
    .dg-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 14px 28px;
        border-radius: 8px;
        border: 1px solid var(--dg-border);
        font-family: var(--dg-font-display);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
        text-decoration: none;
        backdrop-filter: blur(2px);
    }

    .dg-btn-primary {
        background: linear-gradient(
            145deg,
            var(--dg-btn-primary-a),
            var(--dg-btn-primary-b)
        );
        color: var(--dg-btn-primary-text);
        border-color: var(--dg-btn-primary-border);
        box-shadow:
            0 8px 24px rgba(8, 12, 8, 0.55),
            inset 0 1px 0 rgba(220, 255, 170, 0.08);
    }
    .dg-btn-primary:hover {
        border-color: var(--dg-btn-primary-hover-border);
        box-shadow:
            0 12px 34px rgba(8, 12, 8, 0.62),
            inset 0 1px 0 rgba(220, 255, 170, 0.12);
        transform: translateY(-1px);
    }

    .dg-btn-kale {
        background: linear-gradient(
            145deg,
            var(--dg-btn-kale-a),
            var(--dg-btn-kale-b)
        );
        color: var(--dg-btn-kale-text);
        box-shadow:
            0 10px 28px rgba(12, 20, 10, 0.58),
            inset 0 1px 0 rgba(223, 255, 183, 0.14);
        border-color: var(--dg-btn-kale-border);
    }
    .dg-btn-kale:hover {
        border-color: var(--dg-btn-kale-hover-border);
        box-shadow:
            0 14px 40px rgba(10, 18, 9, 0.66),
            inset 0 1px 0 rgba(231, 255, 200, 0.22);
    }

    .dg-btn-secondary {
        background: var(--dg-btn-secondary-bg);
        color: var(--dg-btn-secondary-text);
        border-color: var(--dg-btn-secondary-border);
    }
    .dg-btn-secondary:hover {
        background: var(--dg-btn-secondary-hover-bg);
        border-color: var(--dg-btn-secondary-hover-border);
    }

    .dg-btn-ghost {
        background: transparent;
        color: rgba(166, 191, 139, 0.86);
        border-color: rgba(106, 134, 84, 0.24);
        font-size: 10px;
        padding: 10px 20px;
    }
    .dg-btn-ghost:hover {
        color: rgba(223, 243, 201, 0.95);
        border-color: rgba(154, 230, 0, 0.34);
        background: rgba(21, 30, 18, 0.6);
    }

    .dg-btn:focus-visible {
        outline: 2px solid rgba(187, 245, 110, 0.65);
        outline-offset: 2px;
    }

    .dg-btn:disabled {
        opacity: 0.52;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .dg-btn-sm {
        padding: 8px 16px;
        font-size: 9px;
    }

    .dg-btn-paste {
        min-width: 92px;
    }

    .dg-input {
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--dg-border);
        border-radius: 8px;
        color: var(--dg-text);
        font-family: var(--dg-font-display);
        font-size: 12px;
        letter-spacing: 3px;
        text-transform: uppercase;
        text-align: center;
        width: 280px;
        max-width: 90vw;
        outline: none;
    }
    /* ── Kale-Seed Vault Layout ─────────────────────────────────────── */
    .dg-vault-screen {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        height: 100%;
        max-height: 100%;
        background: radial-gradient(
                1200px 700px at 15% 10%,
                var(--dg-room-glow-1),
                transparent 60%
            ),
            radial-gradient(
                900px 600px at 80% 30%,
                var(--dg-room-glow-2),
                transparent 55%
            ),
            radial-gradient(
                900px 700px at 70% 90%,
                var(--dg-room-glow-3),
                transparent 60%
            ),
            var(--dg-room-ambient);
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        transition: background 320ms ease;
    }

    .dg-vault-bg {
        position: absolute;
        inset: 0;
        background-image: url("/labs/zkdungeon/art/texture-midnight-kale.webp"),
            url("/labs/zkdungeon/art/vault-blueprint-map.webp");
        background-size:
            1024px 1024px,
            cover;
        background-position: center, center;
        opacity: var(--dg-vault-bg-opacity);
        filter: var(--dg-vault-bg-filter);
        pointer-events: none;
        transition:
            opacity 260ms ease,
            filter 260ms ease;
    }

    .dg-vault-shell {
        position: relative;
        max-width: 1500px;
        margin: 0 auto;
        padding: 24px;
        padding-bottom: calc(24px + env(safe-area-inset-bottom));
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .dg-ledger .dg-vault-shell {
        padding-bottom: calc(48px + env(safe-area-inset-bottom));
    }

    .dg-vault-header {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .dg-room-art {
        width: 100%;
        height: auto;
        max-height: 260px;
        object-fit: cover;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 14px 60px rgba(0, 0, 0, 0.55);
    }

    @media (min-width: 1100px) {
        /* Reduce vertical "hero" height so the Airlock primary action stays above the fold. */
        .dg-vault-header {
            grid-template-columns: 1.25fr 0.75fr;
            align-items: end;
            gap: 16px;
        }
        .dg-room-art {
            max-height: 220px;
        }
    }

    @media (max-height: 760px) {
        .dg-room-art {
            max-height: 190px;
        }
        .dg-vault-shell {
            padding: 18px;
        }
    }

    .dg-vault-grid,
    .dg-room-grid {
        display: grid;
        grid-template-columns: 1.05fr 1.2fr 0.75fr;
        gap: 16px;
        align-items: start;
    }

    .dg-panel {
        background: var(--dg-panel-bg);
        border: 1px solid var(--dg-panel-border);
        border-radius: 18px;
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        transition:
            background 240ms ease,
            border-color 240ms ease;
    }

    .dg-panel-head {
        padding: 12px 14px;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--dg-panel-head-text);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background-image: url("/labs/zkdungeon/art/texture-placard.webp");
        background-size: 512px 512px;
        background-repeat: repeat;
    }

    .dg-panel-lore {
        padding-bottom: 12px;
        background-image: url("/labs/zkdungeon/art/texture-midnight-kale.webp");
        background-size: 1024px 1024px;
        background-repeat: repeat;
        background-color: rgba(8, 12, 20, 0.78);
        background-blend-mode: overlay;
    }

    .dg-panel-doors {
        padding-bottom: 18px;
    }

    .dg-panel-placard {
        padding-bottom: 16px;
    }

    .dg-panel-notebook {
        padding: 0 0 14px;
    }

    .dg-room-title {
        padding: 12px 14px 0;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.03em;
    }

    .dg-room-sub {
        padding: 0 14px 10px;
        font-size: 12px;
        color: rgba(232, 240, 255, 0.65);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .dg-lore-p {
        padding: 0 14px;
        margin: 10px 0;
        line-height: 1.55;
        color: rgba(232, 240, 255, 0.82);
        font-size: 13px;
    }

    .dg-panel-split {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 12px 14px;
    }

    .dg-placard {
        padding: 0 14px;
        margin: 10px 0 0;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: rgba(232, 240, 255, 0.92);
    }

    .dg-placard-sub {
        padding: 8px 14px 0;
        font-size: 12px;
        line-height: 1.45;
        color: rgba(232, 240, 255, 0.68);
    }

    .dg-proof-note {
        margin-left: 8px;
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: rgba(232, 240, 255, 0.72);
    }

    .dg-notebook-art {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        padding: 14px;
    }

    .dg-notebook-guardian {
        width: 100%;
        height: auto;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dg-notebook-badge {
        width: 76px;
        height: 76px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.25);
    }

    .dg-notebook-blueprint {
        width: calc(100% - 28px);
        margin: 10px 14px 0;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        opacity: 0.85;
    }

    .dg-note-line {
        padding: 0 14px;
        margin: 8px 0;
        font-size: 12px;
        color: rgba(232, 240, 255, 0.75);
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }

    .dg-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        letter-spacing: 0.03em;
    }

    .dg-lane-chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        margin-left: 6px;
        font-size: 11px;
        letter-spacing: 0.06em;
    }

    .dg-mini-link {
        margin-left: 8px;
        color: rgba(74, 208, 255, 0.85);
        text-decoration: none;
    }

    .dg-mini-link:hover {
        text-decoration: underline;
    }

    /* Airlock + ledger */
    .dg-stamp-box {
        margin: 14px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.22);
    }

    .dg-stamp-title {
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(232, 240, 255, 0.88);
        margin-bottom: 6px;
    }

    .dg-stamp-status {
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(232, 240, 255, 0.65);
        margin-bottom: 8px;
    }

    .dg-stamp-link {
        display: inline-block;
        font-size: 12px;
        color: rgba(74, 208, 255, 0.88);
        text-decoration: none;
        margin-bottom: 8px;
    }

    .dg-stamp-link:hover {
        text-decoration: underline;
    }

    .dg-stamp-error {
        margin-top: 8px;
        font-size: 12px;
        color: rgba(255, 196, 122, 0.92);
    }

    .dg-vault-actions {
        padding: 0 14px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
    }

    .dg-panel-txscience {
        margin-top: 14px;
        border-style: solid;
    }

    .dg-panel-comingsoon {
        margin-top: 14px;
        border-style: dashed;
    }

    .dg-comingsoon-wrap {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 14px;
        align-items: start;
        padding: 14px;
    }

    .dg-comingsoon-seal {
        width: 54px;
        height: 54px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        font-family: var(--dg-font-display);
        font-size: 20px;
        letter-spacing: 1px;
        color: rgba(255, 255, 255, 0.92);
        border: 1px solid var(--dg-btn-primary-hover-border);
        background: linear-gradient(
            140deg,
            rgba(255, 255, 255, 0.08),
            rgba(255, 255, 255, 0.02)
        );
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    }

    .dg-comingsoon-title {
        margin: 0;
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 1.3px;
        color: rgba(255, 255, 255, 0.94);
        text-transform: uppercase;
    }

    .dg-comingsoon-text {
        margin: 10px 0 0;
        color: rgba(255, 255, 255, 0.78);
        font-size: 12px;
        line-height: 1.5;
        max-width: 90ch;
    }

    .dg-comingsoon-list {
        margin-top: 10px;
        display: grid;
        gap: 5px;
        color: rgba(232, 240, 255, 0.82);
        font-size: 12px;
    }

    .dg-comingsoon-actions {
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .dg-comingsoon-tag {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1.2px;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: rgba(255, 255, 255, 0.75);
        background: rgba(255, 255, 255, 0.06);
        text-transform: uppercase;
    }

    .dg-tx-stats {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
    }

    .dg-tx-stat {
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 10px;
        padding: 10px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .dg-tx-stat-value {
        font-family: var(--dg-font-display);
        font-size: 12px;
        color: rgba(154, 230, 0, 0.95);
        letter-spacing: 1px;
    }

    .dg-tx-stat-label {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1.2px;
        color: var(--dg-text-dim);
    }

    .dg-tx-flow-pill {
        margin-top: 10px;
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.85);
        border: 1px dashed rgba(154, 230, 0, 0.28);
        background: rgba(154, 230, 0, 0.08);
        border-radius: 999px;
        padding: 8px 10px;
        display: inline-flex;
        align-items: center;
    }

    .dg-tx-grid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    .dg-tx-card {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 12px;
        background: rgba(5, 10, 16, 0.65);
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .dg-tx-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .dg-tx-step {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1.2px;
        color: var(--dg-text-dim);
    }

    .dg-tx-kind {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1.2px;
        color: rgba(154, 230, 0, 0.95);
        border: 1px solid rgba(154, 230, 0, 0.3);
        border-radius: 999px;
        padding: 3px 8px;
        background: rgba(154, 230, 0, 0.06);
    }

    .dg-tx-title {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 1px;
        color: rgba(255, 255, 255, 0.94);
        text-transform: uppercase;
    }

    .dg-tx-meta {
        display: grid;
        gap: 4px;
        color: var(--dg-text-dim);
        font-size: 11px;
        font-family: "JetBrains Mono", monospace;
    }

    .dg-tx-note {
        margin: 0;
        color: rgba(255, 255, 255, 0.78);
        font-size: 12px;
        line-height: 1.45;
    }

    /* Responsive */
    @media (max-width: 1100px) {
        .dg-vault-grid,
        .dg-room-grid {
            grid-template-columns: 1fr;
        }
        .dg-comingsoon-wrap {
            grid-template-columns: 1fr;
        }
        .dg-tx-grid {
            grid-template-columns: 1fr;
        }
        .dg-tx-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
    .dg-input:focus {
        border-color: rgba(154, 230, 0, 0.45);
        box-shadow: 0 0 0 4px rgba(154, 230, 0, 0.1);
    }
    .dg-input::placeholder {
        color: rgba(255, 255, 255, 0.2);
        letter-spacing: 1px;
    }

    /* ── Title Screen ────────────────────────────────────────────── */
    .dg-title-screen {
        align-items: flex-start; /* Was center; allow scrolling from top */
        justify-content: flex-start;
        overflow-y: auto; /* Enable scrolling if content overflows */
        background: radial-gradient(
            ellipse at 50% 30%,
            rgba(74, 100, 180, 0.15),
            var(--dg-bg) 70%
        );
    }

    .dg-title-content {
        position: relative;
        z-index: 1;
        text-align: center;
        max-width: 520px;
        padding: 24px;
        margin: auto; /* Center vertically if space allows, otherwise flow */
    }

    .dg-eyebrow {
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 4px;
        color: var(--dg-accent);
        margin: 0 0 12px;
        text-transform: uppercase;
    }

    .dg-game-title {
        font-family: var(--dg-font-display);
        font-size: clamp(18px, 4vw, 32px);
        letter-spacing: 2px;
        margin: 0 0 16px;
        background: linear-gradient(135deg, var(--dg-text), var(--dg-accent));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .dg-subtitle {
        font-size: 14px;
        color: var(--dg-text-dim);
        margin: 0 0 32px;
        line-height: 1.6;
    }

    .dg-title-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .dg-join-row {
        width: min(520px, 94vw);
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
    }

    .dg-join-label {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        color: var(--dg-text-dim);
        text-transform: uppercase;
    }

    .dg-join-controls {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
    }

    .dg-btn-join {
        min-width: 170px;
    }

    .dg-wallet-badge {
        font-family: var(--dg-font-display);
        font-size: 9px;
        color: var(--dg-accent);
        margin: 0 0 8px;
        padding: 6px 12px;
        border: 1px solid var(--dg-accent-glow);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
    }

    .dg-hint {
        font-size: 11px;
        color: var(--dg-text-dim);
        margin: 0;
    }

    .dg-cred-card {
        margin-top: 14px;
        padding: 14px 14px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        text-align: left;
    }
    .dg-hackathon-card {
        border-color: rgba(154, 230, 0, 0.2);
        background: rgba(154, 230, 0, 0.03);
    }

    .dg-cred-line {
        margin: 0;
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 2px;
        color: rgba(255, 255, 255, 0.86);
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }

    .dg-cred-tiny {
        font-family: var(--dg-font-body);
        font-size: 10px;
        letter-spacing: 0.4px;
        color: rgba(232, 240, 255, 0.55);
        text-transform: none;
    }

    .dg-cred-subline {
        margin-top: 10px;
        font-size: 9px;
        letter-spacing: 1.6px;
        color: rgba(255, 255, 255, 0.68);
    }

    .dg-cred-inline-warn {
        font-size: 9px;
        color: rgba(255, 196, 122, 0.9);
        letter-spacing: 0.8px;
        text-transform: none;
    }

    .dg-cred-source {
        font-size: 9px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(74, 222, 128, 0.35);
        background: rgba(74, 222, 128, 0.08);
        color: rgba(74, 222, 128, 0.95);
    }

    .dg-cred-source-demo {
        border-color: rgba(255, 196, 122, 0.35);
        background: rgba(255, 196, 122, 0.08);
        color: rgba(255, 196, 122, 0.95);
    }

    .dg-cred-warn {
        margin: 10px 0 0;
        font-size: 11px;
        color: rgba(255, 196, 122, 0.85);
        line-height: 1.35;
    }

    .dg-cred-controls {
        margin-top: 12px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
    }

    .dg-cred-override {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
    }

    .dg-select {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(255, 255, 255, 0.86);
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 1px;
        text-transform: uppercase;
    }

    .dg-link-btn {
        background: none;
        border: none;
        color: var(--dg-text-dim);
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        cursor: pointer;
        margin-top: 24px;
        padding: 8px;
        transition: color 0.2s;
    }
    .dg-link-btn:hover {
        color: var(--dg-accent);
    }

    .dg-how-it-works {
        margin-top: 20px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
        background: var(--dg-surface);
        border: 1px solid var(--dg-border);
        border-radius: 12px;
    }

    .dg-hiw-item {
        display: flex;
        gap: 14px;
        align-items: flex-start;
    }

    .dg-hiw-num {
        font-family: var(--dg-font-display);
        font-size: 12px;
        color: var(--dg-accent);
        min-width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(74, 208, 255, 0.3);
        border-radius: 6px;
        flex-shrink: 0;
    }

    .dg-hiw-item strong {
        font-size: 13px;
        display: block;
        margin-bottom: 2px;
    }

    .dg-hiw-item p {
        font-size: 12px;
        color: var(--dg-text-dim);
        margin: 0;
        line-height: 1.5;
    }

    .dg-title-footer {
        /* position: fixed; <- Removed to prevent overlap */
        width: 100%;
        padding: 16px;
        text-align: center;
        z-index: 1;
        margin-top: auto; /* Push to bottom if flex container has space */
        flex-shrink: 0;
    }

    .dg-footer-link {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 2px;
        color: var(--dg-text-dim);
        text-decoration: none;
        background: none;
        border: none;
        cursor: pointer;
        transition: color 0.2s;
    }
    .dg-footer-link:hover {
        color: var(--dg-accent);
    }

    .dg-footer-sep {
        color: rgba(255, 255, 255, 0.15);
        margin: 0 12px;
        font-size: 10px;
    }

    /* ── Lobby Screen ────────────────────────────────────────────── */
    .dg-lobby-screen {
        align-items: center;
        justify-content: center;
        background: radial-gradient(
            ellipse at 50% 40%,
            rgba(155, 123, 255, 0.1),
            var(--dg-bg) 70%
        );
    }

    .dg-lobby-content {
        position: relative;
        z-index: 1;
        text-align: center;
        max-width: 480px;
        padding: 24px;
    }

    .dg-back-btn {
        position: absolute;
        top: -40px;
        left: 0;
        background: none;
        border: none;
        color: var(--dg-text-dim);
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 1px;
        cursor: pointer;
    }
    .dg-back-btn:hover {
        color: var(--dg-text);
    }

    .dg-lobby-title {
        font-family: var(--dg-font-display);
        font-size: 14px;
        letter-spacing: 1.5px;
        margin: 0 0 24px;
    }

    .dg-lobby-code-display {
        padding: 24px;
        background: var(--dg-surface);
        border: 1px solid var(--dg-border);
        border-radius: 12px;
        margin-bottom: 24px;
    }

    .dg-lobby-code-label {
        font-family: var(--dg-font-display);
        font-size: 9px;
        color: var(--dg-text-dim);
        letter-spacing: 2px;
        margin: 0 0 8px;
    }

    .dg-lobby-code {
        font-family: var(--dg-font-display);
        font-size: 32px;
        letter-spacing: 8px;
        color: var(--dg-accent);
        margin: 0 0 12px;
        text-shadow: 0 0 20px var(--dg-accent-glow);
    }

    .dg-relay-status {
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: center;
        margin: -8px 0 18px;
    }

    .dg-relay-pill {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.05);
        color: var(--dg-text-dim);
    }
    .dg-relay-connected {
        color: rgba(74, 222, 128, 0.95);
        border-color: rgba(74, 222, 128, 0.35);
        background: rgba(74, 222, 128, 0.08);
    }
    .dg-relay-connecting {
        color: rgba(255, 196, 122, 0.95);
        border-color: rgba(255, 196, 122, 0.35);
        background: rgba(255, 196, 122, 0.08);
    }
    .dg-relay-error {
        color: rgba(248, 113, 113, 0.95);
        border-color: rgba(248, 113, 113, 0.35);
        background: rgba(248, 113, 113, 0.08);
    }

    .dg-relay-detail {
        font-size: 11px;
        color: rgba(248, 113, 113, 0.85);
        max-width: 60ch;
        text-wrap: balance;
    }

    .dg-lobby-players {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
    }

    .dg-lobby-player {
        flex: 1;
        padding: 16px;
        border-radius: 10px;
        border: 1px solid var(--dg-border);
        background: var(--dg-surface);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
    }

    .dg-lobby-player-ready {
        border-color: rgba(74, 222, 128, 0.3);
    }

    .dg-lobby-player-waiting {
        opacity: 0.5;
    }

    .dg-lobby-player-icon {
        font-family: var(--dg-font-display);
        font-size: 14px;
        color: var(--dg-accent);
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border: 1px solid var(--dg-border);
        border-radius: 8px;
    }

    .dg-lobby-player-name {
        font-size: 11px;
        font-weight: 600;
    }

    .dg-lobby-player-status {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 2px;
        color: var(--dg-correct);
    }

    .dg-lobby-player-waiting .dg-lobby-player-status {
        color: var(--dg-text-dim);
    }

    /* ── Game Screen ─────────────────────────────────────────────── */
    .dg-game-screen {
        background: radial-gradient(
            ellipse at 50% 20%,
            rgba(20, 30, 60, 0.8),
            var(--dg-bg) 70%
        );
    }

    .dg-game-screen.dg-floor-transition {
        animation: dg-warp 0.6s ease-in-out;
    }

    @keyframes dg-warp {
        0% {
            filter: brightness(1);
        }
        50% {
            filter: brightness(2) blur(4px);
        }
        100% {
            filter: brightness(1);
        }
    }

    /* ── HUD ─────────────────────────────────────────────────────── */
    .dg-hud {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 20px;
        border-bottom: 1px solid var(--dg-border);
        background: var(--dg-hud-bg);
        backdrop-filter: blur(8px);
        z-index: 10;
        flex-shrink: 0;
        transition: background 240ms ease;
    }

    .dg-hud-left,
    .dg-hud-right {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .dg-hud-center {
        flex: 1;
        max-width: 300px;
        margin: 0 20px;
    }

    .dg-hud-floor {
        font-family: var(--dg-font-display);
        font-size: 11px;
        letter-spacing: 1px;
    }

    .dg-hud-proof-type {
        font-size: 10px;
        color: var(--dg-accent-2);
        padding: 3px 8px;
        border: 1px solid var(--dg-proof-chip-border);
        background: var(--dg-proof-chip-bg);
        border-radius: 4px;
        font-family: var(--dg-font-display);
        letter-spacing: 0.5px;
    }

    .dg-hud-attempts {
        font-family: var(--dg-font-display);
        font-size: 10px;
        color: var(--dg-text-dim);
        letter-spacing: 1px;
    }

    .dg-hud-opponent {
        font-family: var(--dg-font-display);
        font-size: 10px;
        letter-spacing: 1px;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.75);
    }

    .dg-hud-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid var(--dg-border);
        color: var(--dg-text-dim);
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1px;
        padding: 6px 10px;
        border-radius: 4px;
        cursor: pointer;
    }

    .dg-progress-bar {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
    }

    .dg-progress-fill {
        height: 100%;
        background: linear-gradient(
            90deg,
            var(--dg-accent),
            var(--dg-accent-2)
        );
        border-radius: 2px;
        transition: width 0.5s ease;
    }

    /* ── Floor Area ──────────────────────────────────────────────── */
    .dg-floor-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        position: relative;
    }

    .dg-floor-header {
        text-align: center;
        margin-bottom: 32px;
    }

    .dg-floor-name {
        font-family: var(--dg-font-display);
        font-size: clamp(14px, 2.5vw, 20px);
        letter-spacing: 2px;
        margin: 0 0 8px;
    }

    .dg-floor-desc {
        font-size: 13px;
        color: var(--dg-text-dim);
        margin: 0;
    }

    .dg-floor-controls {
        margin-top: 14px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
    }

    .dg-toggle {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid var(--dg-btn-primary-border);
        background: rgba(0, 0, 0, 0.22);
        color: rgba(255, 255, 255, 0.84);
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 1px;
        cursor: pointer;
        user-select: none;
    }

    .dg-toggle input {
        width: 14px;
        height: 14px;
        accent-color: var(--dg-accent);
    }

    .dg-toggle:hover,
    .dg-toggle:focus-within {
        border-color: var(--dg-btn-primary-hover-border);
        color: rgba(255, 255, 255, 0.95);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
    }

    .dg-present {
        border-color: var(--dg-btn-primary-hover-border);
        background: rgba(255, 255, 255, 0.08);
    }

    .dg-select {
        appearance: none;
        background: rgba(6, 12, 8, 0.85);
        border: 1px solid var(--dg-btn-primary-hover-border);
        color: rgba(255, 255, 255, 0.86);
        border-radius: 999px;
        padding: 7px 10px;
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 1px;
        cursor: pointer;
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
    }
    .dg-select:focus {
        outline: 2px solid var(--dg-btn-primary-border);
        outline-offset: 2px;
    }
    .dg-select:disabled {
        opacity: 0.6;
        cursor: default;
    }

    .dg-hint-pill {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 196, 122, 0.35);
        background: rgba(255, 196, 122, 0.08);
        color: rgba(255, 196, 122, 0.95);
    }

    .dg-forensics {
        width: min(820px, 96vw);
        margin: -8px auto 18px;
        padding: 16px 16px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        text-align: left;
    }

    .dg-forensics-ok {
        border-color: rgba(74, 222, 128, 0.25);
        background: rgba(74, 222, 128, 0.06);
    }

    .dg-forensics-no {
        border-color: rgba(248, 113, 113, 0.25);
        background: rgba(248, 113, 113, 0.06);
    }

    .dg-forensics-outcome {
        margin: 0 0 6px;
        font-family: var(--dg-font-display);
        font-size: 11px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.92);
    }

    .dg-forensics-why {
        margin: 0 0 12px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.78);
        line-height: 1.45;
    }

    .dg-forensics-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }

    @media (max-width: 700px) {
        .dg-forensics-grid {
            grid-template-columns: 1fr;
        }
    }

    .dg-forensics-item {
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .dg-forensics-item .k {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        color: rgba(255, 255, 255, 0.55);
        text-transform: uppercase;
    }

    .dg-forensics-item .v {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.82);
        line-height: 1.35;
    }

    .dg-forensics-debug {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed rgba(255, 255, 255, 0.12);
    }

    .dg-debug-title {
        margin: 0 0 8px;
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: rgba(255, 196, 122, 0.95);
    }

    .dg-debug-list {
        margin: 0;
        padding-left: 18px;
        color: rgba(255, 255, 255, 0.7);
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        line-height: 1.45;
    }

    /* ── Doors ───────────────────────────────────────────────────── */
    .dg-doors {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        max-width: 640px;
        width: 100%;
    }

    @media (max-width: 600px) {
        .dg-doors {
            grid-template-columns: repeat(2, 1fr);
            max-width: 340px;
        }
    }

    .dg-door {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 28px 16px;
        background: var(--dg-surface);
        border: 1px solid var(--dg-border);
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.25s ease;
        overflow: hidden;
        min-height: 140px;
        color: var(--dg-text);
        font-family: var(--dg-font-body);
    }

    .dg-door:not(:disabled):hover {
        border-color: rgba(255, 255, 255, 0.25);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .dg-door:disabled {
        cursor: default;
    }

    .dg-door-rune {
        font-size: 36px;
        line-height: 1;
        transition: transform 0.3s ease;
    }

    .dg-door:not(:disabled):hover .dg-door-rune {
        transform: scale(1.15);
    }

    .dg-door-label {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        color: var(--dg-text-dim);
    }

    .dg-door-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        margin-top: -2px;
    }

    .dg-door-tag {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1px;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(255, 255, 255, 0.7);
        text-transform: uppercase;
    }

    .dg-door-tag-lane {
        border-width: 1px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    .dg-door-suggested {
        outline: 2px solid rgba(255, 196, 122, 0.25);
        box-shadow: 0 0 0 6px rgba(255, 196, 122, 0.05);
    }

    .dg-door-status {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 1px;
        padding: 4px 10px;
        border-radius: 4px;
    }

    .dg-status-correct {
        color: var(--dg-correct);
        background: rgba(74, 222, 128, 0.1);
    }

    .dg-status-wrong {
        color: var(--dg-wrong);
        background: rgba(248, 113, 113, 0.1);
    }

    .dg-door-glow {
        position: absolute;
        inset: 0;
        border-radius: 14px;
        opacity: 0;
        transition: opacity 0.3s ease;
        pointer-events: none;
        background: radial-gradient(
            circle at 50% 50%,
            var(--door-color),
            transparent 70%
        );
    }

    .dg-door:not(:disabled):hover .dg-door-glow {
        opacity: 0.08;
    }

    .dg-door-proving {
        border-color: rgba(74, 208, 255, 0.4);
        animation: dg-pulse 1s ease-in-out infinite;
    }

    .dg-door-proving .dg-door-glow {
        opacity: 0.15;
    }

    .dg-door-correct {
        border-color: rgba(74, 222, 128, 0.4);
    }

    .dg-door-correct .dg-door-glow {
        opacity: 0.2;
        background: radial-gradient(
            circle at 50% 50%,
            var(--dg-correct),
            transparent 70%
        );
    }

    .dg-door-wrong {
        border-color: rgba(248, 113, 113, 0.4);
    }

    .dg-door-wrong .dg-door-glow {
        opacity: 0.2;
        background: radial-gradient(
            circle at 50% 50%,
            var(--dg-wrong),
            transparent 70%
        );
    }

    @keyframes dg-pulse {
        0%,
        100% {
            box-shadow: 0 0 12px rgba(74, 208, 255, 0.15);
        }
        50% {
            box-shadow: 0 0 24px rgba(74, 208, 255, 0.3);
        }
    }

    /* ── Gate Overlay ────────────────────────────────────────────── */
    .dg-gate-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgba(4, 6, 11, 0.85);
        backdrop-filter: blur(6px);
        z-index: 5;
    }

    .dg-gate-panel {
        text-align: center;
        padding: 32px;
        background: var(--dg-surface);
        border: 1px solid rgba(155, 123, 255, 0.3);
        border-radius: 16px;
    }

    .dg-gate-title {
        font-family: var(--dg-font-display);
        font-size: 14px;
        color: var(--dg-accent-2);
        letter-spacing: 3px;
        margin: 0 0 8px;
    }

    .dg-gate-desc {
        font-size: 13px;
        color: var(--dg-text-dim);
        margin: 0 0 20px;
    }

    .dg-gate-spinner {
        width: 28px;
        height: 28px;
        border: 2px solid var(--dg-border);
        border-top-color: var(--dg-accent-2);
        border-radius: 50%;
        margin: 0 auto;
        animation: dg-spin 1s linear infinite;
    }

    @keyframes dg-spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* ── Run Log ─────────────────────────────────────────────────── */
    .dg-run-log {
        flex-shrink: 0;
        border-top: 1px solid var(--dg-border);
        background: rgba(4, 6, 11, 0.95);
        max-height: 160px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .dg-run-log-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        color: var(--dg-text-dim);
        border-bottom: 1px solid var(--dg-border);
        flex-shrink: 0;
    }

    .dg-run-log-count {
        background: rgba(255, 255, 255, 0.06);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 9px;
    }

    .dg-run-log-entries {
        overflow-y: auto;
        padding: 4px 0;
    }

    .dg-log-entry {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 16px;
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 0.5px;
    }

    .dg-log-correct {
        color: var(--dg-correct);
    }

    .dg-log-wrong {
        color: var(--dg-wrong);
    }

    .dg-log-pending {
        color: var(--dg-text-dim);
    }

    .dg-log-floor {
        min-width: 28px;
    }

    .dg-log-door {
        min-width: 24px;
    }

    .dg-log-result {
        min-width: 34px;
        font-weight: 700;
    }

    .dg-log-proof {
        color: var(--dg-accent-2);
        min-width: 60px;
    }

    .dg-log-text {
        color: var(--dg-accent);
    }

    .dg-log-tx {
        font-size: 8px;
        color: var(--dg-accent);
        text-decoration: none;
        margin-left: auto;
    }
    .dg-log-tx-pending {
        color: var(--dg-text-dim);
    }

    .dg-log-verified {
        font-family: var(--dg-font-display);
        font-size: 7px;
        letter-spacing: 1px;
        color: var(--dg-correct);
        padding: 1px 5px;
        border: 1px solid rgba(74, 222, 128, 0.3);
        border-radius: 3px;
    }

    .dg-log-time {
        font-size: 8px;
        color: var(--dg-text-dim);
        min-width: 40px;
    }

    /* ── Victory Screen ──────────────────────────────────────────── */
    .dg-victory-screen {
        align-items: center;
        justify-content: center;
        background: radial-gradient(
            ellipse at 50% 40%,
            rgba(74, 222, 128, 0.08),
            var(--dg-bg) 70%
        );
    }

    .dg-victory-content {
        position: relative;
        z-index: 1;
        text-align: center;
        max-width: 520px;
        padding: 24px;
    }

    .dg-victory-title {
        font-family: var(--dg-font-display);
        font-size: clamp(28px, 6vw, 48px);
        letter-spacing: 6px;
        margin: 0 0 12px;
        background: linear-gradient(
            135deg,
            var(--dg-correct),
            var(--dg-accent)
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }

    .dg-victory-subtitle {
        font-size: 14px;
        color: var(--dg-text-dim);
        margin: 0 0 28px;
        line-height: 1.6;
    }

    .dg-victory-stats {
        display: flex;
        gap: 24px;
        justify-content: center;
        margin-bottom: 24px;
    }

    .dg-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 16px 24px;
        background: var(--dg-surface);
        border: 1px solid var(--dg-border);
        border-radius: 10px;
    }

    .dg-stat-value {
        font-family: var(--dg-font-display);
        font-size: 20px;
        color: var(--dg-accent);
    }

    .dg-stat-label {
        font-family: var(--dg-font-display);
        font-size: 8px;
        color: var(--dg-text-dim);
        letter-spacing: 2px;
    }

    .dg-victory-log-summary {
        margin-bottom: 24px;
    }

    .dg-victory-log-title {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 2px;
        color: var(--dg-text-dim);
        margin: 0 0 12px;
    }

    .dg-proof-types {
        display: flex;
        gap: 8px;
        justify-content: center;
    }

    .dg-proof-badge {
        font-family: var(--dg-font-display);
        font-size: 9px;
        letter-spacing: 1px;
        padding: 6px 14px;
        border-radius: 6px;
        border: 1px solid var(--dg-border);
    }

    .dg-proof-groth16 {
        color: var(--dg-accent);
        border-color: rgba(74, 208, 255, 0.3);
    }

    .dg-proof-circom {
        color: var(--dg-accent-3);
        border-color: rgba(255, 196, 122, 0.3);
    }

    .dg-proof-risc0 {
        color: var(--dg-accent-2);
        border-color: rgba(155, 123, 255, 0.3);
    }

    .dg-victory-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    .dg-victory-hub-txs {
        margin-bottom: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .dg-hub-tx-link {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 0.5px;
        color: var(--dg-accent);
        text-decoration: none;
        padding: 6px 12px;
        border: 1px solid rgba(74, 208, 255, 0.2);
        border-radius: 6px;
        transition: background 0.2s;
    }
    .dg-hub-tx-link:hover {
        background: rgba(74, 208, 255, 0.06);
    }

    .dg-hud-hub-status {
        font-family: var(--dg-font-display);
        font-size: 8px;
        color: var(--dg-accent-3);
        animation: dg-pulse 1s ease-in-out infinite;
    }

    .dg-hud-tx-link {
        font-family: var(--dg-font-display);
        font-size: 8px;
        letter-spacing: 1px;
        color: var(--dg-accent);
        text-decoration: none;
        padding: 4px 8px;
        border: 1px solid rgba(74, 208, 255, 0.2);
        border-radius: 4px;
    }
</style>
