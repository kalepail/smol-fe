<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols, fetchLikedSmols } from "../../services/api/smols";
    import { getSongUrl } from "../../utils/apiUrl";
    import confetti from "canvas-confetti";
    import LikeButton from "../../components/ui/LikeButton.svelte";

    // ======================
    // TYPES & INTERFACES
    // ======================

    interface Note {
        id: string;
        lane: number; // 0=bass, 1=mid, 2=treble
        spawnTime: number; // When note was created
        hitTime: number; // When note should be hit
        position: number; // 0-100, position down the lane
        hit: boolean;
        accuracy: "perfect" | "great" | "ok" | "miss" | null;
    }

    interface CachedOnset {
        lane: number;
        time: number; // Time in seconds when onset occurs
    }

    interface Beatmap {
        trackId: string;
        difficulty: string;
        onsets: CachedOnset[];
    }

    interface GameSettings {
        difficulty: "easy" | "medium" | "hard" | "expert";
        noteSpeed: number; // pixels per second
        laneCount: 3;
        calibrationOffset: number; // ms
    }

    interface Stats {
        perfect: number;
        great: number;
        ok: number;
        miss: number;
        combo: number;
        maxCombo: number;
        score: number;
    }

    // ======================
    // PROPS
    // ======================

    interface Props {
        smols?: any[];
        fetchOnMount?: boolean;
    }

    let { smols = [], fetchOnMount = true }: Props = $props();

    // ======================
    // STATE
    // ======================

    let gameState = $state<
        "menu" | "analyzing" | "calibrating" | "playing" | "paused" | "finished"
    >("menu");
    let currentTrack = $state<any | null>(null);
    let playableTracks = $state<any[]>([]); // The currently displayed/filtered list
    let allTracks = $state<any[]>([]); // All tracks in memory
    let likedTrackIds = $state<Set<string>>(new Set());
    let loading = $state(false);

    // Filters & Sorts
    let searchQuery = $state("");
    let filterLikedOnly = $state(false);
    let sortMode = $state<"latest" | "artist" | "liked">("latest");
    let visibleLimit = $state(50);
    let filteredTracksCount = $state(0);

    // Pre-analysis for iOS support
    let isIOS = $state(false);
    let usePreAnalysis = $state(true); // Default to True (Sync Mode) for best quality
    let analyzingProgress = $state(0); // 0-100
    let cachedBeatmap = $state<Beatmap | null>(null);
    let beatmapCache = new Map<string, Beatmap>(); // Cache beatmaps by trackId-difficulty

    // Audio
    let audio: HTMLAudioElement | null = null;
    let audioContext: AudioContext | any = null; // Use any to allow webkitAudioContext
    let analyser: AnalyserNode | null = null;
    let gainNode: GainNode | null = null;
    let cachedDecodedBuffer: AudioBuffer | null = null; // Cache for pause menu

    // Frequency band filters for 3-lane detection
    let bassFilter: BiquadFilterNode | null = null;
    let midFilter: BiquadFilterNode | null = null;
    let trebleFilter: BiquadFilterNode | null = null;

    let bassAnalyser: AnalyserNode | null = null;
    let midAnalyser: AnalyserNode | null = null;
    let trebleAnalyser: AnalyserNode | null = null;

    // Game state
    let settings = $state<GameSettings>({
        difficulty: "medium",
        noteSpeed: 400, // pixels per second
        laneCount: 3,
        calibrationOffset: 0,
    });

    let notes = $state<Note[]>([]);
    let stats = $state<Stats>({
        perfect: 0,
        great: 0,
        ok: 0,
        miss: 0,
        combo: 0,
        maxCombo: 0,
        score: 0,
    });

    // Beat detection state
    let isAnalyzing = $state(false);
    let animationFrameId: number | null = null;
    let gameStartTime = 0;
    let lastOnsetTimes = [0, 0, 0]; // Last onset time per lane
    let energyHistory: number[][] = [[], [], []]; // Energy history per lane
    const ENERGY_HISTORY_SIZE = 43; // ~1 second at 60fps

    // Difficulty-based onset sensitivity
    let onsetThresholdMultiplier = $derived.by(() => {
        switch (settings.difficulty) {
            case "easy":
                return 2.5; // Stricter
            case "medium":
                return 2.0;
            case "hard":
                return 1.6;
            case "expert":
                return 1.3;
            default:
                return 2.0;
        }
    });

    // Visual
    let laneHeight = 600;
    let hitZoneY = 500; // Y position of hit zone
    let noteSize = 40;

    // Timing constants (in ms)
    const PERFECT_WINDOW = 50;
    const GREAT_WINDOW = 100;
    const OK_WINDOW = 150;
    const NOTE_SPAWN_LEAD_TIME = 2000; // 2 seconds before hit
    const MISS_THRESHOLD = 200; // If note passes hit zone by this much, it's a miss

    // Key bindings
    const LANE_KEYS = ["d", "f", "j"]; // Keys for lanes 0, 1, 2
    const LANE_COLORS = [
        { hex: "#9ae600", rgb: "154, 230, 0" }, // Green
        { hex: "#b026ff", rgb: "176, 38, 255" }, // Purple
        { hex: "#ff7700", rgb: "255, 119, 0" }, // Orange
    ];
    let pressedKeys = new Set<string>();
    let pressedLanes = $state<boolean[]>([false, false, false]); // Visual feedback for pressed lanes
    let hitFeedback = $state<
        { text: string; lane: number; timestamp: number }[]
    >([]); // Hit feedback text
    let hitEffects = $state<
        { id: string; lane: number; timestamp: number; color: string }[]
    >([]); // Visual hit particles

    // ======================
    // BEAT DETECTION CORE
    // ======================

    function initAudioAnalysis() {
        if (!audio) return;

        try {
            const Ctx =
                window.AudioContext || (window as any).webkitAudioContext;
            audioContext = new Ctx();
            const source = audioContext.createMediaElementSource(audio);

            // Main gain node
            gainNode = audioContext.createGain();
            gainNode.gain.value = 1.0;

            // Create frequency band filters
            // BASS: 20-200 Hz
            bassFilter = audioContext.createBiquadFilter();
            bassFilter.type = "lowpass";
            bassFilter.frequency.value = 200;
            bassFilter.Q.value = 0.7;

            bassAnalyser = audioContext.createAnalyser();
            bassAnalyser.fftSize = 512;
            bassAnalyser.smoothingTimeConstant = 0.3;

            // MID: 200-2000 Hz (bandpass)
            midFilter = audioContext.createBiquadFilter();
            midFilter.type = "bandpass";
            midFilter.frequency.value = 1000;
            midFilter.Q.value = 0.7;

            midAnalyser = audioContext.createAnalyser();
            midAnalyser.fftSize = 512;
            midAnalyser.smoothingTimeConstant = 0.3;

            // TREBLE: 2000+ Hz
            trebleFilter = audioContext.createBiquadFilter();
            trebleFilter.type = "highpass";
            trebleFilter.frequency.value = 2000;
            trebleFilter.Q.value = 0.7;

            trebleAnalyser = audioContext.createAnalyser();
            trebleAnalyser.fftSize = 512;
            trebleAnalyser.smoothingTimeConstant = 0.3;

            // Connect audio graph
            source.connect(bassFilter);
            bassFilter.connect(bassAnalyser);

            source.connect(midFilter);
            midFilter.connect(midAnalyser);

            source.connect(trebleFilter);
            trebleFilter.connect(trebleAnalyser);

            // Also connect to output
            source.connect(gainNode);
            gainNode.connect(audioContext.destination);

            console.log("[SmolHero] Audio analysis initialized");
        } catch (e) {
            console.error("[SmolHero] Failed to init audio analysis:", e);
        }
    }

    // Track which cached onsets we've already spawned
    let spawnedCachedOnsets = new Set<number>();

    function detectOnsetsFromCache(currentTime: number) {
        if (!cachedBeatmap) return;

        // Spawn notes that should appear soon (within spawn lead time)
        const spawnWindow = NOTE_SPAWN_LEAD_TIME / 1000; // Convert to seconds

        cachedBeatmap.onsets.forEach((onset, index) => {
            // Skip if already spawned
            if (spawnedCachedOnsets.has(index)) return;

            // Check if we should spawn this note now
            // onset.time is when the note should be HIT
            // We spawn it spawnWindow seconds BEFORE it needs to be hit
            const shouldSpawnAt = onset.time - spawnWindow;

            // Spawn if current time has passed the spawn point, but note hasn't been spawned yet
            if (currentTime >= shouldSpawnAt && currentTime < onset.time) {
                // Apply difficulty filtering
                if (settings.difficulty === "easy" && onset.lane !== 0) {
                    spawnedCachedOnsets.add(index);
                    return;
                }
                if (settings.difficulty === "medium" && onset.lane === 2) {
                    spawnedCachedOnsets.add(index);
                    return;
                }

                // Create note directly with correct hit time
                const note: Note = {
                    id: `cached-${onset.lane}-${onset.time}-${index}`,
                    lane: onset.lane,
                    spawnTime: currentTime,
                    hitTime: onset.time,
                    position: 0,
                    hit: false,
                    accuracy: null,
                };
                notes = [...notes, note];
                spawnedCachedOnsets.add(index);
            }
        });
    }

    function detectOnsets() {
        if (!bassAnalyser || !midAnalyser || !trebleAnalyser) return;

        const analysers = [bassAnalyser, midAnalyser, trebleAnalyser];
        const currentTime = audio?.currentTime || 0;

        analysers.forEach((analyser, lane) => {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            // Calculate RMS energy
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / bufferLength);

            // Add to history
            energyHistory[lane].push(rms);
            if (energyHistory[lane].length > ENERGY_HISTORY_SIZE) {
                energyHistory[lane].shift();
            }

            // Need enough history for detection
            if (energyHistory[lane].length < ENERGY_HISTORY_SIZE) return;

            // Calculate average energy
            const avgEnergy =
                energyHistory[lane].reduce((a, b) => a + b, 0) /
                energyHistory[lane].length;

            // Detect onset: current energy significantly above average
            const threshold = avgEnergy * onsetThresholdMultiplier;
            const minTimeBetweenOnsets = 0.1; // 100ms minimum between onsets in same lane

            if (
                rms > threshold &&
                currentTime - lastOnsetTimes[lane] > minTimeBetweenOnsets
            ) {
                // ONSET DETECTED!
                spawnNote(lane, currentTime);
                lastOnsetTimes[lane] = currentTime;
            }
        });
    }

    function spawnNote(lane: number, detectionTime: number) {
        // Apply difficulty filtering
        if (settings.difficulty === "easy" && lane !== 0) return; // Bass only
        if (settings.difficulty === "medium" && lane === 2) return; // Bass + Mid only

        const hitTime = detectionTime + NOTE_SPAWN_LEAD_TIME / 1000; // Convert ms to seconds

        const note: Note = {
            id: `${lane}-${detectionTime}-${Math.random()}`,
            lane,
            spawnTime: detectionTime,
            hitTime,
            position: 0,
            hit: false,
            accuracy: null,
        };

        notes = [...notes, note];
    }

    // ======================
    // GAME LOOP
    // ======================

    function gameLoop() {
        if (gameState !== "playing" || !audio) {
            return;
        }

        const currentTime = audio.currentTime;

        // Detect new onsets (real-time or from cache)
        if (cachedBeatmap) {
            detectOnsetsFromCache(currentTime);
        } else {
            detectOnsets();
        }

        // Update note positions
        notes = notes.map((note) => {
            if (note.hit) return note;

            // Calculate position based on time until hit
            // Calculate raw position first
            const timeUntilHit = note.hitTime - currentTime;
            const progress = 1 - timeUntilHit / (NOTE_SPAWN_LEAD_TIME / 1000);
            const rawPosition = progress * 100;
            const newPosition = Math.max(0, Math.min(100, rawPosition));

            // Check if note passed hit zone (miss)
            // allow a small buffer (110%) before counting as miss to allow late hits
            if (rawPosition > 110 && !note.hit && !note.accuracy) {
                handleMiss(note);
                return { ...note, accuracy: "miss", position: newPosition };
            }

            return { ...note, position: newPosition };
        });

        // Clean up old notes
        notes = notes.filter((note) => {
            const timeSinceHit = currentTime - note.hitTime;
            return timeSinceHit < 2; // Keep for 2 seconds after hit time
        });

        // Clean up old hit feedback
        const now = Date.now();
        hitFeedback = hitFeedback.filter((f) => now - f.timestamp < 1000); // Keep for 1 second
        hitEffects = hitEffects.filter((e) => now - e.timestamp < 500); // Keep particles for 500ms

        // Continue loop
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // ======================
    // INPUT HANDLING
    // ======================

    function handleInputStart(laneIndex: number) {
        if (gameState !== "playing") return;

        // Visual feedback
        pressedLanes[laneIndex] = true;

        // Find closest unhit note in this lane
        const currentTime = audio?.currentTime || 0;
        const laneNotes = notes
            .filter((n) => n.lane === laneIndex && !n.hit)
            .sort(
                (a, b) =>
                    Math.abs(a.hitTime - currentTime) -
                    Math.abs(b.hitTime - currentTime),
            );

        if (laneNotes.length === 0) return;

        const note = laneNotes[0];
        const timeDiff = Math.abs((note.hitTime - currentTime) * 1000); // Convert to ms

        let accuracy: "perfect" | "great" | "ok" | "miss";

        if (timeDiff <= PERFECT_WINDOW) {
            accuracy = "perfect";
            handleHit(note, accuracy);
        } else if (timeDiff <= GREAT_WINDOW) {
            accuracy = "great";
            handleHit(note, accuracy);
        } else if (timeDiff <= OK_WINDOW) {
            accuracy = "ok";
            handleHit(note, accuracy);
        }
    }

    function handleInputEnd(laneIndex: number) {
        pressedLanes[laneIndex] = false;
    }

    function handleKeyDown(e: KeyboardEvent) {
        // ESC to toggle pause
        if (
            e.key === "Escape" &&
            (gameState === "playing" || gameState === "paused")
        ) {
            togglePause();
            return;
        }

        if (gameState !== "playing") return;

        const key = e.key.toLowerCase();
        if (pressedKeys.has(key)) return; // Prevent key repeat
        pressedKeys.add(key);

        const laneIndex = LANE_KEYS.indexOf(key);
        if (laneIndex === -1) return;

        handleInputStart(laneIndex);
    }

    function handleKeyUp(e: KeyboardEvent) {
        const key = e.key.toLowerCase();
        pressedKeys.delete(key);

        const laneIndex = LANE_KEYS.indexOf(key);
        if (laneIndex !== -1) {
            handleInputEnd(laneIndex);
        }
    }

    function handleHit(note: Note, accuracy: "perfect" | "great" | "ok") {
        note.hit = true;
        note.accuracy = accuracy;

        // Update stats
        stats[accuracy]++;
        stats.combo++;
        if (stats.combo > stats.maxCombo) {
            stats.maxCombo = stats.combo;
        }

        // Calculate score
        const baseScore =
            accuracy === "perfect" ? 300 : accuracy === "great" ? 200 : 100;
        const comboMultiplier = 1 + stats.combo / 10;
        stats.score += Math.floor(baseScore * comboMultiplier);

        // Add hit feedback text
        const feedbackText =
            accuracy === "perfect"
                ? "PERFECT!"
                : accuracy === "great"
                  ? "GREAT!"
                  : "OK";
        hitFeedback = [
            ...hitFeedback,
            {
                text: feedbackText,
                lane: note.lane,
                timestamp: Date.now(),
            },
        ];

        // Add visual hit effect
        if (accuracy !== "miss") {
            hitEffects = [
                ...hitEffects,
                {
                    id: Math.random().toString(),
                    lane: note.lane,
                    timestamp: Date.now(),
                    color:
                        accuracy === "perfect"
                            ? "#9ae600"
                            : accuracy === "great"
                              ? "#FDDA24"
                              : "#f91880",
                },
            ];
        }

        // Visual feedback
        if (accuracy === "perfect") {
            if (stats.combo % 10 === 0 && stats.combo > 0) {
                // Confetti on combo milestones
                confetti({
                    particleCount: 20,
                    spread: 40,
                    origin: { y: 0.8, x: 0.3 + note.lane * 0.2 },
                    colors: ["#9ae600", "#f91880", "#FDDA24"],
                });
            }
        }
    }

    function handleMiss(note: Note) {
        stats.miss++;
        stats.combo = 0; // Break combo

        // Add miss feedback
        hitFeedback = [
            ...hitFeedback,
            {
                text: "MISS",
                lane: note.lane,
                timestamp: Date.now(),
            },
        ];
    }

    // ======================
    // TRACK SELECTION
    // ======================

    async function loadTracks() {
        loading = true;
        try {
            // Parallel fetch: All Smols + User Likes
            const [smolsData, likes] = await Promise.all([
                fetchOnMount
                    ? safeFetchSmols({ limit: 5000 })
                    : Promise.resolve(smols),
                fetchLikedSmols(),
            ]);

            smols = smolsData;
            likedTrackIds = new Set(likes);
            allTracks = smols.filter((s) => s.Song_1); // Only playable songs

            applyFilters();
            loading = false;
        } catch (e) {
            console.error("[SmolHero] Failed to load tracks:", e);
            loading = false;
        }
    }

    function applyFilters() {
        let filtered = [...allTracks];

        // 1. Text Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (t) =>
                    (t.Title || "").toLowerCase().includes(q) ||
                    (t.Creator || "").toLowerCase().includes(q) ||
                    (t.Address || "").toLowerCase().includes(q) ||
                    (t.Minted_By || "").toLowerCase().includes(q),
            );
        }

        // 2. Liked Filter
        if (filterLikedOnly) {
            filtered = filtered.filter((t) => likedTrackIds.has(t.Id));
        }

        // 3. Sorting
        filtered.sort((a, b) => {
            if (sortMode === "latest") {
                // Assuming newer IDs are higher? Or just index.
                // Let's rely on original order (often latest first) or simple ID compare if numeric strings
                return b.Id.localeCompare(a.Id);
            }
            if (sortMode === "artist") {
                const nameA = (
                    a.Creator ||
                    a.Address ||
                    "Unknown"
                ).toLowerCase();
                const nameB = (
                    b.Creator ||
                    b.Address ||
                    "Unknown"
                ).toLowerCase();
                return nameA.localeCompare(nameB);
            }
            if (sortMode === "liked") {
                const aLiked = likedTrackIds.has(a.Id);
                const bLiked = likedTrackIds.has(b.Id);
                // Liked first
                return (bLiked ? 1 : 0) - (aLiked ? 1 : 0);
            }
            return 0;
        });

        // Limit display for performance if search is empty
        // logic: if user is searching/filtering, show all matches. If raw list, cap at 100?
        // Actually, virtual scrolling is hard in simple svelte loop. Let's cap at 100 for now.
        // playableTracks = filtered.slice(0, 100);
        // User asked for "pick all songs".
        filteredTracksCount = filtered.length;
        playableTracks = filtered.slice(0, visibleLimit);
    }

    // Reset visible limit when filters change
    $effect(() => {
        const _q = searchQuery;
        const _l = filterLikedOnly;
        const _s = sortMode;
        visibleLimit = 50; // Reset pagination on filter change
    });

    // React to filter changes
    $effect(() => {
        // We reference these so the effect re-runs when they change
        const _q = searchQuery;
        const _l = filterLikedOnly;
        const _s = sortMode;
        // Don't run initially if empty to avoid double-set, but filteredTracks needs init.
        if (allTracks.length > 0) applyFilters();
    });

    async function analyzeTrack(
        track: any,
        existingBuffer: AudioBuffer | null = null,
    ): Promise<Beatmap> {
        gameState = "analyzing";
        analyzingProgress = 0;

        return new Promise(async (resolve, reject) => {
            try {
                let audioBuffer: AudioBuffer;

                if (existingBuffer) {
                    console.log(
                        "[SmolHero] Using cached buffer for analysis...",
                    );
                    audioBuffer = existingBuffer;
                    analyzingProgress = 40;
                } else {
                    // 1. Fetch and Decode Audio (Offline)
                    console.log("[SmolHero] Fetching audio for analysis...");
                    const response = await fetch(getSongUrl(track.Song_1));
                    if (!response.ok)
                        throw new Error(`Fetch failed: ${response.status}`);

                    const arrayBuffer = await response.arrayBuffer();
                    analyzingProgress = 20;

                    const Ctx =
                        window.AudioContext ||
                        (window as any).webkitAudioContext;
                    const tempCtx = new Ctx();
                    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
                    cachedDecodedBuffer = audioBuffer; // Cache for pause menu
                    analyzingProgress = 40;
                    tempCtx.close();
                }

                // 2. Render 3 distinct frequency bands using OfflineAudioContext
                // We map: Channel 0 = Bass, Channel 1 = Mid, Channel 2 = Treble
                const OfflineCtx =
                    window.OfflineAudioContext ||
                    (window as any).webkitOfflineAudioContext;
                const offlineCtx = new OfflineCtx(
                    3,
                    audioBuffer.length,
                    audioBuffer.sampleRate,
                );

                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;

                const bassFilter = offlineCtx.createBiquadFilter();
                bassFilter.type = "lowpass";
                bassFilter.frequency.value = 150; // Tuned for kick drums
                bassFilter.Q.value = 1.0;

                // Mid Path
                const midFilter = offlineCtx.createBiquadFilter();
                midFilter.type = "bandpass";
                midFilter.frequency.value = 1000;
                midFilter.Q.value = 1.0; // Wider band

                // Treble Path
                const trebleFilter = offlineCtx.createBiquadFilter();
                trebleFilter.type = "highpass";
                trebleFilter.frequency.value = 3000; // Tuned for crisp hats
                trebleFilter.Q.value = 1.0;

                // Merger (3 channels)
                const merger = offlineCtx.createChannelMerger(3);

                source.connect(bassFilter);
                bassFilter.connect(merger, 0, 0); // Connect to input 0 of merger (Bass -> Ch 0)

                source.connect(midFilter);
                midFilter.connect(merger, 0, 1); // Connect to input 1 of merger (Mid -> Ch 1)

                source.connect(trebleFilter);
                trebleFilter.connect(merger, 0, 2); // Connect to input 2 of merger (Treble -> Ch 2)

                merger.connect(offlineCtx.destination);

                source.start(0);

                console.log("[SmolHero] Rendering spectral bands...");
                const renderedBuffer = await offlineCtx.startRendering();
                analyzingProgress = 70;

                // 3. Analyze the rendered bands
                console.log("[SmolHero] Detecting beats...");
                const detectedOnsets: CachedOnset[] = [];
                const sampleRate = renderedBuffer.sampleRate;
                const windowSize = Math.floor(sampleRate / 60); // ~60fps windows

                // Detection State per lane
                // Detection State per lane
                const lastOnsetTimes = [0, 0, 0];
                const energyHistory: number[][] = [[], [], []];

                // Peak Centering Sate
                const laneState = [
                    {
                        isTracking: false,
                        peakRMS: 0,
                        peakTime: 0,
                        startTime: 0,
                    },
                    {
                        isTracking: false,
                        peakRMS: 0,
                        peakTime: 0,
                        startTime: 0,
                    },
                    {
                        isTracking: false,
                        peakRMS: 0,
                        peakTime: 0,
                        startTime: 0,
                    },
                ];
                const PEAK_WINDOW = 0.05; // 50ms window to find the peak

                // Process each "frame"
                for (let i = 0; i < renderedBuffer.length; i += windowSize) {
                    const currentTime = i / sampleRate;

                    for (let lane = 0; lane < 3; lane++) {
                        const channelData = renderedBuffer.getChannelData(lane);

                        // Calculate RMS
                        let sum = 0;
                        const end = Math.min(
                            i + windowSize,
                            renderedBuffer.length,
                        );
                        for (let j = i; j < end; j++) {
                            sum += channelData[j] * channelData[j];
                        }
                        const rms = Math.sqrt(sum / (end - i));

                        // Rolling History
                        energyHistory[lane].push(rms);
                        if (energyHistory[lane].length > ENERGY_HISTORY_SIZE) {
                            energyHistory[lane].shift();
                        }

                        if (energyHistory[lane].length < ENERGY_HISTORY_SIZE)
                            continue;

                        const avgEnergy =
                            energyHistory[lane].reduce((a, b) => a + b, 0) /
                            energyHistory[lane].length;
                        const threshold = avgEnergy * onsetThresholdMultiplier;

                        // -- DENSITY CONTROL --
                        let minSpacing = 0.15; // Default (Expert)
                        if (settings.difficulty === "easy") minSpacing = 0.4;
                        if (settings.difficulty === "medium") minSpacing = 0.3;
                        if (settings.difficulty === "hard") minSpacing = 0.2;

                        // -- PEAK CENTERING LOGIC --
                        const state = laneState[lane];

                        if (state.isTracking) {
                            // If we are tracking a peak, check if this is a new max
                            if (rms > state.peakRMS) {
                                state.peakRMS = rms;
                                state.peakTime = currentTime;
                            }

                            // If window expired or energy dropped significantly, commit the note
                            if (
                                currentTime - state.startTime > PEAK_WINDOW ||
                                rms < state.peakRMS * 0.5
                            ) {
                                // Only add if we respect the density spacing
                                if (
                                    state.peakTime - lastOnsetTimes[lane] >
                                    minSpacing
                                ) {
                                    detectedOnsets.push({
                                        lane,
                                        time: state.peakTime,
                                    });
                                    lastOnsetTimes[lane] = state.peakTime;
                                }

                                // Reset and cooldown
                                state.isTracking = false;
                                state.peakRMS = 0;
                            }
                        } else {
                            // Start tracking if over threshold, cooldown passed, AND over absolute floor
                            if (
                                rms > threshold &&
                                currentTime - lastOnsetTimes[lane] >
                                    minSpacing &&
                                rms > 0.01 // Noise floor
                            ) {
                                state.isTracking = true;
                                state.startTime = currentTime;
                                state.peakRMS = rms;
                                state.peakTime = currentTime;
                            }
                        }
                    }

                    // Update UI every ~1 second of audio processed (approx)
                    if (i % (sampleRate * 2) === 0) {
                        const progress =
                            70 + Math.floor((i / renderedBuffer.length) * 30);
                        analyzingProgress = progress;
                    }
                }

                analyzingProgress = 100;

                const beatmap: Beatmap = {
                    trackId: track.Song_1,
                    difficulty: settings.difficulty,
                    onsets: detectedOnsets.sort((a, b) => a.time - b.time),
                };

                beatmapCache.set(
                    `${track.Song_1}-${settings.difficulty}`,
                    beatmap,
                );
                resolve(beatmap);
            } catch (e: any) {
                console.error("[SmolHero] Offline Analysis Failed:", e);
                reject(new Error(e.message || "Analysis failed"));
            }
        });
    }

    async function selectTrack(track: any) {
        currentTrack = track;

        // Check if we need pre-analysis
        if (usePreAnalysis) {
            const cacheKey = `${track.Song_1}-${settings.difficulty}`;
            let beatmap = beatmapCache.get(cacheKey);

            if (!beatmap) {
                try {
                    console.log(
                        `[SmolHero] Starting pre-analysis for ${track.Title}...`,
                    );
                    beatmap = await analyzeTrack(track);
                } catch (e: any) {
                    console.error("[SmolHero] Pre-analysis failed:", e);
                    const errorMsg = e?.message || "Unknown error";
                    alert(
                        `Failed to analyze track:\n${errorMsg}\n\nTry:\n- Tap to play the track\n- Check your network connection\n- Try a different track`,
                    );
                    gameState = "menu";
                    currentTrack = null;
                    return;
                }
            } else {
                console.log(
                    `[SmolHero] Using cached beatmap for ${track.Title}`,
                );
            }

            cachedBeatmap = beatmap;
        } else {
            // Real-time mode reset
            cachedBeatmap = null;
        }

        gameState = "playing";
        startGame();
    }

    function startGame() {
        if (!currentTrack) return;

        // Reset state
        notes = [];
        stats = {
            perfect: 0,
            great: 0,
            ok: 0,
            miss: 0,
            combo: 0,
            maxCombo: 0,
            score: 0,
        };
        energyHistory = [[], [], []];
        lastOnsetTimes = [0, 0, 0];
        spawnedCachedOnsets.clear(); // Reset cached onset tracking

        // Create and setup audio
        audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.src = `${import.meta.env.PUBLIC_API_URL}/song/${currentTrack.Song_1}.mp3`;
        audio.volume = 0.7;

        // Init analysis (only if not using pre-computed beatmap)
        if (!cachedBeatmap) {
            initAudioAnalysis();
        }

        // Start playback
        audio
            .play()
            .then(() => {
                gameStartTime = Date.now();
                isAnalyzing = true;

                if (cachedBeatmap) {
                    console.log(
                        `[SmolHero] Starting game with cached beatmap (${cachedBeatmap.onsets.length} onsets)`,
                    );
                } else {
                    console.log(
                        "[SmolHero] Starting game with real-time beat detection",
                    );
                }

                gameLoop();
            })
            .catch((e) => {
                console.error("[SmolHero] Playback failed:", e);
            });

        // Handle track end
        audio.onended = () => {
            finishGame();
        };
    }

    function finishGame() {
        gameState = "finished";
        isAnalyzing = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        // Epic confetti if good score
        const totalNotes = stats.perfect + stats.great + stats.ok + stats.miss;
        const accuracy =
            totalNotes > 0
                ? ((stats.perfect + stats.great) / totalNotes) * 100
                : 0;

        if (accuracy >= 90) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ["#9ae600", "#f91880", "#FDDA24"],
            });
        }
    }

    function togglePause() {
        if (!audio) return;

        if (gameState === "playing") {
            gameState = "paused";
            audio.pause();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        } else if (gameState === "paused") {
            gameState = "playing";
            audio.play();
            gameLoop();
        }
    }

    async function switchDifficulty(diff: GameSettings["difficulty"]) {
        if (settings.difficulty === diff) return;
        settings.difficulty = diff;

        // Re-analyze using cached buffer (fast!)
        // Keep gameState as "analyzing" but we need to stop current "paused" loop?
        // Actually since we are paused, loop is stopped.
        // We set gamestate to analyzing so UI shows spinner? Or just keep paused UI?
        // Let's toggle gameState to "analyzing" so we don't spam Resume.
        const prev = gameState;
        gameState = "analyzing";

        try {
            const newBeatmap = await analyzeTrack(
                currentTrack,
                cachedDecodedBuffer,
            );
            cachedBeatmap = newBeatmap;
            spawnedCachedOnsets.clear(); // Reset spawn tracking
            notes = []; // Clear old difficulty notes

            // Sync notes to current time?
            // The GameLoop does this automatically via detectOnsetsFromCache
            // We just need to ensure existing notes are cleared (done above).

            // Done, go back to paused
            gameState = "paused";
        } catch (e) {
            console.error("Failed to switch difficulty:", e);
            gameState = "paused";
        }
    }

    function returnToMenu() {
        if (audio) {
            audio.pause();
            audio = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        gameState = "menu";
        currentTrack = null;
    }

    // ======================
    // LIFECYCLE
    // ======================

    function getArtistDisplay(track: any) {
        if (!track) return "Unknown Artist";
        if (track.Creator && track.Creator !== "Unknown") return track.Creator;
        const addr = track.Address || track.Minted_By;
        if (addr) {
            if (addr.length > 10) {
                return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
            }
            return addr;
        }
        return "Unknown Artist";
    }

    onMount(() => {
        isIOS =
            /iPhone|iPad|iPod/.test(navigator.userAgent) ||
            (navigator.userAgent.includes("Mac") && "ontouchend" in document);

        // On iOS, force Sync Mode (no option)
        if (isIOS) usePreAnalysis = true;

        loadTracks();
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        if (audio) {
            audio.pause();
        }
        if (audioContext) {
            audioContext.close();
        }
    });
</script>

<!-- ======================
     UI RENDERING
     ====================== -->

<div class="smol-hero-container w-full max-w-4xl mx-auto font-pixel">
    {#if loading}
        <div class="flex items-center justify-center h-96">
            <div class="text-[#9ae600] text-sm animate-pulse">
                LOADING TRACKS...
            </div>
        </div>
    {:else if gameState === "analyzing"}
        <!-- ANALYZING TRACK -->
        <div class="flex flex-col items-center justify-center h-96 gap-6 p-4">
            <div class="text-center">
                <h2 class="text-2xl font-bold text-[#9ae600] mb-2">
                    ANALYZING TRACK
                </h2>
                <p class="text-xs text-[#555]">
                    {currentTrack?.Title || "Unknown Track"}
                </p>
                <p class="text-[10px] text-[#333] mt-1">
                    Detecting beats from audio...
                </p>
            </div>

            <!-- Progress bar -->
            <div class="w-full max-w-md">
                <div
                    class="h-2 bg-[#222] rounded-full overflow-hidden border border-[#333]"
                >
                    <div
                        class="h-full bg-gradient-to-r from-[#9ae600] to-[#f91880] transition-all duration-300"
                        style="width: {analyzingProgress}%"
                    ></div>
                </div>
                <div class="text-center mt-2 text-sm text-[#9ae600] font-mono">
                    {analyzingProgress}%
                </div>
            </div>

            <div class="flex gap-1">
                {#each Array(3) as _, i}
                    <div
                        class="w-2 h-2 bg-[#9ae600] rounded-full animate-bounce"
                        style="animation-delay: {i * 0.2}s"
                    ></div>
                {/each}
            </div>

            {#if isIOS}
                <div class="text-center space-y-2">
                    <p class="text-[10px] text-[#555] max-w-xs">
                        📱 iOS Pre-Analysis Mode
                    </p>
                    <p class="text-[8px] text-[#333] max-w-xs">
                        This process takes ~15-30 seconds.<br />
                        Audio is being analyzed silently.
                    </p>
                </div>
            {/if}

            <button
                onclick={() => {
                    gameState = "menu";
                    currentTrack = null;
                }}
                class="mt-4 px-4 py-2 text-xs border border-[#333] rounded bg-black text-[#555] hover:border-[#f91880] hover:text-[#f91880] transition-all"
            >
                Cancel
            </button>
        </div>
    {:else if gameState === "menu"}
        <!-- TRACK SELECTION MENU -->
        <div class="flex flex-col gap-6">
            <div class="text-center border-b border-[#333] pb-6">
                <h1 class="text-4xl font-bold mb-2">
                    <span class="text-[#9ae600]">SMOL</span>
                    <span class="text-white">HERO</span>
                </h1>
                <p class="text-xs text-[#555] uppercase tracking-widest">
                    Rhythm Game • Beat Detection Engine
                </p>
                {#if isIOS}
                    <div
                        class="mt-3 inline-block px-3 py-1 bg-[#9ae600]/10 border border-[#9ae600] rounded text-[10px] text-[#9ae600]"
                    >
                        ✓ iOS COMPATIBLE • Pre-Analysis Mode Active
                    </div>
                {:else}
                    <button
                        onclick={() => (usePreAnalysis = !usePreAnalysis)}
                        class="mt-3 inline-flex items-center gap-2 px-3 py-1 border rounded text-[10px] transition-all {usePreAnalysis
                            ? 'bg-[#9ae600]/10 border-[#9ae600] text-[#9ae600]'
                            : 'bg-[#222] border-[#333] text-[#555] hover:border-[#666]'}"
                    >
                        {usePreAnalysis
                            ? "✓ SYNC MODE (BEST)"
                            : "○ INSTANT START (LAGGY)"}
                    </button>
                    {#if usePreAnalysis}
                        <p class="text-[8px] text-[#555] mt-1">
                            Analyzes track before playing for perfect beat
                            syncing.
                        </p>
                    {/if}
                {/if}
            </div>

            <div class="flex gap-4 justify-center mb-4">
                <button
                    onclick={() => (settings.difficulty = "easy")}
                    class="px-4 py-2 text-xs border rounded {settings.difficulty ===
                    'easy'
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black border-[#333] text-[#555] hover:border-[#9ae600]'}"
                >
                    EASY
                </button>
                <button
                    onclick={() => (settings.difficulty = "medium")}
                    class="px-4 py-2 text-xs border rounded {settings.difficulty ===
                    'medium'
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black border-[#333] text-[#555] hover:border-[#9ae600]'}"
                >
                    MEDIUM
                </button>
                <button
                    onclick={() => (settings.difficulty = "hard")}
                    class="px-4 py-2 text-xs border rounded {settings.difficulty ===
                    'hard'
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black border-[#333] text-[#555] hover:border-[#9ae600]'}"
                >
                    HARD
                </button>
                <button
                    onclick={() => (settings.difficulty = "expert")}
                    class="px-4 py-2 text-xs border rounded {settings.difficulty ===
                    'expert'
                        ? 'bg-[#9ae600] text-black border-[#9ae600]'
                        : 'bg-black border-[#333] text-[#555] hover:border-[#9ae600]'}"
                >
                    EXPERT
                </button>
            </div>

            <!-- FILTERS -->
            <div
                class="flex flex-col gap-3 mb-4 sticky top-0 bg-black z-10 pb-2"
            >
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search songs or artists..."
                    class="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#9ae600]"
                />
                <div class="flex gap-2 justify-between flex-wrap">
                    <div class="flex gap-1">
                        <button
                            onclick={() => (sortMode = "latest")}
                            class="px-2 py-1 text-[10px] border rounded {sortMode ===
                            'latest'
                                ? 'bg-[#9ae600] text-black border-[#9ae600]'
                                : 'bg-black border-[#333] text-[#555]'}"
                            >LATEST</button
                        >
                        <button
                            onclick={() => (sortMode = "artist")}
                            class="px-2 py-1 text-[10px] border rounded {sortMode ===
                            'artist'
                                ? 'bg-[#9ae600] text-black border-[#9ae600]'
                                : 'bg-black border-[#333] text-[#555]'}"
                            >ARTIST</button
                        >
                        <button
                            onclick={() => (sortMode = "liked")}
                            class="px-2 py-1 text-[10px] border rounded {sortMode ===
                            'liked'
                                ? 'bg-[#9ae600] text-black border-[#9ae600]'
                                : 'bg-black border-[#333] text-[#555]'}"
                            >LIKED</button
                        >
                    </div>

                    <button
                        onclick={() => (filterLikedOnly = !filterLikedOnly)}
                        class="px-2 py-1 text-[10px] border rounded flex items-center gap-1 {filterLikedOnly
                            ? 'bg-[#f91880] text-white border-[#f91880]'
                            : 'bg-black border-[#333] text-[#555]'}"
                    >
                        ♥ LIKED ONLY
                    </button>
                </div>
                <div class="text-[10px] text-[#444] text-right">
                    Showing {playableTracks.length} / {filteredTracksCount} tracks
                </div>
            </div>

            <div
                class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1"
                onscroll={(e) => {
                    const el = e.currentTarget;
                    // Auto-load more when scrolling near bottom
                    if (
                        el.scrollHeight - el.scrollTop - el.clientHeight <
                        200
                    ) {
                        if (visibleLimit < filteredTracksCount) {
                            visibleLimit += 50;
                            applyFilters(); // Re-slice
                        }
                    }
                }}
            >
                {#each playableTracks as track (track.Id)}
                    <div class="relative group">
                        <button
                            onclick={() => selectTrack(track)}
                            class="w-full p-4 border border-[#333] rounded bg-[#111] hover:border-[#9ae600] hover:bg-[#222] transition-all text-left pr-12"
                        >
                            <div class="text-sm text-white font-bold truncate">
                                {track.Title}
                            </div>
                            <div class="text-[10px] text-[#555] truncate">
                                {getArtistDisplay(track)}
                            </div>
                        </button>
                        <div
                            class="absolute right-2 top-1/2 -translate-y-1/2"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <LikeButton
                                smolId={track.Id}
                                liked={likedTrackIds.has(track.Id)}
                                iconSize="size-4"
                                on:likeChanged={(e) => {
                                    // Update local set to reflect change immediately UI-wise
                                    const newSet = new Set(likedTrackIds);
                                    if (e.detail.liked)
                                        newSet.add(e.detail.smolId);
                                    else newSet.delete(e.detail.smolId);
                                    likedTrackIds = newSet;
                                }}
                            />
                        </div>
                    </div>
                {/each}
                {#if visibleLimit < filteredTracksCount}
                    <div class="col-span-1 md:col-span-2 text-center py-4">
                        <button
                            onclick={() => {
                                visibleLimit += 50;
                                applyFilters();
                            }}
                            class="text-xs text-[#9ae600] border border-[#9ae600] px-4 py-2 rounded hover:bg-[#9ae600] hover:text-black"
                        >
                            LOAD MORE
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {:else if gameState === "playing"}
        <!-- GAME SCREEN -->
        <div class="relative">
            <!-- HUD -->
            <div
                class="flex justify-between items-start mb-4 p-4 border-b border-[#333]"
            >
                <div class="flex flex-col gap-1">
                    <div class="text-sm text-white font-bold">
                        {currentTrack?.Title || "Unknown Track"}
                    </div>
                    <div class="text-[10px] text-[#555]">
                        {getArtistDisplay(currentTrack)}
                    </div>
                </div>
                <div class="flex gap-6 text-right">
                    <div class="flex flex-col">
                        <span class="text-[10px] text-[#555]">SCORE</span>
                        <span class="text-xl text-[#9ae600] font-bold"
                            >{stats.score.toLocaleString()}</span
                        >
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[10px] text-[#555]">COMBO</span>
                        <span
                            class="text-xl text-[#f91880] font-bold {stats.combo >
                            0
                                ? 'animate-pulse'
                                : ''}">{stats.combo}x</span
                        >
                    </div>
                </div>
            </div>

            <!-- GAME FIELD -->
            <div
                class="relative bg-black border-2 border-[#333] rounded-lg overflow-hidden"
                style="height: {laneHeight}px;"
            >
                <!-- Lanes -->
                <div class="absolute inset-0 flex">
                    {#each [0, 1, 2] as lane}
                        <div
                            class="flex-1 border-r border-[#222] last:border-r-0 relative touch-none"
                            onpointerdown={(e) => {
                                e.preventDefault();
                                handleInputStart(lane);
                            }}
                            onpointerup={(e) => {
                                e.preventDefault();
                                handleInputEnd(lane);
                            }}
                            onpointerleave={(e) => {
                                handleInputEnd(lane);
                            }}
                        >
                            <!-- Lane background -->
                            <div
                                class="absolute inset-0 bg-gradient-to-b from-transparent via-[#111] to-black transition-all duration-75"
                                style="opacity: {pressedLanes[lane]
                                    ? 0.8
                                    : 0.5}; background-color: {pressedLanes[
                                    lane
                                ]
                                    ? `rgba(${LANE_COLORS[lane].rgb}, 0.1)`
                                    : 'transparent'}; box-shadow: {pressedLanes[
                                    lane
                                ]
                                    ? `inset 0 0 20px rgba(${LANE_COLORS[lane].rgb}, 0.1)`
                                    : 'none'};"
                            ></div>

                            <!-- Hit zone indicator -->
                            <div
                                class="absolute w-full h-2 border-y-2 transition-all duration-75"
                                style="top: {hitZoneY}px; background-color: {pressedLanes[
                                    lane
                                ]
                                    ? `rgba(${LANE_COLORS[lane].rgb}, 0.6)`
                                    : `rgba(${LANE_COLORS[lane].rgb}, 0.3)`}; border-color: {pressedLanes[
                                    lane
                                ]
                                    ? LANE_COLORS[lane].hex
                                    : LANE_COLORS[lane]
                                          .hex}; box-shadow: {pressedLanes[lane]
                                    ? `0 0 20px ${LANE_COLORS[lane].hex}`
                                    : 'none'};"
                            ></div>

                            <!-- Key hint -->
                            <div
                                class="absolute bottom-4 left-1/2 -translate-x-1/2 text-[#333] text-2xl font-bold transition-all duration-75"
                                style="color: {pressedLanes[lane]
                                    ? LANE_COLORS[lane].hex
                                    : '#333'}; transform: {pressedLanes[lane]
                                    ? 'translate(-50%) scale(1.1)'
                                    : 'translate(-50%) scale(1)'};"
                            >
                                {LANE_KEYS[lane].toUpperCase()}
                            </div>

                            <!-- Hit feedback text -->
                            {#each hitFeedback.filter((f) => f.lane === lane) as feedback (feedback.timestamp)}
                                {@const age =
                                    (Date.now() - feedback.timestamp) / 1000}
                                {@const opacity = Math.max(0, 1 - age)}
                                {@const yOffset = age * 50}
                                <div
                                    class="absolute left-1/2 -translate-x-1/2 text-xs font-bold pointer-events-none"
                                    style="top: {hitZoneY -
                                        yOffset}px; opacity: {opacity}; color: {feedback.text ===
                                    'PERFECT!'
                                        ? '#9ae600'
                                        : feedback.text === 'GREAT!'
                                          ? '#FDDA24'
                                          : feedback.text === 'OK'
                                            ? '#f91880'
                                            : '#666'}; text-shadow: 0 0 10px currentColor;"
                                >
                                    {feedback.text}
                                </div>
                            {/each}

                            <!-- Hit effects -->
                            {#each hitEffects.filter((e) => e.lane === lane) as effect (effect.id)}
                                <div
                                    class="absolute left-1/2 -translate-x-1/2 w-full aspect-square pointer-events-none"
                                    style="top: {hitZoneY - 20}px;"
                                >
                                    <div
                                        class="absolute inset-0 rounded-full animate-ping opacity-75"
                                        style="background-color: {effect.color}"
                                    ></div>
                                    <div
                                        class="absolute inset-0 rounded-full animate-pulse opacity-50"
                                        style="background-color: {effect.color}; filter: blur(4px)"
                                    ></div>
                                </div>
                            {/each}

                            <!-- Notes in this lane -->
                            {#each notes.filter((n) => n.lane === lane) as note (note.id)}
                                <!-- Hold Note Tail -->
                                {#if (note.duration || 0) > 0.2}
                                    <div
                                        class="absolute left-1/2 -translate-x-1/2 w-2 opacity-40 rounded-b-full"
                                        style="
                                             top: {(note.position / 100) *
                                            laneHeight -
                                            note.duration *
                                                settings.noteSpeed}px;
                                             height: {note.duration *
                                            settings.noteSpeed}px;
                                        background: {LANE_COLORS[lane].hex};
                                         "
                                    ></div>
                                {/if}

                                <div
                                    class="absolute left-1/2 -translate-x-1/2 rounded-full transition-all duration-75"
                                    style="
                                        top: {(note.position / 100) *
                                        laneHeight}px;
                                        width: {noteSize}px;
                                        height: {noteSize}px;
                                        height: {noteSize}px;
                                        background: {note.hit
                                        ? note.accuracy === 'perfect'
                                            ? '#9ae600'
                                            : note.accuracy === 'great'
                                              ? '#FDDA24'
                                              : '#f91880'
                                        : LANE_COLORS[lane].hex};
                                        opacity: {note.hit ? 0.3 : 1};
                                        box-shadow: 0 0 20px currentColor;
                                    "
                                >
                                    {#if note.hit && note.accuracy}
                                        <div
                                            class="absolute inset-0 flex items-center justify-center text-black text-[8px] font-bold"
                                        >
                                            {note.accuracy === "perfect"
                                                ? "★"
                                                : note.accuracy === "great"
                                                  ? "✓"
                                                  : "·"}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Controls hint -->
            <div class="mt-4 text-center text-[10px] text-[#333]">
                Press D, F, J or Tap Lanes • ESC to pause
            </div>
        </div>

        <!-- PAUSE MENU OVERLAY -->
        {#if gameState === "paused"}
            <div
                class="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center catch-pointer-events"
                onclick={(e) => e.stopPropagation()}
            >
                <h2 class="text-4xl font-bold text-white mb-8 tracking-widest">
                    PAUSED
                </h2>

                <div class="flex flex-col gap-4 w-64">
                    <button
                        onclick={togglePause}
                        class="bg-[#9ae600] text-black font-bold py-3 rounded hover:scale-105 transition-transform"
                    >
                        RESUME
                    </button>

                    <div
                        class="flex flex-col gap-2 mt-4 border-t border-[#333] pt-4"
                    >
                        <span
                            class="text-xs text-[#555] text-center uppercase tracking-widest"
                            >Difficulty</span
                        >
                        <div class="grid grid-cols-2 gap-2">
                            {#each ["easy", "medium", "hard", "expert"] as d}
                                <button
                                    onclick={() => switchDifficulty(d)}
                                    class="px-2 py-2 text-[10px] border rounded uppercase transition-colors {settings.difficulty ===
                                    d
                                        ? 'bg-white text-black border-white'
                                        : 'bg-transparent text-[#555] border-[#333] hover:border-white'}"
                                >
                                    {d}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <button
                        onclick={() => {
                            // Restart track
                            spawnedCachedOnsets.clear();
                            notes = [];
                            stats = {
                                perfect: 0,
                                great: 0,
                                ok: 0,
                                miss: 0,
                                combo: 0,
                                maxCombo: 0,
                                score: 0,
                            };
                            if (audio) {
                                audio.currentTime = 0;
                                gameState = "playing";
                                audio.play();
                                gameLoop();
                            }
                        }}
                        class="mt-4 border border-[#333] text-[#777] hover:text-white hover:border-white py-2 rounded text-xs"
                    >
                        RESTART SONG
                    </button>
                    <button
                        onclick={() => {
                            if (confirm("Exit to menu?")) finishGame();
                        }}
                        class="border border-[#333] text-[#777] hover:text-[#f91880] hover:border-[#f91880] py-2 rounded text-xs"
                    >
                        EXIT TO MENU
                    </button>
                </div>
            </div>
        {/if}
    {:else if gameState === "finished"}
        <!-- RESULTS SCREEN -->
        <div
            class="flex flex-col gap-6 p-8 border-2 border-[#9ae600] rounded-lg bg-[#111]"
        >
            <div class="text-center border-b border-[#333] pb-4">
                <h2 class="text-3xl font-bold text-[#9ae600] mb-2">
                    STAGE CLEAR!
                </h2>
                <p class="text-sm text-white">{currentTrack?.Title}</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div
                    class="flex flex-col items-center p-4 border border-[#333] rounded"
                >
                    <span class="text-[10px] text-[#555] uppercase"
                        >Final Score</span
                    >
                    <span class="text-3xl text-[#9ae600] font-bold"
                        >{stats.score.toLocaleString()}</span
                    >
                </div>
                <div
                    class="flex flex-col items-center p-4 border border-[#333] rounded"
                >
                    <span class="text-[10px] text-[#555] uppercase"
                        >Max Combo</span
                    >
                    <span class="text-3xl text-[#f91880] font-bold"
                        >{stats.maxCombo}x</span
                    >
                </div>
            </div>

            <div class="grid grid-cols-4 gap-2 text-center">
                <div class="p-3 border border-[#333] rounded">
                    <div class="text-[10px] text-[#9ae600]">PERFECT</div>
                    <div class="text-xl font-bold text-white">
                        {stats.perfect}
                    </div>
                </div>
                <div class="p-3 border border-[#333] rounded">
                    <div class="text-[10px] text-[#FDDA24]">GREAT</div>
                    <div class="text-xl font-bold text-white">
                        {stats.great}
                    </div>
                </div>
                <div class="p-3 border border-[#333] rounded">
                    <div class="text-[10px] text-[#f91880]">OK</div>
                    <div class="text-xl font-bold text-white">{stats.ok}</div>
                </div>
                <div class="p-3 border border-[#333] rounded">
                    <div class="text-[10px] text-[#555]">MISS</div>
                    <div class="text-xl font-bold text-white">{stats.miss}</div>
                </div>
            </div>

            <div class="flex gap-4">
                <button
                    onclick={returnToMenu}
                    class="flex-1 px-6 py-3 bg-[#222] border border-[#333] rounded text-white hover:bg-[#333] transition-all"
                >
                    BACK TO MENU
                </button>
                <button
                    onclick={() => selectTrack(currentTrack)}
                    class="flex-1 px-6 py-3 bg-[#9ae600] border border-[#9ae600] rounded text-black font-bold hover:bg-[#7cc600] transition-all"
                >
                    RETRY
                </button>
            </div>
        </div>
    {/if}
</div>

<style>
    .smol-hero-container {
        min-height: 600px;
    }
</style>
