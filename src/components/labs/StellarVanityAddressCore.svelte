<script lang="ts">
    import { onMount, tick } from "svelte";
    import { Keypair, StrKey, hash } from "@stellar/stellar-sdk";
    import { Buffer } from "buffer";

    // --- CONSTANTS ---
    const NETWORKS: Record<string, { name: string; passphrase: string }> = {
        mainnet: {
            name: "Public (Mainnet)",
            passphrase: "Public Global Stellar Network ; September 2015",
        },
        testnet: {
            name: "Testnet",
            passphrase: "Test SDF Network ; September 2015",
        },
        futurenet: {
            name: "Futurenet",
            passphrase: "Test SDF Future Network ; October 2022",
        },
    };

    // --- TYPES ---
    type MatchMode = "PREFIX" | "SUFFIX" | "CONTAINS" | "SPLIT" | "MASK";
    type HistoryEntry = {
        type: "G" | "C";
        address: string;
        secret?: string;
        salt?: string;
        network?: string;
        deployer?: string;
        time: number;
        attempts: number;
    };

    // --- STATE ---
    let prefixPattern = $state("");
    let suffixPattern = $state("");
    let matchMode = $state<MatchMode>("PREFIX");

    // Mask State (56 slots for G/C addresses)
    let mask = $state<string[]>(Array(55).fill(""));

    let isCaseSensitive = $state(false);
    let deployerAddress = $state(
        "GDBBQHYLL2I24PSWT5INW2EIDHJL4F2CNLF4BV3TLZWNHK3GI45OJLB4",
    );
    let selectedNetwork = $state("mainnet");
    let isGenerating = $state(false);
    let attempts = $state(0);
    let startTime = $state(0);
    let elapsedTime = $state(0);
    let errorMessage = $state("");
    let copyToast = $state("");
    let copyToastTimer: any;

    // Visual Feedback
    let currentStream = $state("");
    let bestMatch = $state("");
    let bestMatchScore = $state(0);

    let resultG = $state<{ address: string; secret: string } | null>(null);
    let resultC = $state<{ contractId: string; salt: string } | null>(null);
    let mode = $state<"G" | "C">("G");
    let history = $state<HistoryEntry[]>([]);

    let timerInterval: any;

    // --- DERIVED ---
    let difficultyInfo = $derived.by(() => {
        let chars = 0;
        if (matchMode === "MASK") {
            chars = mask.filter((c) => c !== "").length;
        } else if (matchMode === "SPLIT") {
            chars = prefixPattern.length + suffixPattern.length;
        } else {
            chars = prefixPattern.length;
        }
        if (chars === 0) return { label: "\u2014", attempts: 0, color: "#555" };
        const est = Math.pow(32, chars);
        let label: string;
        if (est < 1_000) label = `~${est}`;
        else if (est < 1_000_000) label = `~${(est / 1_000).toFixed(1)}K`;
        else if (est < 1_000_000_000)
            label = `~${(est / 1_000_000).toFixed(1)}M`;
        else label = `~${(est / 1_000_000_000).toFixed(1)}B`;
        const color =
            chars <= 2 ? "#9ae600" : chars <= 4 ? "#f0c020" : "#ff424c";
        return { label, attempts: est, color };
    });

    let etaDisplay = $derived.by(() => {
        if (!isGenerating || elapsedTime < 2 || attempts < 100) return "\u2014";
        const rate = attempts / elapsedTime;
        const remaining = Math.max(0, difficultyInfo.attempts - attempts);
        const secs = Math.ceil(remaining / rate);
        if (secs < 60) return `~${secs}s`;
        if (secs < 3600) return `~${Math.ceil(secs / 60)}m`;
        return `~${(secs / 3600).toFixed(1)}h`;
    });

    let addressPreview = $derived.by(() => {
        if (matchMode !== "PREFIX" || !prefixPattern) return "";
        const prefix = mode + prefixPattern.toUpperCase();
        const remaining = 56 - prefix.length;
        return prefix + "\u2022".repeat(Math.max(0, remaining));
    });

    // --- LOGIC ---

    function startTimer() {
        startTime = Date.now();
        timerInterval = setInterval(() => {
            elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function scoreMatch(
        address: string,
        p1: string,
        p2: string,
        currentMask: string[],
        mode: MatchMode,
        sensitive: boolean,
    ): number {
        const addr = sensitive ? address : address.toUpperCase();
        const body = addr.substring(1);
        const pat1 = sensitive ? p1 : p1.toUpperCase();

        if (mode === "PREFIX") {
            let score = 0;
            for (let i = 0; i < pat1.length; i++) {
                if (body[i] === pat1[i]) score++;
                else break;
            }
            return score;
        }
        return 0; // Only track prefix best-match for now
    }

    function checkMatch(
        address: string,
        p1: string,
        p2: string,
        currentMask: string[],
        mode: MatchMode,
        sensitive: boolean,
    ): boolean {
        const addr = sensitive ? address : address.toUpperCase();
        const body = addr.substring(1);

        if (mode === "MASK") {
            for (let i = 0; i < currentMask.length; i++) {
                const targetChar = currentMask[i];
                if (targetChar === "") continue;

                const charAtPos = body[i];
                const match = sensitive
                    ? charAtPos === targetChar
                    : charAtPos.toUpperCase() === targetChar.toUpperCase();
                if (!match) return false;
            }
            return true;
        }

        const pat1 = sensitive ? p1 : p1.toUpperCase();
        const pat2 = sensitive ? p2 : p2.toUpperCase();

        switch (mode) {
            case "PREFIX":
                return body.startsWith(pat1);
            case "SUFFIX":
                return body.endsWith(pat1);
            case "CONTAINS":
                return body.includes(pat1);
            case "SPLIT":
                return body.startsWith(pat1) && body.endsWith(pat2);
            default:
                return false;
        }
    }

    // Speed optimization: reuse a buffer for salt
    const saltBuffer = new Uint8Array(32);

    async function generateG() {
        isGenerating = true;
        attempts = 0;
        elapsedTime = 0;
        resultG = null;
        currentStream = "";
        bestMatch = "";
        bestMatchScore = 0;
        startTimer();

        const p1 = prefixPattern;
        const p2 = suffixPattern;
        const currentMask = [...mask];
        const currentMode = matchMode;
        const sensitive = isCaseSensitive;

        // Validation: Index 1 (2nd char) for G/C is always A-D
        if (currentMode === "PREFIX" || currentMode === "SPLIT") {
            if (p1.length >= 1) {
                const secondChar = p1[0].toUpperCase();
                if (!"ABCD".includes(secondChar)) {
                    isGenerating = false;
                    stopTimer();
                    errorMessage = `IMPOSSIBLE: Stellar addresses starting with ${mode} cannot have '${secondChar}' as the 2nd char (restricted to A,B,C,D).`;
                    return;
                }
            }
        }

        errorMessage = ""; // Clear errors on success start

        while (isGenerating) {
            for (let i = 0; i < 2000; i++) {
                attempts++;
                const kp = Keypair.random();
                const address = kp.publicKey();

                if (i === 0) currentStream = address;

                // Best-match tracking for PREFIX mode
                if (currentMode === "PREFIX" && p1.length > 1) {
                    const s = scoreMatch(
                        address,
                        p1,
                        p2,
                        currentMask,
                        currentMode,
                        sensitive,
                    );
                    if (s > bestMatchScore) {
                        bestMatchScore = s;
                        bestMatch = address;
                    }
                }

                if (
                    checkMatch(
                        address,
                        p1,
                        p2,
                        currentMask,
                        currentMode,
                        sensitive,
                    )
                ) {
                    resultG = {
                        address: address,
                        secret: kp.secret(),
                    };
                    history = [
                        {
                            type: "G",
                            address,
                            secret: kp.secret(),
                            time: elapsedTime,
                            attempts,
                        },
                        ...history,
                    ].slice(0, 10);
                    isGenerating = false;
                    stopTimer();
                    return;
                }
            }
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    async function generateC() {
        isGenerating = true;
        attempts = 0;
        elapsedTime = 0;
        resultC = null;
        currentStream = "";
        startTimer();

        const p1 = prefixPattern;
        const p2 = suffixPattern;
        const currentMask = [...mask];
        const currentMode = matchMode;
        const sensitive = isCaseSensitive;

        // Validation: Index 1 (2nd char) for G/C is always A-D
        if (currentMode === "PREFIX" || currentMode === "SPLIT") {
            if (p1.length >= 1) {
                const secondChar = p1[0].toUpperCase();
                if (!"ABCD".includes(secondChar)) {
                    isGenerating = false;
                    stopTimer();
                    errorMessage = `IMPOSSIBLE: Contract IDs starting with C cannot have '${secondChar}' as the 2nd char (restricted to A,B,C,D).`;
                    return;
                }
            }
        }

        errorMessage = ""; // Clear errors on success start

        let deployerBytes: Uint8Array;
        try {
            deployerBytes = StrKey.decodeEd25519PublicKey(deployerAddress);
        } catch (e) {
            isGenerating = false;
            stopTimer();
            errorMessage =
                "INVALID DEPLOYER: Please enter a valid Stellar G-address.";
            return;
        }

        const passphrase = NETWORKS[selectedNetwork].passphrase;
        const networkId = hash(Buffer.from(passphrase));

        // XDR: HashIdPreimage::contractID (112 bytes total)
        // [0-3]   EnvelopeType = ENVELOPE_TYPE_CONTRACT_ID (8)
        // [4-35]  networkID = sha256(passphrase)
        // [36-39] ContractIdPreimageType = CONTRACT_ID_PREIMAGE_FROM_ADDRESS (0)
        // [40-43] ScAddressType = SC_ADDRESS_TYPE_ACCOUNT (0)
        // [44-47] PublicKeyType = PUBLIC_KEY_TYPE_ED25519 (0)
        // [48-79] deployer public key (32 bytes)
        // [80-111] salt (32 bytes, brute-forced)
        const totalBuffer = Buffer.alloc(112);
        totalBuffer.writeUInt32BE(8, 0); // ENVELOPE_TYPE_CONTRACT_ID
        totalBuffer.set(networkId, 4); // networkID
        totalBuffer.writeUInt32BE(0, 36); // CONTRACT_ID_PREIMAGE_FROM_ADDRESS
        totalBuffer.writeUInt32BE(0, 40); // SC_ADDRESS_TYPE_ACCOUNT
        totalBuffer.writeUInt32BE(0, 44); // PUBLIC_KEY_TYPE_ED25519
        totalBuffer.set(deployerBytes, 48); // deployer key

        while (isGenerating) {
            for (let i = 0; i < 2000; i++) {
                attempts++;
                crypto.getRandomValues(saltBuffer);
                // Set salt in the varying part of the buffer
                totalBuffer.set(saltBuffer, 80);

                const contractIdHash = hash(totalBuffer);
                const contractId = StrKey.encodeContract(contractIdHash);

                if (i === 0) currentStream = contractId;

                if (
                    checkMatch(
                        contractId,
                        p1,
                        p2,
                        currentMask,
                        currentMode,
                        sensitive,
                    )
                ) {
                    const saltHex = Buffer.from(saltBuffer).toString("hex");
                    resultC = {
                        contractId: contractId,
                        salt: saltHex,
                    };
                    history = [
                        {
                            type: "C",
                            address: contractId,
                            salt: saltHex,
                            network: selectedNetwork,
                            deployer: deployerAddress,
                            time: elapsedTime,
                            attempts,
                        },
                        ...history,
                    ].slice(0, 10);
                    isGenerating = false;
                    stopTimer();
                    return;
                }
            }
            await new Promise((r) => setTimeout(r, 0));
        }
    }

    function stop() {
        isGenerating = false;
        stopTimer();
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
        clearTimeout(copyToastTimer);
        copyToast = "Copied!";
        copyToastTimer = setTimeout(() => (copyToast = ""), 2000);
    }

    function handleMaskInput(index: number, val: string) {
        const char = val.toUpperCase().replace(/[^A-Z2-7]/g, "");

        // Slot 0 validation (index 1 of the address)
        if (index === 0 && char !== "" && !"ABCD".includes(char)) {
            errorMessage = `Slot 1 restricted to A, B, C, or D for ${mode} addresses.`;
            return;
        }

        mask[index] = char.substring(0, 1);
        errorMessage = "";

        if (mask[index]) {
            const next = document.getElementById(`mask-${index + 1}`);
            next?.focus();
        }
    }
</script>

<div class="space-y-6 font-pixel text-[#9ae600]">
    <!-- Type Tabs -->
    <div class="flex gap-4 border-b border-[#333] pb-4">
        <button
            class="px-4 py-2 border {mode === 'G'
                ? 'border-[#9ae600] bg-[#9ae600]/10'
                : 'border-[#333] opacity-50'} rounded transition-all"
            onclick={() => {
                mode = "G";
                stop();
            }}
        >
            G-ADDRESS (WALLET)
        </button>
        <button
            class="px-4 py-2 border {mode === 'C'
                ? 'border-[#9ae600] bg-[#9ae600]/10'
                : 'border-[#333] opacity-50'} rounded transition-all"
            onclick={() => {
                mode = "C";
                stop();
            }}
        >
            C-ADDRESS (CONTRACT)
        </button>
    </div>

    <!-- Match Mode Selector -->
    <div class="flex flex-wrap gap-2">
        {#each ["PREFIX", "SUFFIX", "CONTAINS", "SPLIT", "MASK"] as m}
            <button
                class="text-[10px] px-3 py-1 border {matchMode === m
                    ? 'border-[#9ae600] text-white bg-[#9ae600]/20'
                    : 'border-[#222] text-[#444]'} rounded uppercase tracking-widest transition-all"
                onclick={() => {
                    matchMode = m as MatchMode;
                    stop();
                }}
                disabled={isGenerating}
            >
                {m}
            </button>
        {/each}
    </div>

    {#if errorMessage}
        <div
            class="bg-[#ff424c]/10 border border-[#ff424c] px-4 py-2 rounded text-[10px] uppercase tracking-tighter text-[#ff424c] animate-in fade-in slide-in-from-top-1"
        >
            ⚠ {errorMessage}
        </div>
    {/if}

    <!-- Settings -->
    <div
        class="bg-[#111] p-6 rounded-xl border border-[#333] space-y-6 relative overflow-hidden"
    >
        {#if mode === "C"}
            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-[#333] pb-6 animate-in fade-in slide-in-from-top-2"
            >
                <div class="space-y-2">
                    <label
                        class="text-[8px] text-[#555] uppercase tracking-widest flex justify-between"
                    >
                        Target Network
                        <span class="text-[#9ae600]/40 italic"
                            >(IDs are network-specific)</span
                        >
                    </label>
                    <select
                        bind:value={selectedNetwork}
                        class="w-full bg-black border border-[#333] p-2 text-[10px] uppercase text-[#9ae600] focus:border-[#9ae600] outline-none transition-colors appearance-none cursor-pointer"
                        disabled={isGenerating}
                    >
                        {#each Object.entries(NETWORKS) as [key, net]}
                            <option value={key} class="bg-black text-[#9ae600]"
                                >{net.name}</option
                            >
                        {/each}
                    </select>
                </div>
                <div class="space-y-2">
                    <label
                        class="text-[8px] text-[#555] uppercase tracking-widest flex justify-between"
                    >
                        Deployer Source Address
                        <span class="text-[#9ae600]/40 italic"
                            >(Salts tied to deployer)</span
                        >
                    </label>
                    <input
                        type="text"
                        bind:value={deployerAddress}
                        placeholder="G..."
                        class="w-full bg-black border border-[#333] p-2 text-xs font-mono focus:border-[#9ae600] outline-none transition-colors"
                        disabled={isGenerating}
                    />
                </div>
            </div>
        {/if}

        {#if isGenerating}
            <!-- Stream Overlay -->
            <div
                class="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-10 animate-in fade-in duration-300"
            >
                <div class="w-full max-w-md space-y-4">
                    <div
                        class="flex justify-between items-end border-b border-[#9ae600]/30 pb-2"
                    >
                        <span
                            class="text-[8px] uppercase tracking-[0.3em] text-[#9ae600]/60"
                            >Scanning Network...</span
                        >
                        <span class="text-[8px] text-[#9ae600]"
                            >{attempts.toLocaleString()} ATTEMPTS</span
                        >
                    </div>
                    <div class="font-mono text-center overflow-hidden">
                        <div
                            class="text-[#9ae600] text-sm md:text-lg break-all opacity-40 blur-[1px] transform -translate-y-1"
                        >
                            {currentStream}
                        </div>
                        <div
                            class="text-white text-md md:text-xl break-all font-bold my-1 tracking-wider"
                        >
                            {currentStream}
                        </div>
                        <div
                            class="text-[#9ae600] text-sm md:text-lg break-all opacity-40 blur-[1px] transform translate-y-1"
                        >
                            {currentStream}
                        </div>
                    </div>
                    <div class="h-1 bg-[#222] rounded-full overflow-hidden">
                        <div
                            class="h-full bg-[#9ae600] animate-[shimmer_2s_infinite]"
                            style="width: 100%"
                        ></div>
                    </div>
                </div>
            </div>
        {/if}

        {#if matchMode === "MASK"}
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <label class="text-xs text-[#555] uppercase tracking-widest"
                        >Atomic Mask Grid (56 Slots)</label
                    >
                    <button
                        onclick={() => (mask = Array(55).fill(""))}
                        class="text-[8px] text-[#ff424c] hover:underline uppercase tracking-tighter"
                        >Clear All</button
                    >
                </div>

                <div class="grid grid-cols-8 md:grid-cols-11 gap-1">
                    <div
                        class="aspect-square bg-[#222] border border-[#333] flex items-center justify-center text-[#ff424c] text-xs font-bold opacity-50"
                    >
                        {mode}
                    </div>
                    {#each mask as char, i}
                        <input
                            id="mask-{i}"
                            type="text"
                            maxlength="1"
                            value={char}
                            oninput={(e) =>
                                handleMaskInput(
                                    i,
                                    (e.target as HTMLInputElement).value,
                                )}
                            placeholder="."
                            class="aspect-square w-full bg-black border {char
                                ? 'border-[#9ae600]'
                                : 'border-[#222]'} text-center text-xs focus:border-[#9ae600] focus:bg-[#9ae600]/10 outline-none transition-all placeholder-[#333]"
                            disabled={isGenerating}
                        />
                    {/each}
                </div>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-4">
                    <div class="space-y-2">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                        >
                            {matchMode === "SPLIT"
                                ? "Beginning Pattern"
                                : "Target Pattern"}
                        </label>
                        <input
                            type="text"
                            bind:value={prefixPattern}
                            placeholder={matchMode === "SPLIT"
                                ? "Start e.g. KALE"
                                : "e.g. KALE"}
                            class="w-full bg-black border border-[#333] p-3 text-xl focus:border-[#9ae600] outline-none transition-colors"
                            disabled={isGenerating}
                        />
                        {#if addressPreview}
                            <div
                                class="text-[10px] font-mono text-[#555] break-all tracking-wider"
                            >
                                {addressPreview}
                            </div>
                        {/if}
                    </div>

                    {#if matchMode === "SPLIT"}
                        <div class="space-y-2">
                            <label
                                class="text-[8px] text-[#555] uppercase tracking-widest"
                                >Ending Pattern</label
                            >
                            <input
                                type="text"
                                bind:value={suffixPattern}
                                placeholder="End e.g. 777"
                                class="w-full bg-black border border-[#333] p-3 text-xl focus:border-[#9ae600] outline-none transition-colors"
                                disabled={isGenerating}
                            />
                        </div>
                    {/if}
                </div>

                <div class="flex flex-col justify-start gap-4 pt-1">
                    <label class="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            bind:checked={isCaseSensitive}
                            class="hidden"
                            disabled={isGenerating}
                        />
                        <div
                            class="w-5 h-5 border border-[#333] flex items-center justify-center {isCaseSensitive
                                ? 'bg-[#9ae600]'
                                : 'bg-black'} transition-colors"
                        >
                            {#if isCaseSensitive}
                                <span class="text-black text-xs">✓</span>
                            {/if}
                        </div>
                        <span
                            class="text-xs uppercase tracking-widest group-hover:text-white transition-colors"
                            >Case Sensitive</span
                        >
                    </label>
                </div>
            </div>
        {/if}
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-5 gap-3 text-center">
        <div class="bg-[#111] border border-[#333] p-3 rounded-lg">
            <div class="text-[8px] text-[#555] mb-1">ATTEMPTS</div>
            <div class="text-lg">{attempts.toLocaleString()}</div>
        </div>
        <div class="bg-[#111] border border-[#333] p-3 rounded-lg">
            <div class="text-[8px] text-[#555] mb-1">TIME</div>
            <div class="text-lg">{elapsedTime}s</div>
        </div>
        <div class="bg-[#111] border border-[#333] p-3 rounded-lg">
            <div class="text-[8px] text-[#555] mb-1">PER/SEC</div>
            <div class="text-lg">
                {elapsedTime > 0
                    ? Math.floor(attempts / elapsedTime).toLocaleString()
                    : 0}
            </div>
        </div>
        <div class="bg-[#111] border border-[#333] p-3 rounded-lg">
            <div class="text-[8px] text-[#555] mb-1">DIFFICULTY</div>
            <div class="text-lg" style="color: {difficultyInfo.color}">
                {difficultyInfo.label}
            </div>
        </div>
        <div class="bg-[#111] border border-[#333] p-3 rounded-lg">
            <div class="text-[8px] text-[#555] mb-1">ETA</div>
            <div class="text-lg" style="color: {difficultyInfo.color}">
                {etaDisplay}
            </div>
        </div>
    </div>

    <!-- Best Match (during long searches) -->
    {#if isGenerating && bestMatch && bestMatchScore > 0}
        <div
            class="bg-[#111] border border-[#f0c020]/40 px-4 py-3 rounded-lg animate-in fade-in"
        >
            <div class="flex justify-between items-center mb-1">
                <span
                    class="text-[8px] text-[#f0c020] uppercase tracking-widest"
                    >Best Match So Far</span
                >
                <span
                    class="text-[8px] bg-[#f0c020]/20 text-[#f0c020] px-2 py-0.5 rounded"
                    >{bestMatchScore}/{prefixPattern.length} chars</span
                >
            </div>
            <code class="text-xs break-all text-[#f0c020]/80">{bestMatch}</code>
        </div>
    {/if}

    <!-- Action -->
    <div class="flex justify-center">
        {#if isGenerating}
            <button
                onclick={stop}
                class="bg-[#ff424c]/10 border border-[#ff424c] text-[#ff424c] px-12 py-4 rounded-lg hover:bg-[#ff424c] hover:text-white transition-all animate-pulse z-20"
            >
                ABORT SCAN
            </button>
        {:else}
            <button
                onclick={mode === "G" ? generateG : generateC}
                disabled={matchMode !== "MASK" &&
                    (!prefixPattern ||
                        (matchMode === "SPLIT" && !suffixPattern))}
                class="bg-[#9ae600]/10 border border-[#9ae600] text-[#9ae600] px-12 py-4 rounded-lg hover:bg-[#9ae600] hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
                START BRUTE-FORCE
            </button>
        {/if}
    </div>

    <!-- Results -->
    {#if resultG || resultC}
        <div
            class="bg-[#111] border-2 border-[#9ae600] p-6 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-4 duration-500"
        >
            <div class="flex items-center justify-between">
                <h2 class="text-xl text-white uppercase">
                    Frequency Match Acquired
                </h2>
                <span
                    class="text-[8px] bg-[#9ae600] text-black px-2 py-1 rounded"
                    >IDENTIFIED</span
                >
            </div>

            {#if resultG}
                <div class="space-y-4">
                    <div class="space-y-1">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                            >Public Address (G)</label
                        >
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 bg-black p-3 break-all text-sm border border-[#333]"
                                >{resultG.address}</code
                            >
                            <button
                                onclick={() =>
                                    copyToClipboard(resultG!.address)}
                                class="p-3 border border-[#333] hover:border-[#9ae600] transition-colors"
                                >📋</button
                            >
                        </div>
                    </div>
                    <div class="space-y-1">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                            >Secret Key (S)</label
                        >
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 bg-black p-3 break-all text-sm border border-[#333] text-[#ff424c] blur-sm hover:blur-none transition-all"
                                >{resultG.secret}</code
                            >
                            <button
                                onclick={() => copyToClipboard(resultG!.secret)}
                                class="p-3 border border-[#333] hover:border-[#ff424c] transition-colors"
                                >📋</button
                            >
                        </div>
                    </div>
                </div>
            {:else if resultC}
                <div class="space-y-4">
                    <div class="space-y-1">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                            >Contract ID (C)</label
                        >
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 bg-black p-3 break-all text-sm border border-[#333]"
                                >{resultC.contractId}</code
                            >
                            <button
                                onclick={() =>
                                    copyToClipboard(resultC!.contractId)}
                                class="p-3 border border-[#333] hover:border-[#9ae600] transition-colors"
                                >📋</button
                            >
                        </div>
                    </div>
                    <div class="space-y-1">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                            >Deployment Salt (Hex)</label
                        >
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 bg-black p-3 break-all text-sm border border-[#333]"
                                >{resultC.salt}</code
                            >
                            <button
                                onclick={() => copyToClipboard(resultC!.salt)}
                                class="p-3 border border-[#333] hover:border-[#9ae600] transition-colors"
                                >📋</button
                            >
                        </div>
                        <p class="text-[8px] text-[#555]">
                            Use this salt when deploying from {deployerAddress.substring(
                                0,
                                8,
                            )}...{deployerAddress.substring(52)} on {NETWORKS[
                                selectedNetwork
                            ].name}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <label
                            class="text-[8px] text-[#555] uppercase tracking-widest"
                            >Deploy Command</label
                        >
                        <div class="flex items-center gap-2">
                            <code
                                class="flex-1 bg-black p-3 break-all text-[10px] border border-[#333] text-[#9ae600]/70"
                                >stellar contract deploy --wasm
                                YOUR_CONTRACT.wasm --salt {resultC.salt} --source
                                YOUR_KEY --network {selectedNetwork}</code
                            >
                            <button
                                onclick={() =>
                                    copyToClipboard(
                                        `stellar contract deploy --wasm YOUR_CONTRACT.wasm --salt ${resultC!.salt} --source YOUR_KEY --network ${selectedNetwork}`,
                                    )}
                                class="p-3 border border-[#333] hover:border-[#9ae600] transition-colors"
                                >📋</button
                            >
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    <!-- Session History -->
    {#if history.length > 0}
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <span class="text-[8px] text-[#555] uppercase tracking-widest"
                    >Session History ({history.length})</span
                >
                <button
                    onclick={() => (history = [])}
                    class="text-[8px] text-[#ff424c] hover:underline uppercase tracking-tighter"
                    >Clear</button
                >
            </div>
            {#each history as entry, i}
                <div
                    class="bg-[#111] border border-[#222] px-3 py-2 rounded flex justify-between items-center gap-3"
                >
                    <div class="flex-1 min-w-0">
                        <span
                            class="text-[8px] {entry.type === 'G'
                                ? 'text-[#9ae600]'
                                : 'text-[#00bfff]'} uppercase"
                            >{entry.type}-{entry.type === "C" && entry.network
                                ? entry.network.toUpperCase()
                                : "ADDR"}</span
                        >
                        <code
                            class="text-[10px] block truncate text-[#666] mt-0.5"
                            >{entry.address}</code
                        >
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[8px] text-[#333]"
                            >{entry.attempts.toLocaleString()} / {entry.time}s</span
                        >
                        <button
                            onclick={() => copyToClipboard(entry.address)}
                            class="text-[10px] p-1 border border-[#222] hover:border-[#9ae600] transition-colors"
                            >📋</button
                        >
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Copy Toast -->
    {#if copyToast}
        <div
            class="fixed bottom-6 right-6 bg-[#9ae600] text-black px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest animate-in fade-in slide-in-from-bottom-2 z-50"
        >
            ✓ {copyToast}
        </div>
    {/if}
</div>

<style>
    @keyframes shimmer {
        0% {
            opacity: 0.5;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0.5;
        }
    }
</style>
