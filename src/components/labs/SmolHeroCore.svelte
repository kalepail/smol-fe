<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { safeFetchSmols, fetchLikedSmols } from "../../services/api/smols";
    import { getSongUrl } from "../../utils/apiUrl";
    import confetti from "canvas-confetti";
    import LikeButton from "../../components/ui/LikeButton.svelte";
    import StarRating from "./StarRating.svelte";
    import {
        calculateStarRating,
        saveLocalScore,
        getLocalScore,
        type StarRating as StarRatingType,
        type LocalScore,
    } from "../../utils/starRating";
    import { userState, isAuthenticated } from "../../stores/user.state.svelte";

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
        duration?: number;
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
    const BEATMAP_CACHE_MAX_SIZE = 20; // Limit cache to prevent unbounded memory growth

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
    const difficultyOptions: GameSettings["difficulty"][] = [
        "easy",
        "medium",
        "hard",
        "expert",
    ];

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

    // Star rating & score persistence
    let currentRating = $state<StarRatingType | null>(null);
    let isNewPersonalBest = $state(false);
    let attestStage = $state<string | null>(null); // null | "preparing" | ... | "confirmed"
    let attestResult = $state<{ ok: boolean; txHash?: string; error?: string } | null>(null);
    let isAttesting = $state(false);

    // Volume & song progress
    let volume = $state(0.7);
    let songProgress = $state(0); // 0-1 progress through song
    let trackDuration = $state(0); // seconds

    // Previous best (for delta display on results screen)
    let previousBest = $state<LocalScore | null>(null);

    // Screen shake on combo break
    let comboBreakShake = $state(false);

    // ======================
    // CUSTOM TRACK RECORDING
    // ======================

    let recordingMode = $state(false); // Tap-to-record mode (no auto notes)
    let recordedNotes = $state<CachedOnset[]>([]); // Captured taps during recording
    let customShareLink = $state<string | null>(null); // Encoded URL for sharing
    let customLinkCopied = $state(false); // Copy-to-clipboard feedback
    // Beatmap decoded from a shared URL (custom track link)
    let incomingCustomBeatmap = $state<Beatmap | null>(null);

    /** Encode a recorded beatmap to a compact URL-safe string.
     *  Format: base64url( "{trackId}|{noteStream}" )
     *  noteStream: for each note: "{lane}{deltaCs_hex4}" (centiseconds, 4 hex digits)
     *  Max delta per step ≤ 65535 cs = ~655 seconds — more than enough. */
    function encodeCustomTrack(trackId: string, onsets: CachedOnset[]): string {
        const sorted = [...onsets].sort((a, b) => a.time - b.time);
        let prev = 0;
        const stream = sorted.map(o => {
            const deltaCs = Math.round(Math.max(0, o.time - prev) * 100);
            prev = o.time;
            return `${o.lane}${Math.min(deltaCs, 65535).toString(16).padStart(4, '0')}`;
        }).join('');
        const raw = `${trackId}|${stream}`;
        try {
            return btoa(encodeURIComponent(raw))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        } catch {
            return '';
        }
    }

    /** Decode a custom track string back to trackId + onsets. */
    function decodeCustomTrack(encoded: string): { trackId: string; onsets: CachedOnset[] } | null {
        try {
            const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
            const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4); // re-pad
            const raw = decodeURIComponent(atob(padded));
            const sep = raw.indexOf('|');
            if (sep === -1) return null;
            const trackId = raw.slice(0, sep);
            const stream = raw.slice(sep + 1);
            const onsets: CachedOnset[] = [];
            let cursor = 0;
            let cumTime = 0;
            while (cursor + 5 <= stream.length) {
                const lane = parseInt(stream[cursor]);
                const deltaCs = parseInt(stream.slice(cursor + 1, cursor + 5), 16);
                cumTime += deltaCs / 100;
                if (lane >= 0 && lane <= 2 && !isNaN(deltaCs)) {
                    onsets.push({ lane, time: cumTime });
                }
                cursor += 5;
            }
            return { trackId, onsets };
        } catch {
            return null;
        }
    }

    function buildShareUrl(): string {
        if (!currentTrack || recordedNotes.length === 0) return '';
        const encoded = encodeCustomTrack(currentTrack.Song_1, recordedNotes);
        if (!encoded) return '';
        const url = new URL(window.location.href);
        url.hash = `custom=${encoded}`;
        return url.toString();
    }

    async function copyShareLink() {
        const link = customShareLink || buildShareUrl();
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            customLinkCopied = true;
            setTimeout(() => (customLinkCopied = false), 2500);
        } catch {
            // Fallback: prompt user
            prompt('Copy this link:', link);
        }
    }

    /** Start the game in recording mode (no auto-beats, taps are recorded). */
    function startRecordingMode(track: any) {
        currentTrack = track;
        recordingMode = true;
        recordedNotes = [];
        customShareLink = null;
        cachedBeatmap = null; // No auto-spawned notes during recording
        gameState = "playing";
        startGame();
    }

    /** Play back a previously recorded (or URL-decoded) custom beatmap. */
    function playCustomBeatmap(track: any, onsets: CachedOnset[]) {
        currentTrack = track;
        recordingMode = false;
        cachedBeatmap = {
            trackId: track.Song_1,
            difficulty: settings.difficulty,
            onsets: [...onsets].sort((a, b) => a.time - b.time),
        };
        gameState = "playing";
        startGame();
    }

    // Live derived stats
    let totalNotes = $derived(stats.perfect + stats.great + stats.ok + stats.miss);
    let liveAccuracy = $derived.by(() => {
        if (totalNotes === 0) return 100;
        const weighted = stats.perfect * 1.0 + stats.great * 0.7 + stats.ok * 0.4;
        return Math.round((weighted / totalNotes) * 100);
    });
    let comboText = $derived.by(() => {
        if (stats.combo >= 100) return "LEGENDARY";
        if (stats.combo >= 50) return "UNSTOPPABLE";
        if (stats.combo >= 25) return "ON FIRE";
        if (stats.combo >= 10) return "GREAT STREAK";
        return "";
    });
    let hitRate = $derived(totalNotes > 0 ? Math.round(((stats.perfect + stats.great + stats.ok) / totalNotes) * 100) : 0);

    // Beat detection state
    let isAnalyzing = $state(false);
    let animationFrameId: number | null = null;
    let gameStartTime = 0;
    let lastOnsetTimes = [0, 0, 0]; // Last onset time per lane
    let energyHistory: number[][] = [[], [], []]; // Energy history per lane
    let prevRmsRT = [0, 0, 0]; // Previous RMS for real-time spectral flux
    let fluxHistoryRT: number[][] = [[], [], []]; // Flux history for real-time mode
    const ENERGY_HISTORY_SIZE = 86; // ~1.4s at 60fps — longer window for better adaptive threshold
    const FLUX_HISTORY_SIZE = 86; // For spectral flux adaptive baseline

    // Difficulty-based onset sensitivity
    // Higher = stricter (fewer beats detected). Tuned so hard/expert
    // only fire on musically clear hits, not background noise.
    let onsetThresholdMultiplier = $derived.by(() => {
        switch (settings.difficulty) {
            case "easy":
                return 2.5;
            case "medium":
                return 2.0;
            case "hard":
                return 1.9;
            case "expert":
                return 1.6;
            default:
                return 2.0;
        }
    });

    // Visual (responsive)
    let laneHeight = $state(600);
    let hitZoneY = $state(450); // Y position of hit zone — notes arrive HERE at hitTime
    let noteSize = $state(42);

    function updateDimensions() {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        const mobile = vw < 768;

        if (mobile) {
            // On mobile, fit the game field within the viewport
            // Account for HUD (~80px), controls (~40px), page chrome (~120px)
            const availableHeight = vh - 240;
            laneHeight = Math.max(320, Math.min(availableHeight, 480));
            hitZoneY = Math.floor(laneHeight * 0.72); // Higher up for mobile
            noteSize = 36;
        } else {
            laneHeight = 600;
            hitZoneY = Math.floor(laneHeight * 0.75); // 75% down
            noteSize = 42;
        }
    }

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
    // Bass notes are larger (low freq = heavy), treble notes are smaller (high freq = sharp)
    const LANE_NOTE_SCALES = [1.18, 1.0, 0.82];

    function getLaneNoteSize(lane: number): number {
        return Math.round(noteSize * LANE_NOTE_SCALES[lane]);
    }

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
            const gain = audioContext.createGain();
            gain.gain.value = 1.0;
            gainNode = gain;

            // Create frequency band filters — matched to offline analysis frequencies
            // BASS: kick drum / sub-bass (up to ~100 Hz)
            const bass = audioContext.createBiquadFilter();
            bass.type = "lowpass";
            bass.frequency.value = 100;
            bass.Q.value = 0.8;
            bassFilter = bass;

            const bassAnalyzer = audioContext.createAnalyser();
            bassAnalyzer.fftSize = 512;
            bassAnalyzer.smoothingTimeConstant = 0.2; // Faster response for onset detection
            bassAnalyser = bassAnalyzer;

            // MID: vocal / guitar / snare (bandpass ~800 Hz)
            const mid = audioContext.createBiquadFilter();
            mid.type = "bandpass";
            mid.frequency.value = 800;
            mid.Q.value = 0.9;
            midFilter = mid;

            const midAnalyzer = audioContext.createAnalyser();
            midAnalyzer.fftSize = 512;
            midAnalyzer.smoothingTimeConstant = 0.2;
            midAnalyser = midAnalyzer;

            // TREBLE: hi-hats / cymbals / bright melodic (3500+ Hz)
            const treble = audioContext.createBiquadFilter();
            treble.type = "highpass";
            treble.frequency.value = 3500;
            treble.Q.value = 0.8;
            trebleFilter = treble;

            const trebleAnalyzer = audioContext.createAnalyser();
            trebleAnalyzer.fftSize = 512;
            trebleAnalyzer.smoothingTimeConstant = 0.2;
            trebleAnalyser = trebleAnalyzer;

            // Connect audio graph
            source.connect(bass);
            bass.connect(bassAnalyzer);

            source.connect(mid);
            mid.connect(midAnalyzer);

            source.connect(treble);
            treble.connect(trebleAnalyzer);

            // Also connect to output
            source.connect(gain);
            gain.connect(audioContext.destination);

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

    let lastGlobalOnsetTimeRT = 0; // Cross-lane spacing for real-time mode

    // Per-band noise floors (byte scale 0-255) — treble band is quieter, needs lower floor
    const RT_NOISE_FLOORS = [2.0, 2.5, 1.5]; // bass, mid, treble

    function detectOnsets() {
        if (!bassAnalyser || !midAnalyser || !trebleAnalyser) return;

        const analysers = [bassAnalyser, midAnalyser, trebleAnalyser];
        const currentTime = audio?.currentTime || 0;

        // Per-lane minimum spacing (difficulty-aware)
        let minTimeBetweenOnsets = 0.22; // Expert default
        if (settings.difficulty === "easy") minTimeBetweenOnsets = 0.4;
        if (settings.difficulty === "medium") minTimeBetweenOnsets = 0.3;
        if (settings.difficulty === "hard") minTimeBetweenOnsets = 0.3;

        // Cross-lane minimum spacing
        let globalMinSpacing = 0.07; // Expert default
        if (settings.difficulty === "easy") globalMinSpacing = 0.3;
        if (settings.difficulty === "medium") globalMinSpacing = 0.15;
        if (settings.difficulty === "hard") globalMinSpacing = 0.1;

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

            // Spectral flux: only positive energy increases indicate note attacks
            const flux = Math.max(0, rms - prevRmsRT[lane]);
            prevRmsRT[lane] = rms;

            // Add to histories
            energyHistory[lane].push(rms);
            if (energyHistory[lane].length > ENERGY_HISTORY_SIZE) {
                energyHistory[lane].shift();
            }
            fluxHistoryRT[lane].push(flux);
            if (fluxHistoryRT[lane].length > FLUX_HISTORY_SIZE) {
                fluxHistoryRT[lane].shift();
            }

            // Need enough history for detection
            if (energyHistory[lane].length < ENERGY_HISTORY_SIZE) return;

            // Adaptive thresholds based on recent history
            const avgEnergy =
                energyHistory[lane].reduce((a, b) => a + b, 0) /
                energyHistory[lane].length;
            const avgFlux =
                fluxHistoryRT[lane].reduce((a, b) => a + b, 0) /
                fluxHistoryRT[lane].length;

            // Flux threshold is lower multiplier since flux values are inherently smaller
            const fluxThreshold = avgFlux * (onsetThresholdMultiplier * 0.65);

            // Onset detected when flux spikes (rising energy = note attack) AND above noise
            if (
                flux > fluxThreshold &&
                rms > RT_NOISE_FLOORS[lane] &&
                currentTime - lastOnsetTimes[lane] > minTimeBetweenOnsets &&
                currentTime - lastGlobalOnsetTimeRT > globalMinSpacing
            ) {
                // ONSET DETECTED!
                spawnNote(lane, currentTime);
                lastOnsetTimes[lane] = currentTime;
                lastGlobalOnsetTimeRT = currentTime;
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

        // Update song progress
        if (audio.duration) {
            songProgress = currentTime / audio.duration;
        }

        // Detect new onsets (skip entirely in recording mode — user taps ARE the notes)
        if (!recordingMode) {
            if (cachedBeatmap) {
                detectOnsetsFromCache(currentTime);
            } else {
                detectOnsets();
            }
        }

        // Update note positions — notes reach hitZoneY exactly at their hitTime
        notes = notes.map((note) => {
            if (note.hit) return note;

            const timeUntilHit = note.hitTime - currentTime;
            const travelTime = NOTE_SPAWN_LEAD_TIME / 1000;
            const progress = 1 - timeUntilHit / travelTime;

            // Position in pixels: progress=0 → top, progress=1 → hitZoneY
            const pixelY = progress * hitZoneY;

            // Miss: note has fallen MISS_THRESHOLD ms past the hit zone
            const msPastHit = -timeUntilHit * 1000;
            if (msPastHit > MISS_THRESHOLD && !note.hit && !note.accuracy) {
                handleMiss(note);
                return { ...note, accuracy: "miss" as const, position: pixelY };
            }

            return { ...note, position: Math.max(0, pixelY) };
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

        // Recording mode: stamp this tap as a note, skip hit detection
        if (recordingMode) {
            const t = audio?.currentTime || 0;
            recordedNotes = [...recordedNotes, { lane: laneIndex, time: t }];
            // Show a brief hit burst so the user sees their tap
            hitEffects = [...hitEffects, {
                id: Math.random().toString(),
                lane: laneIndex,
                timestamp: Date.now(),
                color: LANE_COLORS[laneIndex].hex,
            }];
            return;
        }

        // Find closest unhit note in this lane (apply calibration offset)
        const currentTime = (audio?.currentTime || 0) + settings.calibrationOffset / 1000;
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
        // Screen shake on significant combo break
        if (stats.combo >= 5) {
            comboBreakShake = true;
            setTimeout(() => comboBreakShake = false, 300);
        }

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
                bassFilter.frequency.value = 100; // Tighter kick drum / sub-bass isolation
                bassFilter.Q.value = 0.8;

                // Mid Path — covers vocal/guitar/snare range
                const midFilter = offlineCtx.createBiquadFilter();
                midFilter.type = "bandpass";
                midFilter.frequency.value = 800; // Centered on vocal / snare sweet spot
                midFilter.Q.value = 0.9;

                // Treble Path — hi-hats, cymbals, bright melodic content
                const trebleFilter = offlineCtx.createBiquadFilter();
                trebleFilter.type = "highpass";
                trebleFilter.frequency.value = 3500; // Cleaner separation from mid
                trebleFilter.Q.value = 0.8;

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
                const lastOnsetTimes = [0, 0, 0];
                let lastGlobalOnsetTime = 0; // Cross-lane spacing
                const energyHistory: number[][] = [[], [], []];
                // Spectral flux state — detects note attacks (rising energy) not sustains
                const fluxHistory: number[][] = [[], [], []];
                const prevRmsArr = [0, 0, 0];
                const FLUX_HIST = 86;
                // Per-band noise floors (float, post-filter amplitude is small)
                const BAND_NOISE_FLOORS = [0.003, 0.004, 0.003];

                // Peak Centering State
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

                        // Spectral flux: only positive energy increases (note attacks)
                        const flux = Math.max(0, rms - prevRmsArr[lane]);
                        prevRmsArr[lane] = rms;

                        // Rolling Histories
                        energyHistory[lane].push(rms);
                        if (energyHistory[lane].length > ENERGY_HISTORY_SIZE) {
                            energyHistory[lane].shift();
                        }
                        fluxHistory[lane].push(flux);
                        if (fluxHistory[lane].length > FLUX_HIST) {
                            fluxHistory[lane].shift();
                        }

                        if (energyHistory[lane].length < ENERGY_HISTORY_SIZE)
                            continue;

                        const avgEnergy =
                            energyHistory[lane].reduce((a, b) => a + b, 0) /
                            energyHistory[lane].length;
                        const avgFlux =
                            fluxHistory[lane].length > 0
                                ? fluxHistory[lane].reduce((a, b) => a + b, 0) / fluxHistory[lane].length
                                : 0;
                        const threshold = avgEnergy * onsetThresholdMultiplier;
                        // Flux threshold is lower multiplier — flux values are inherently smaller
                        const fluxThreshold = avgFlux * (onsetThresholdMultiplier * 0.65);

                        // -- DENSITY CONTROL --
                        // Per-lane minimum spacing (seconds between notes in same lane)
                        let minSpacing = 0.22; // Default (Expert)
                        if (settings.difficulty === "easy") minSpacing = 0.4;
                        if (settings.difficulty === "medium") minSpacing = 0.3;
                        if (settings.difficulty === "hard") minSpacing = 0.3;

                        // Cross-lane minimum spacing (seconds between notes on ANY lane)
                        // Prevents walls of simultaneous notes
                        let globalMinSpacing = 0.07; // Default (Expert)
                        if (settings.difficulty === "easy")
                            globalMinSpacing = 0.3;
                        if (settings.difficulty === "medium")
                            globalMinSpacing = 0.15;
                        if (settings.difficulty === "hard")
                            globalMinSpacing = 0.1;

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
                                // Only add if we respect both per-lane AND global spacing
                                if (
                                    state.peakTime - lastOnsetTimes[lane] >
                                        minSpacing &&
                                    state.peakTime - lastGlobalOnsetTime >
                                        globalMinSpacing
                                ) {
                                    detectedOnsets.push({
                                        lane,
                                        time: state.peakTime,
                                    });
                                    lastOnsetTimes[lane] = state.peakTime;
                                    lastGlobalOnsetTime = state.peakTime;
                                }

                                // Reset and cooldown
                                state.isTracking = false;
                                state.peakRMS = 0;
                            }
                        } else {
                            // Start tracking when energy is high AND rising (flux spike = note attack)
                            // This prevents false triggers from sustained loud sections
                            if (
                                rms > threshold &&
                                flux > fluxThreshold && // Require rising energy
                                currentTime - lastOnsetTimes[lane] >
                                    minSpacing &&
                                currentTime - lastGlobalOnsetTime >
                                    globalMinSpacing &&
                                rms > BAND_NOISE_FLOORS[lane]
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

                // Enforce cache size limit (LRU-style: remove oldest entries)
                const cacheKey = `${track.Song_1}-${settings.difficulty}`;
                if (beatmapCache.size >= BEATMAP_CACHE_MAX_SIZE) {
                    // Remove the first (oldest) entry
                    const firstKey = beatmapCache.keys().next().value;
                    if (firstKey) beatmapCache.delete(firstKey);
                }
                beatmapCache.set(cacheKey, beatmap);
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
        prevRmsRT = [0, 0, 0];
        fluxHistoryRT = [[], [], []];
        lastOnsetTimes = [0, 0, 0];
        lastGlobalOnsetTimeRT = 0;
        spawnedCachedOnsets.clear(); // Reset cached onset tracking

        // Create and setup audio
        audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.src = `${import.meta.env.PUBLIC_API_URL}/song/${currentTrack.Song_1}.mp3`;
        audio.volume = volume;

        // Track duration once metadata loads
        audio.onloadedmetadata = () => {
            trackDuration = audio?.duration || 0;
        };

        // Init analysis (skip if using pre-computed beatmap or in recording mode)
        if (!cachedBeatmap && !recordingMode) {
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
        // Recording mode: save the captured taps and go to the recorded screen
        if (recordingMode) {
            recordingMode = false;
            isAnalyzing = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (audio) audio.pause();
            customShareLink = buildShareUrl();
            gameState = "recorded";
            return;
        }

        gameState = "finished";
        isAnalyzing = false;
        attestResult = null;
        attestStage = null;
        isAttesting = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        // Calculate star rating
        currentRating = calculateStarRating({
            perfect: stats.perfect,
            great: stats.great,
            ok: stats.ok,
            miss: stats.miss,
            score: stats.score,
            maxCombo: stats.maxCombo,
        });

        // Capture previous best for delta display before saving
        previousBest = currentTrack ? getLocalScore(currentTrack.Song_1, settings.difficulty) : null;

        // Save to localStorage (personal best tracking)
        if (currentTrack) {
            isNewPersonalBest = saveLocalScore({
                trackId: currentTrack.Song_1,
                trackTitle: currentTrack.Title || "Unknown",
                difficulty: settings.difficulty,
                score: stats.score,
                stars: currentRating.stars,
                golden: currentRating.golden,
                accuracy: currentRating.accuracy,
                maxCombo: stats.maxCombo,
                perfect: stats.perfect,
                great: stats.great,
                ok: stats.ok,
                miss: stats.miss,
                timestamp: Date.now(),
            });
        }

        // Confetti based on star rating
        if (currentRating.golden) {
            // Golden stars: epic golden confetti burst
            confetti({
                particleCount: 200,
                spread: 100,
                origin: { y: 0.5 },
                colors: ["#FFD700", "#FFC107", "#FFE55C", "#FF8F00", "#FDDA24"],
            });
            setTimeout(() => {
                confetti({
                    particleCount: 100,
                    spread: 60,
                    origin: { y: 0.4, x: 0.3 },
                    colors: ["#FFD700", "#FFE55C"],
                });
                confetti({
                    particleCount: 100,
                    spread: 60,
                    origin: { y: 0.4, x: 0.7 },
                    colors: ["#FFD700", "#FFE55C"],
                });
            }, 300);
        } else if (currentRating.stars >= 4) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ["#9ae600", "#f91880", "#FDDA24"],
            });
        } else if (currentRating.stars >= 3) {
            confetti({
                particleCount: 50,
                spread: 50,
                origin: { y: 0.6 },
                colors: ["#9ae600", "#FDDA24"],
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
        currentRating = null;
        isNewPersonalBest = false;
        previousBest = null;
        songProgress = 0;
        trackDuration = 0;
        attestResult = null;
        attestStage = null;
        isAttesting = false;
        recordingMode = false;
        recordedNotes = [];
        customShareLink = null;
        // Clear incoming custom beatmap from URL so the user can browse freely
        incomingCustomBeatmap = null;
        // Clear the hash so reloading doesn't re-trigger the custom track
        if (window.location.hash.startsWith('#custom=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    async function mintScoreToStellar() {
        if (!currentTrack || !currentRating || isAttesting) return;
        if (!isAuthenticated()) {
            alert("Connect your passkey wallet first to mint scores on-chain.");
            return;
        }

        isAttesting = true;
        attestResult = null;
        attestStage = "preparing";

        try {
            const { attestHeroScore } = await import(
                "../../lib/smol-hero/scoreAttestation"
            );

            const result = await attestHeroScore({
                owner: userState.contractId!,
                keyId: userState.keyId!,
                payload: {
                    trackId: currentTrack.Song_1,
                    trackTitle: currentTrack.Title || "Unknown",
                    score: stats.score,
                    stars: currentRating.stars,
                    golden: currentRating.golden,
                    difficulty: settings.difficulty,
                    accuracy: currentRating.accuracy,
                    maxCombo: stats.maxCombo,
                    perfect: stats.perfect,
                    great: stats.great,
                    ok: stats.ok,
                    miss: stats.miss,
                },
                onStage: (stage) => {
                    attestStage = stage;
                },
            });

            attestResult = result;
        } catch (e: any) {
            attestResult = {
                ok: false,
                error: e?.message || "Failed to mint score",
            };
        } finally {
            isAttesting = false;
        }
    }

    // ======================
    // LIFECYCLE
    // ======================

    function formatDuration(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function getCachedNoteCount(track: any): number | null {
        const cacheKey = `${track.Song_1}-${settings.difficulty}`;
        const beatmap = beatmapCache.get(cacheKey);
        return beatmap ? beatmap.onsets.length : null;
    }

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

        // Responsive game field dimensions
        updateDimensions();
        window.addEventListener("resize", updateDimensions);

        // Check for a custom track encoded in the URL hash (#custom=...)
        const hash = window.location.hash;
        if (hash.startsWith('#custom=')) {
            const encoded = hash.slice('#custom='.length);
            const decoded = decodeCustomTrack(encoded);
            if (decoded && decoded.onsets.length > 0) {
                incomingCustomBeatmap = {
                    trackId: decoded.trackId,
                    difficulty: settings.difficulty,
                    onsets: decoded.onsets,
                };
            }
        }

        loadTracks();
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        window.removeEventListener("resize", updateDimensions);
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (audio) {
            audio.pause();
            audio.src = '';
            audio = null;
        }
        // Clean up Web Audio API nodes to prevent memory leaks
        if (bassAnalyser) { bassAnalyser.disconnect(); bassAnalyser = null; }
        if (midAnalyser) { midAnalyser.disconnect(); midAnalyser = null; }
        if (trebleAnalyser) { trebleAnalyser.disconnect(); trebleAnalyser = null; }
        if (bassFilter) { bassFilter.disconnect(); bassFilter = null; }
        if (midFilter) { midFilter.disconnect(); midFilter = null; }
        if (trebleFilter) { trebleFilter.disconnect(); trebleFilter = null; }
        if (gainNode) { gainNode.disconnect(); gainNode = null; }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        // Clear cached data
        cachedDecodedBuffer = null;
        cachedBeatmap = null;
        beatmapCache.clear();
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
        <div class="flex flex-col gap-5">
            <!-- Header -->
            <div class="text-center pb-5" style="border-bottom: 1px solid #222;">
                <h1 class="text-4xl font-bold mb-1 tracking-tight">
                    <span class="text-[#9ae600]" style="text-shadow: 0 0 20px rgba(154, 230, 0, 0.3);">SMOL</span>
                    <span class="text-white">HERO</span>
                </h1>
                <p class="text-[10px] text-[#444] uppercase tracking-[0.2em]">
                    Rhythm Game &bull; Beat Detection Engine
                </p>
                {#if isIOS}
                    <div
                        class="mt-3 inline-block px-3 py-1 bg-[#9ae600]/10 border border-[#9ae600] rounded text-[10px] text-[#9ae600]"
                    >
                        iOS &bull; Pre-Analysis Mode Active
                    </div>
                {:else}
                    <button
                        onclick={() => (usePreAnalysis = !usePreAnalysis)}
                        class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 border rounded-md text-[10px] transition-all {usePreAnalysis
                            ? 'bg-[#9ae600]/10 border-[#9ae600]/50 text-[#9ae600]'
                            : 'bg-[#111] border-[#333] text-[#555] hover:border-[#666]'}"
                    >
                        {usePreAnalysis
                            ? "SYNC MODE (BEST)"
                            : "INSTANT START (LAGGY)"}
                    </button>
                    {#if usePreAnalysis}
                        <p class="text-[8px] text-[#444] mt-1">
                            Pre-analyzes audio for perfect beat syncing
                        </p>
                    {/if}
                {/if}
            </div>

            <!-- Difficulty selector + Volume -->
            <div class="flex flex-col gap-3">
                <div class="flex gap-2 justify-center">
                    {#each difficultyOptions as d}
                        <button
                            onclick={() => (settings.difficulty = d)}
                            class="px-4 py-2 text-[10px] uppercase tracking-wider border rounded-md transition-all {settings.difficulty === d
                                ? 'bg-[#9ae600] text-black border-[#9ae600] font-bold shadow-[0_0_12px_rgba(154,230,0,0.3)]'
                                : 'bg-[#0a0a0a] border-[#2a2a2a] text-[#555] hover:border-[#9ae600]/50 hover:text-[#9ae600]'}"
                        >
                            {d}
                    </button>
                    {/each}
                </div>
                <!-- Volume slider -->
                <div class="flex items-center justify-center gap-2">
                    <span class="text-[9px] text-[#444]">VOL</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        bind:value={volume}
                        class="volume-slider w-24 h-1 accent-[#9ae600] cursor-pointer"
                    />
                    <span class="text-[9px] text-[#555] tabular-nums w-7">{Math.round(volume * 100)}%</span>
                </div>
            </div>

            <!-- FILTERS -->
            <div
                class="flex flex-col gap-2.5 sticky top-0 bg-black z-10 pb-2 pt-1"
            >
                <div class="relative">
                    <input
                        type="text"
                        bind:value={searchQuery}
                        placeholder="Search songs or artists..."
                        class="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-md px-3 py-2.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#9ae600]/50 transition-colors"
                    />
                    {#if searchQuery}
                        <button
                            onclick={() => (searchQuery = "")}
                            class="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-white text-sm"
                        >x</button>
                    {/if}
                </div>
                <div class="flex gap-2 justify-between flex-wrap items-center">
                    <div class="flex gap-1">
                        {#each [["latest", "LATEST"], ["artist", "ARTIST"], ["liked", "LIKED"]] as [mode, label]}
                            <button
                                onclick={() => (sortMode = mode as any)}
                                class="px-2.5 py-1 text-[10px] border rounded-md transition-all {sortMode === mode
                                    ? 'bg-[#9ae600]/15 text-[#9ae600] border-[#9ae600]/40'
                                    : 'bg-transparent border-[#222] text-[#555] hover:border-[#444]'}"
                            >{label}</button>
                        {/each}
                    </div>

                    <button
                        onclick={() => (filterLikedOnly = !filterLikedOnly)}
                        class="px-2.5 py-1 text-[10px] border rounded-md flex items-center gap-1 transition-all {filterLikedOnly
                            ? 'bg-[#f91880]/15 text-[#f91880] border-[#f91880]/40'
                            : 'bg-transparent border-[#222] text-[#555] hover:border-[#444]'}"
                    >
                        ♥ LIKED
                    </button>
                </div>
                <div class="text-[9px] text-[#333] text-right tabular-nums">
                    {playableTracks.length} / {filteredTracksCount} tracks
                </div>
            </div>

            <!-- Incoming custom track from shared URL -->
            {#if incomingCustomBeatmap}
                {@const customTrack = allTracks.find(t => t.Song_1 === incomingCustomBeatmap?.trackId)}
                <div class="p-3.5 border-2 border-[#f91880]/60 rounded-md bg-[#f91880]/5 flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-[#f91880]"></div>
                        <span class="text-[10px] text-[#f91880] font-bold tracking-wider uppercase">Custom Track Link Detected</span>
                    </div>
                    {#if customTrack}
                        <p class="text-xs text-white">
                            <span class="font-bold">{customTrack.Title}</span>
                            <span class="text-[#555]"> &bull; {incomingCustomBeatmap.onsets.length} custom notes</span>
                        </p>
                        <button
                            onclick={() => playCustomBeatmap(customTrack, incomingCustomBeatmap!.onsets)}
                            class="w-full px-3 py-2 rounded text-black text-xs font-bold transition-all hover:opacity-90"
                            style="background: #f91880;"
                        >
                            ▶ PLAY THIS CUSTOM TRACK
                        </button>
                    {:else}
                        <p class="text-[10px] text-[#555]">
                            Song not found in your library. It may have been removed.
                        </p>
                    {/if}
                    <button onclick={() => incomingCustomBeatmap = null}
                        class="text-[9px] text-[#555] hover:text-[#f91880] text-right self-end transition-colors">
                        Dismiss ×
                    </button>
                </div>
            {/if}

            <!-- Track list -->
            <div
                class="track-list grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1"
                onscroll={(e) => {
                    const el = e.currentTarget;
                    if (
                        el.scrollHeight - el.scrollTop - el.clientHeight <
                        200
                    ) {
                        if (visibleLimit < filteredTracksCount) {
                            visibleLimit += 50;
                            applyFilters();
                        }
                    }
                }}
            >
                {#each playableTracks as track (track.Id)}
                    {@const isCached = beatmapCache.has(`${track.Song_1}-${settings.difficulty}`)}
                    {@const personalBest = getLocalScore(track.Song_1, settings.difficulty)}
                    {@const noteCount = getCachedNoteCount(track)}
                    <div class="relative group">
                        <button
                            onclick={() => selectTrack(track)}
                            class="track-card w-full p-3.5 border rounded-md bg-[#0a0a0a] text-left pr-20 transition-all
                                   {isCached ? 'border-[#9ae600]/20' : 'border-[#1a1a1a]'}
                                   hover:border-[#9ae600]/60 hover:bg-[#111]"
                        >
                            <div class="flex items-center gap-3">
                                <!-- Mini waveform icon -->
                                <div class="flex items-end gap-[2px] h-5 flex-shrink-0 opacity-40 group-hover:opacity-80 transition-opacity">
                                    <div class="w-[2px] bg-[#9ae600] rounded-t-full" style="height: 8px;"></div>
                                    <div class="w-[2px] bg-[#9ae600] rounded-t-full" style="height: 14px;"></div>
                                    <div class="w-[2px] bg-[#9ae600] rounded-t-full" style="height: 10px;"></div>
                                    <div class="w-[2px] bg-[#9ae600] rounded-t-full" style="height: 18px;"></div>
                                    <div class="w-[2px] bg-[#9ae600] rounded-t-full" style="height: 6px;"></div>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="text-[13px] text-white font-bold truncate leading-tight">
                                        {track.Title}
                                    </div>
                                    <div class="text-[10px] text-[#555] truncate mt-0.5 flex items-center gap-1.5">
                                        <span>{getArtistDisplay(track)}</span>
                                        {#if isCached}
                                            <span class="text-[#9ae600]/60">&bull; cached</span>
                                        {/if}
                                        {#if noteCount !== null}
                                            <span class="text-[#b026ff]/60">&bull; {noteCount} notes</span>
                                        {/if}
                                        {#if personalBest}
                                            <span class="inline-flex items-center gap-0.5 ml-auto">
                                                {#each Array(5) as _, i}
                                                    <svg viewBox="0 0 24 24" width="10" height="10" fill={i < personalBest.stars ? (personalBest.golden ? '#FFD700' : '#FDDA24') : '#222'}>
                                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                                    </svg>
                                                {/each}
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </button>
                        <!-- REC button + Like button -->
                        <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                            onclick={(e) => e.stopPropagation()}>
                            <!-- REC: create a custom track for this song -->
                            <button
                                onclick={() => startRecordingMode(track)}
                                title="Create custom track"
                                class="w-7 h-7 flex items-center justify-center rounded text-[9px] font-bold transition-all border border-[#f91880]/20 text-[#f91880]/40 hover:text-[#f91880] hover:border-[#f91880]/60 hover:bg-[#f91880]/10"
                            >◉</button>
                            <LikeButton
                                smolId={track.Id}
                                liked={likedTrackIds.has(track.Id)}
                                iconSize="size-4"
                                on:likeChanged={(e) => {
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
                    <div class="col-span-1 md:col-span-2 text-center py-3">
                        <button
                            onclick={() => {
                                visibleLimit += 50;
                                applyFilters();
                            }}
                            class="text-[10px] text-[#9ae600] border border-[#9ae600]/30 px-5 py-2 rounded-md hover:bg-[#9ae600]/10 transition-all"
                        >
                            LOAD MORE
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {:else if gameState === "playing" || gameState === "paused"}
        <!-- GAME SCREEN -->
        <div class="relative">
            <!-- HUD -->
            <div
                class="flex justify-between items-center px-3 py-2.5"
                style="border-bottom: none;"
            >
                <div class="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div class="text-sm text-white font-bold truncate">
                        {currentTrack?.Title || "Unknown Track"}
                    </div>
                    <div class="text-[10px] text-[#444] truncate">
                        {getArtistDisplay(currentTrack)} &bull; {settings.difficulty.toUpperCase()}
                    </div>
                </div>
                <div class="flex gap-4 text-right flex-shrink-0 ml-4">
                    <div class="flex flex-col">
                        <span class="text-[9px] text-[#444] tracking-wider">SCORE</span>
                        <span class="text-lg text-[#9ae600] font-bold tabular-nums leading-tight"
                            style="text-shadow: 0 0 12px rgba(154, 230, 0, 0.3);"
                            >{stats.score.toLocaleString()}</span
                        >
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] text-[#444] tracking-wider">COMBO</span>
                        <span
                            class="text-lg font-bold tabular-nums leading-tight"
                            style="color: {stats.combo > 0 ? '#f91880' : '#333'};
                                   text-shadow: {stats.combo >= 10 ? '0 0 12px rgba(249, 24, 128, 0.4)' : 'none'};
                                   transition: color 0.15s;"
                            >{stats.combo}x</span
                        >
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] text-[#444] tracking-wider">ACC</span>
                        <span class="text-lg font-bold tabular-nums leading-tight"
                            style="color: {liveAccuracy >= 90 ? '#9ae600' : liveAccuracy >= 70 ? '#FDDA24' : liveAccuracy >= 50 ? '#f91880' : '#555'};
                                   transition: color 0.3s;"
                            >{liveAccuracy}%</span
                        >
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] text-[#444] tracking-wider">MISS</span>
                        <span class="text-lg font-bold tabular-nums leading-tight"
                            style="color: {stats.miss > 0 ? '#f91880' : '#333'};
                                   transition: color 0.15s;"
                            >{stats.miss}</span
                        >
                    </div>
                </div>
            </div>

            <!-- Song Progress Bar + Time -->
            <div class="relative mx-3 mb-2">
                <div class="h-[3px] bg-[#111] rounded-full overflow-hidden">
                    <div
                        class="h-full rounded-full transition-[width] duration-150"
                        style="width: {songProgress * 100}%;
                               background: linear-gradient(90deg, #9ae600 0%, {songProgress > 0.7 ? '#f91880' : '#9ae600'} 100%);"
                    ></div>
                </div>
                <div class="flex justify-between mt-0.5">
                    <span class="text-[8px] text-[#333] tabular-nums">
                        {trackDuration ? formatDuration(songProgress * trackDuration) : '--:--'}
                    </span>
                    <span class="text-[8px] text-[#333] tabular-nums">
                        {trackDuration ? formatDuration(trackDuration) : '--:--'}
                    </span>
                </div>
            </div>

            <!-- REC mode indicator (replaces combo text area in recording mode) -->
            {#if recordingMode}
                <div class="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-md"
                    style="border: 1px solid rgba(249,24,128,0.5); background: rgba(249,24,128,0.1); animation: recPulse 1s ease-in-out infinite;">
                    <div class="w-2.5 h-2.5 rounded-full bg-[#f91880]" style="animation: recDot 1s ease-in-out infinite;"></div>
                    <span class="text-[11px] text-[#f91880] font-bold tracking-widest">REC</span>
                    <span class="text-[11px] text-[#f91880]/70 tabular-nums">{recordedNotes.length} notes</span>
                </div>
            {:else if comboText}
                <!-- Combo Milestone Text -->
                <div class="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none combo-milestone-text"
                    style="color: {stats.combo >= 100 ? '#FFD700' : stats.combo >= 50 ? '#f91880' : '#9ae600'};
                           font-size: {stats.combo >= 100 ? 20 : stats.combo >= 50 ? 18 : 14}px;
                           text-shadow: 0 0 20px currentColor, 0 0 40px currentColor;
                           font-weight: bold;
                           letter-spacing: 0.15em;
                           animation: comboTextPulse 0.8s ease-in-out infinite;">
                    {comboText}
                </div>
            {/if}

            <!-- GAME FIELD -->
            <div
                class="game-field relative bg-black rounded-lg overflow-hidden"
                class:screen-shake={comboBreakShake}
                style="height: {laneHeight}px;
                       border: 1px solid {stats.combo >= 50 ? '#f91880' : stats.combo >= 25 ? '#9ae600' : '#222'};
                       box-shadow: {stats.combo >= 50 ? '0 0 30px rgba(249, 24, 128, 0.2), inset 0 0 30px rgba(249, 24, 128, 0.05)' : stats.combo >= 25 ? '0 0 20px rgba(154, 230, 0, 0.15), inset 0 0 20px rgba(154, 230, 0, 0.03)' : 'none'};
                       transition: border-color 0.3s, box-shadow 0.3s;"
            >
                <!-- Scanline overlay for retro feel -->
                <div class="absolute inset-0 pointer-events-none scanlines"></div>

                <!-- Lanes -->
                <div class="absolute inset-0 flex">
                    {#each [0, 1, 2] as lane}
                        <div
                            class="flex-1 relative touch-none select-none"
                            style="border-right: 1px solid {lane < 2 ? '#1a1a1a' : 'transparent'};"
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
                            <!-- Lane background glow when pressed -->
                            <div
                                class="absolute inset-0"
                                style="background: linear-gradient(to bottom,
                                    transparent 0%,
                                    rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.06 : 0.015}) 50%,
                                    rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.15 : 0.03}) 100%
                                ); transition: background 0.08s ease-out;"
                            ></div>

                            <!-- Lane center guide line -->
                            <div
                                class="absolute left-1/2 top-0 bottom-0 w-px"
                                style="background: linear-gradient(to bottom, transparent, rgba({LANE_COLORS[lane].rgb}, 0.06), rgba({LANE_COLORS[lane].rgb}, 0.12));"
                            ></div>

                            <!-- Hit zone — receiver bar + large centered target diamond -->
                            <div
                                class="absolute w-full pointer-events-none"
                                style="top: {hitZoneY - 12}px; height: 24px;"
                            >
                                <!-- Outer glow bar -->
                                <div
                                    class="absolute inset-x-1 inset-y-0 rounded-sm"
                                    style="background: rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.25 : 0.07});
                                           box-shadow: 0 0 {pressedLanes[lane] ? 30 : 12}px rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.5 : 0.12});
                                           transition: all 0.08s ease-out;"
                                ></div>
                                <!-- Core line -->
                                <div
                                    class="absolute inset-x-0 top-1/2 -translate-y-1/2"
                                    style="height: {pressedLanes[lane] ? 4 : 2}px;
                                           background: {LANE_COLORS[lane].hex};
                                           box-shadow: 0 0 8px {LANE_COLORS[lane].hex}, 0 0 16px rgba({LANE_COLORS[lane].rgb}, 0.4);
                                           opacity: {pressedLanes[lane] ? 1 : 0.5};
                                           transition: all 0.08s ease-out;"
                                ></div>
                                <!-- Large centered target diamond — notes fall through this -->
                                <div
                                    class="absolute left-1/2 top-1/2"
                                    style="width: {getLaneNoteSize(lane) + 12}px;
                                           height: {getLaneNoteSize(lane) + 12}px;
                                           border: {pressedLanes[lane] ? 3 : 2}px solid {LANE_COLORS[lane].hex};
                                           border-radius: 4px;
                                           transform: translate(-50%, -50%) rotate(45deg);
                                           box-shadow: 0 0 {pressedLanes[lane] ? 20 : 10}px rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.8 : 0.35}),
                                                       inset 0 0 {pressedLanes[lane] ? 12 : 5}px rgba({LANE_COLORS[lane].rgb}, {pressedLanes[lane] ? 0.35 : 0.1});
                                           opacity: {pressedLanes[lane] ? 1.0 : 0.6};
                                           transition: all 0.08s ease-out;"
                                ></div>
                                <!-- Small inner fill when pressed -->
                                {#if pressedLanes[lane]}
                                    <div
                                        class="absolute left-1/2 top-1/2"
                                        style="width: {getLaneNoteSize(lane) - 4}px;
                                               height: {getLaneNoteSize(lane) - 4}px;
                                               background: rgba({LANE_COLORS[lane].rgb}, 0.18);
                                               border-radius: 3px;
                                               transform: translate(-50%, -50%) rotate(45deg);"
                                    ></div>
                                {/if}
                            </div>

                            <!-- Key hint (below hit zone) -->
                            <div
                                class="absolute left-1/2 pointer-events-none"
                                style="top: {hitZoneY + 24}px;
                                       transform: translateX(-50%) scale({pressedLanes[lane] ? 1.15 : 1});
                                       color: {pressedLanes[lane] ? LANE_COLORS[lane].hex : '#2a2a2a'};
                                       font-size: {noteSize * 0.55}px;
                                       font-weight: bold;
                                       text-shadow: {pressedLanes[lane] ? `0 0 10px ${LANE_COLORS[lane].hex}` : 'none'};
                                       transition: all 0.08s ease-out;"
                            >
                                {LANE_KEYS[lane].toUpperCase()}
                            </div>

                            <!-- Hit feedback text -->
                            {#each hitFeedback.filter((f) => f.lane === lane) as feedback (feedback.timestamp)}
                                {@const age = (Date.now() - feedback.timestamp) / 1000}
                                {@const opacity = Math.max(0, 1 - age * 1.5)}
                                {@const yOffset = age * 60}
                                {@const scale = 1 + age * 0.3}
                                <div
                                    class="absolute left-1/2 pointer-events-none font-bold"
                                    style="transform: translateX(-50%) scale({scale});
                                           top: {hitZoneY - 20 - yOffset}px;
                                           opacity: {opacity};
                                           font-size: {feedback.text === 'PERFECT!' ? 14 : 12}px;
                                           color: {feedback.text === 'PERFECT!' ? '#9ae600'
                                               : feedback.text === 'GREAT!' ? '#FDDA24'
                                               : feedback.text === 'OK' ? '#f91880'
                                               : '#444'};
                                           text-shadow: 0 0 12px currentColor, 0 0 24px currentColor;"
                                >
                                    {feedback.text}
                                </div>
                            {/each}

                            <!-- Hit effects (burst) -->
                            {#each hitEffects.filter((e) => e.lane === lane) as effect (effect.id)}
                                {@const age = (Date.now() - effect.timestamp) / 500}
                                <div
                                    class="absolute left-1/2 pointer-events-none"
                                    style="top: {hitZoneY - 16}px; transform: translateX(-50%);"
                                >
                                    <div
                                        class="hit-burst"
                                        style="width: {32 + age * 40}px; height: {32 + age * 40}px;
                                               background: radial-gradient(circle, {effect.color} 0%, transparent 70%);
                                               opacity: {Math.max(0, 1 - age)};
                                               border-radius: 50%;"
                                    ></div>
                                </div>
                            {/each}

                            <!-- Notes in this lane -->
                            {#each notes.filter((n) => n.lane === lane) as note (note.id)}
                                {@const isActive = !note.hit}
                                {@const noteColor = note.hit
                                    ? note.accuracy === 'perfect' ? '#9ae600'
                                    : note.accuracy === 'great' ? '#FDDA24'
                                    : note.accuracy === 'miss' ? '#333'
                                    : '#f91880'
                                    : LANE_COLORS[lane].hex}
                                {@const lns = getLaneNoteSize(lane)}
                                {@const distToHit = Math.abs(note.position - hitZoneY)}
                                {@const proxFactor = isActive ? Math.max(0, 1 - distToHit / 90) : 0}

                                {#if isActive}
                                    <!-- Note trail (glow streak behind the note) -->
                                    <div
                                        class="absolute left-1/2 pointer-events-none"
                                        style="transform: translateX(-50%);
                                               top: {Math.max(0, note.position - 55)}px;
                                               width: {lns * 0.32}px;
                                               height: {Math.min(55, note.position)}px;
                                               background: linear-gradient(to bottom, transparent, {LANE_COLORS[lane].hex});
                                               opacity: {0.25 + proxFactor * 0.25};
                                               border-radius: 0 0 4px 4px;"
                                    ></div>
                                {/if}

                                <!-- Note body (per-lane size + proximity glow) -->
                                <div
                                    class="absolute left-1/2 pointer-events-none"
                                    style="transform: translateX(-50%);
                                           top: {note.position - lns / 2}px;
                                           width: {lns}px;
                                           height: {lns}px;"
                                >
                                    <!-- Outer glow — brightens near hit zone -->
                                    {#if isActive}
                                        <div
                                            class="absolute rounded-full"
                                            style="inset: {-4 - proxFactor * 4}px;
                                                   background: radial-gradient(circle, rgba({LANE_COLORS[lane].rgb}, {0.35 + proxFactor * 0.35}) 0%, transparent 70%);
                                                   filter: blur({3 + proxFactor * 4}px);"
                                        ></div>
                                    {/if}
                                    <!-- Diamond shape with rounded corners -->
                                    <div
                                        class="absolute inset-[3px] rounded-lg"
                                        style="transform: rotate(45deg);
                                               background: {isActive
                                                   ? `linear-gradient(135deg, ${LANE_COLORS[lane].hex}, ${LANE_COLORS[lane].hex}dd)`
                                                   : noteColor};
                                               opacity: {note.hit ? 0.2 : 1};
                                               box-shadow: {isActive
                                                   ? `0 0 ${12 + proxFactor * 14}px ${LANE_COLORS[lane].hex}, inset 0 0 8px rgba(255,255,255,0.2)`
                                                   : 'none'};
                                               border: 1px solid rgba(255,255,255,{isActive ? 0.3 : 0});"
                                    >
                                        {#if note.hit && note.accuracy}
                                            <div
                                                class="absolute inset-0 flex items-center justify-center text-black font-bold"
                                                style="transform: rotate(-45deg); font-size: 10px;"
                                            >
                                                {note.accuracy === "perfect" ? "★"
                                                    : note.accuracy === "great" ? "✓"
                                                    : note.accuracy === "miss" ? "✗"
                                                    : "·"}
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>

                <!-- Bottom fade (below hit zone) -->
                <div
                    class="absolute inset-x-0 bottom-0 pointer-events-none"
                    style="height: {laneHeight - hitZoneY}px;
                           background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.6));"
                ></div>
            </div>

            <!-- Controls hint -->
            <div class="mt-3 text-center text-[10px] text-[#333] tracking-wider">
                D / F / J &nbsp;or&nbsp; TAP LANES &nbsp;&bull;&nbsp; ESC to pause
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
                            {#each difficultyOptions as d}
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

                    <!-- Volume + Calibration controls -->
                    <div class="flex flex-col gap-3 mt-4 border-t border-[#333] pt-4">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] text-[#555] uppercase tracking-wider">Volume</span>
                            <div class="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    bind:value={volume}
                                    oninput={() => { if (audio) audio.volume = volume; }}
                                    class="volume-slider w-24 h-1 accent-[#9ae600] cursor-pointer"
                                />
                                <span class="text-[10px] text-[#555] tabular-nums w-8">{Math.round(volume * 100)}%</span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] text-[#555] uppercase tracking-wider">Timing</span>
                            <div class="flex items-center gap-2">
                                <button
                                    onclick={() => { settings.calibrationOffset = Math.max(-100, settings.calibrationOffset - 5); }}
                                    class="w-6 h-6 text-xs border border-[#333] rounded text-[#777] hover:text-white hover:border-white transition-colors"
                                >-</button>
                                <span class="text-[10px] text-[#555] tabular-nums w-12 text-center">
                                    {settings.calibrationOffset > 0 ? '+' : ''}{settings.calibrationOffset}ms
                                </span>
                                <button
                                    onclick={() => { settings.calibrationOffset = Math.min(100, settings.calibrationOffset + 5); }}
                                    class="w-6 h-6 text-xs border border-[#333] rounded text-[#777] hover:text-white hover:border-white transition-colors"
                                >+</button>
                            </div>
                        </div>
                        <p class="text-[8px] text-[#333] text-center">
                            Adjust if hits feel early (-) or late (+)
                        </p>
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
            class="flex flex-col gap-5 p-6 md:p-8 rounded-lg bg-[#111]"
            style="border: 2px solid {currentRating?.golden ? '#FFD700' : '#9ae600'};
                   box-shadow: 0 0 {currentRating?.golden ? '30px rgba(255, 215, 0, 0.2)' : '20px rgba(154, 230, 0, 0.1)'};"
        >
            <!-- Header -->
            <div class="text-center border-b border-[#333] pb-4">
                <h2
                    class="text-2xl md:text-3xl font-bold mb-1"
                    style="color: {currentRating?.golden ? '#FFD700' : '#9ae600'};
                           text-shadow: 0 0 20px {currentRating?.golden ? 'rgba(255, 215, 0, 0.4)' : 'rgba(154, 230, 0, 0.3)'};"
                >
                    {currentRating?.golden ? 'GOLDEN CLEAR!' : currentRating?.stars === 5 ? 'PERFECT STAGE!' : 'STAGE CLEAR!'}
                </h2>
                <p class="text-sm text-white">{currentTrack?.Title}</p>
                <p class="text-[10px] text-[#555] mt-0.5">
                    {getArtistDisplay(currentTrack)} &bull; {settings.difficulty.toUpperCase()}
                </p>
            </div>

            <!-- Star Rating Display -->
            <div class="flex flex-col items-center gap-2 py-3">
                {#if currentRating}
                    <StarRating
                        stars={currentRating.stars}
                        golden={currentRating.golden}
                        size={40}
                        animate={true}
                        label={currentRating.label}
                    />
                    <div class="text-[10px] text-[#555] mt-1">
                        {currentRating.accuracy}% weighted accuracy &bull; {totalNotes} notes
                    </div>
                    <!-- Grade message -->
                    <div class="text-xs font-bold mt-0.5" style="color: {currentRating.golden ? '#FFD700' : currentRating.stars >= 4 ? '#9ae600' : currentRating.stars >= 3 ? '#FDDA24' : '#f91880'};">
                        {currentRating.golden ? 'FLAWLESS PERFORMANCE'
                            : currentRating.stars === 5 ? 'ROCK STAR!'
                            : currentRating.stars === 4 ? 'ALMOST PERFECT'
                            : currentRating.stars === 3 ? 'SOLID PERFORMANCE'
                            : currentRating.stars === 2 ? 'GETTING THERE'
                            : currentRating.stars === 1 ? 'KEEP PRACTICING'
                            : 'TOUGH TRACK'}
                    </div>
                    {#if isNewPersonalBest}
                        <div
                            class="mt-1 px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full"
                            style="background: linear-gradient(135deg, rgba(249, 24, 128, 0.15), rgba(154, 230, 0, 0.15));
                                   border: 1px solid rgba(249, 24, 128, 0.4);
                                   color: #f91880;
                                   animation: pbPulse 1.5s ease-in-out infinite;"
                        >
                            NEW PERSONAL BEST!
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- Score & Combo -->
            <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col items-center p-3 border border-[#333] rounded bg-[#0a0a0a]">
                    <span class="text-[9px] text-[#555] uppercase tracking-wider">Final Score</span>
                    <span
                        class="text-2xl md:text-3xl font-bold tabular-nums"
                        style="color: {currentRating?.golden ? '#FFD700' : '#9ae600'};
                               text-shadow: 0 0 12px {currentRating?.golden ? 'rgba(255, 215, 0, 0.3)' : 'rgba(154, 230, 0, 0.3)'};"
                    >{stats.score.toLocaleString()}</span>
                    <!-- Score delta vs previous best -->
                    {#if previousBest}
                        {@const delta = stats.score - previousBest.score}
                        <span class="text-[10px] font-bold tabular-nums mt-0.5"
                            style="color: {delta > 0 ? '#9ae600' : delta < 0 ? '#f91880' : '#555'};">
                            {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                        </span>
                    {:else}
                        <span class="text-[10px] text-[#9ae600] font-bold mt-0.5">FIRST CLEAR!</span>
                    {/if}
                </div>
                <div class="flex flex-col items-center p-3 border border-[#333] rounded bg-[#0a0a0a]">
                    <span class="text-[9px] text-[#555] uppercase tracking-wider">Max Combo</span>
                    <span class="text-2xl md:text-3xl text-[#f91880] font-bold tabular-nums"
                        >{stats.maxCombo}x</span>
                    <span class="text-[10px] text-[#555] tabular-nums mt-0.5">
                        / {totalNotes} notes
                    </span>
                </div>
            </div>

            <!-- Hit Rate Bar -->
            <div class="px-1">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[9px] text-[#555] uppercase tracking-wider">Hit Rate</span>
                    <span class="text-[9px] text-white font-bold tabular-nums">{hitRate}%</span>
                </div>
                <div class="h-2 bg-[#0a0a0a] rounded-full overflow-hidden border border-[#222]">
                    <div class="h-full flex">
                        {#if totalNotes > 0}
                            <div class="h-full bg-[#9ae600]" style="width: {(stats.perfect / totalNotes) * 100}%;"></div>
                            <div class="h-full bg-[#FDDA24]" style="width: {(stats.great / totalNotes) * 100}%;"></div>
                            <div class="h-full bg-[#f91880]" style="width: {(stats.ok / totalNotes) * 100}%;"></div>
                        {/if}
                    </div>
                </div>
                <div class="flex justify-between mt-1 text-[8px] text-[#444]">
                    <span>{stats.perfect} perfect</span>
                    <span>{stats.great} great</span>
                    <span>{stats.ok} ok</span>
                    <span>{stats.miss} miss</span>
                </div>
            </div>

            <!-- Hit Breakdown -->
            <div class="grid grid-cols-4 gap-2 text-center">
                <div class="p-2 border border-[#333] rounded bg-[#0a0a0a]">
                    <div class="text-[9px] text-[#9ae600] tracking-wider">PERFECT</div>
                    <div class="text-lg font-bold text-white tabular-nums">{stats.perfect}</div>
                </div>
                <div class="p-2 border border-[#333] rounded bg-[#0a0a0a]">
                    <div class="text-[9px] text-[#FDDA24] tracking-wider">GREAT</div>
                    <div class="text-lg font-bold text-white tabular-nums">{stats.great}</div>
                </div>
                <div class="p-2 border border-[#333] rounded bg-[#0a0a0a]">
                    <div class="text-[9px] text-[#f91880] tracking-wider">OK</div>
                    <div class="text-lg font-bold text-white tabular-nums">{stats.ok}</div>
                </div>
                <div class="p-2 border border-[#333] rounded bg-[#0a0a0a]">
                    <div class="text-[9px] text-[#555] tracking-wider">MISS</div>
                    <div class="text-lg font-bold text-white tabular-nums">{stats.miss}</div>
                </div>
            </div>

            <!-- Stellar Attestation -->
            <div class="border-t border-[#333] pt-4">
                {#if attestResult?.ok}
                    <div class="flex items-center gap-2 p-3 rounded bg-[#9ae600]/10 border border-[#9ae600]/30">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="#9ae600">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] text-[#9ae600] font-bold">MINTED ON STELLAR</div>
                            <div class="text-[9px] text-[#555] truncate font-mono">
                                tx: {attestResult.txHash}
                            </div>
                        </div>
                    </div>
                {:else if attestResult && !attestResult.ok}
                    <div class="flex items-center gap-2 p-3 rounded bg-[#f91880]/10 border border-[#f91880]/30">
                        <div class="text-[10px] text-[#f91880]">{attestResult.error}</div>
                    </div>
                {:else}
                    <button
                        onclick={mintScoreToStellar}
                        disabled={isAttesting}
                        class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all
                               {isAttesting
                                   ? 'bg-[#222] border border-[#333] text-[#555] cursor-wait'
                                   : 'bg-gradient-to-r from-[#1a1a2e] to-[#16213e] border border-[#0f3460]/50 text-white hover:border-[#0f3460] hover:shadow-[0_0_20px_rgba(15,52,96,0.3)]'}"
                    >
                        {#if isAttesting}
                            <div class="w-3 h-3 border-2 border-[#555] border-t-[#9ae600] rounded-full animate-spin"></div>
                            <span>
                                {attestStage === 'preparing' ? 'PREPARING...'
                                    : attestStage === 'simulating' ? 'SIMULATING...'
                                    : attestStage === 'assembling' ? 'ASSEMBLING TX...'
                                    : attestStage === 'signing' ? 'SIGN WITH PASSKEY...'
                                    : attestStage === 'submitted' ? 'CONFIRMING...'
                                    : 'MINTING...'}
                            </span>
                        {:else}
                            <!-- Stellar icon -->
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                            </svg>
                            <span>MINT SCORE ON STELLAR</span>
                        {/if}
                    </button>
                    <p class="text-[8px] text-[#333] text-center mt-1.5">
                        Record your {currentRating?.stars}-star score as an on-chain attestation via Soroban
                    </p>
                {/if}
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3">
                <button
                    onclick={returnToMenu}
                    class="flex-1 px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs hover:bg-[#1a1a1a] hover:border-[#555] transition-all"
                >
                    BACK TO MENU
                </button>
                <button
                    onclick={() => selectTrack(currentTrack)}
                    class="flex-1 px-4 py-3 rounded text-black text-xs font-bold transition-all"
                    style="background: {currentRating?.golden ? '#FFD700' : '#9ae600'};
                           border: 1px solid {currentRating?.golden ? '#FFD700' : '#9ae600'};"
                >
                    RETRY
                </button>
            </div>
        </div>
    {:else if gameState === "recorded"}
        <!-- CUSTOM TRACK RECORDED — share + playback screen -->
        <div class="flex flex-col gap-5 p-6 md:p-8 rounded-lg bg-[#111]"
            style="border: 2px solid #f91880; box-shadow: 0 0 24px rgba(249,24,128,0.15);">

            <!-- Header -->
            <div class="text-center border-b border-[#333] pb-4">
                <h2 class="text-2xl md:text-3xl font-bold mb-1" style="color:#f91880; text-shadow: 0 0 20px rgba(249,24,128,0.4);">
                    CUSTOM TRACK SAVED!
                </h2>
                <p class="text-sm text-white">{currentTrack?.Title || 'Unknown Track'}</p>
                <p class="text-[10px] text-[#555] mt-0.5">{getArtistDisplay(currentTrack)}</p>
            </div>

            <!-- Note count + lane breakdown -->
            {#if recordedNotes.length > 0}
                <div class="flex flex-col gap-3">
                    <div class="text-center">
                        <span class="text-3xl font-bold text-white tabular-nums">{recordedNotes.length}</span>
                        <span class="text-sm text-[#555] ml-2">notes recorded</span>
                    </div>
                    <!-- Lane breakdown bars -->
                    <div class="flex gap-3 h-14 items-end">
                        {#each [0, 1, 2] as lane}
                            {@const count = recordedNotes.filter(n => n.lane === lane).length}
                            {@const pct = recordedNotes.length > 0 ? count / recordedNotes.length : 0}
                            <div class="flex-1 flex flex-col items-center gap-1.5">
                                <span class="text-[9px] tabular-nums font-bold" style="color: {LANE_COLORS[lane].hex}">{count}</span>
                                <div class="w-full rounded-t-sm"
                                    style="height: {Math.max(4, Math.round(pct * 40))}px;
                                           background: {LANE_COLORS[lane].hex};
                                           box-shadow: 0 0 8px rgba({LANE_COLORS[lane].rgb}, 0.5);
                                           opacity: 0.85;">
                                </div>
                            </div>
                        {/each}
                    </div>
                    <div class="flex justify-around text-[8px] text-[#444] uppercase tracking-wider">
                        <span>Bass (D)</span>
                        <span>Mid (F)</span>
                        <span>Treble (J)</span>
                    </div>
                </div>
            {:else}
                <div class="text-center py-4">
                    <p class="text-sm text-[#555]">No notes were recorded.</p>
                    <p class="text-[10px] text-[#333] mt-1">Try again and tap D / F / J to the beat!</p>
                </div>
            {/if}

            <!-- Share Link -->
            {#if customShareLink && recordedNotes.length > 0}
                <div class="flex flex-col gap-2">
                    <span class="text-[9px] text-[#555] uppercase tracking-wider">Shareable Link</span>
                    <p class="text-[9px] text-[#333]">
                        Anyone who opens this link can play your exact beat pattern on this song.
                        The whole beatmap is encoded in the URL — no server needed.
                    </p>
                    <div class="flex gap-2">
                        <div class="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-2 text-[9px] text-[#555] font-mono overflow-hidden">
                            <span class="block truncate">{customShareLink}</span>
                        </div>
                        <button
                            onclick={copyShareLink}
                            class="flex-shrink-0 px-4 py-2 rounded text-xs font-bold transition-all"
                            style="background: {customLinkCopied ? '#9ae600' : 'transparent'};
                                   color: {customLinkCopied ? 'black' : '#f91880'};
                                   border: 2px solid {customLinkCopied ? '#9ae600' : '#f91880'};"
                        >
                            {customLinkCopied ? '✓ COPIED!' : 'COPY'}
                        </button>
                    </div>
                    <p class="text-[8px] text-[#333]">
                        Link size: ~{Math.round(customShareLink.length / 1024 * 10) / 10 < 1
                            ? customShareLink.length + ' chars'
                            : (Math.round(customShareLink.length / 1024 * 10) / 10) + ' KB'}
                        &bull; {recordedNotes.length} notes encoded
                    </p>
                </div>
            {/if}

            <!-- Actions -->
            <div class="flex flex-col gap-3">
                {#if recordedNotes.length > 0}
                    <button
                        onclick={() => playCustomBeatmap(currentTrack, recordedNotes)}
                        class="w-full px-4 py-3 rounded text-black text-sm font-bold transition-all hover:opacity-90"
                        style="background: #f91880;"
                    >
                        ▶ PLAY BACK MY TRACK
                    </button>
                {/if}
                <div class="flex gap-3">
                    <button
                        onclick={returnToMenu}
                        class="flex-1 px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded text-white text-xs hover:bg-[#1a1a1a] hover:border-[#555] transition-all"
                    >
                        BACK TO MENU
                    </button>
                    <button
                        onclick={() => startRecordingMode(currentTrack)}
                        class="flex-1 px-4 py-3 border border-[#f91880]/40 rounded text-[#f91880] text-xs font-bold hover:bg-[#f91880]/10 transition-all"
                    >
                        ◉ RE-RECORD
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .smol-hero-container {
        min-height: 600px;
    }

    /* Scanline overlay for retro arcade feel */
    .scanlines {
        background: repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 3px,
            rgba(0, 0, 0, 0.08) 3px,
            rgba(0, 0, 0, 0.08) 4px
        );
        z-index: 5;
    }

    /* Game field subtle vignette */
    .game-field::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.5);
        z-index: 4;
        border-radius: inherit;
    }

    /* Track list custom scrollbar */
    .track-list::-webkit-scrollbar {
        width: 4px;
    }
    .track-list::-webkit-scrollbar-track {
        background: #111;
        border-radius: 2px;
    }
    .track-list::-webkit-scrollbar-thumb {
        background: #333;
        border-radius: 2px;
    }
    .track-list::-webkit-scrollbar-thumb:hover {
        background: #9ae600;
    }

    /* Track card hover lift */
    .track-card:hover {
        transform: translateY(-1px);
    }

    /* Hit burst animation */
    .hit-burst {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    /* Personal best pulse */
    @keyframes pbPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    /* Screen shake on combo break */
    .screen-shake {
        animation: shake 0.3s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10% { transform: translateX(-4px) rotate(-0.5deg); }
        20% { transform: translateX(4px) rotate(0.5deg); }
        30% { transform: translateX(-3px) rotate(-0.3deg); }
        40% { transform: translateX(3px) rotate(0.3deg); }
        50% { transform: translateX(-2px); }
        60% { transform: translateX(2px); }
        70% { transform: translateX(-1px); }
        80% { transform: translateX(1px); }
    }

    /* Combo milestone text pulse */
    @keyframes comboTextPulse {
        0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.9; }
        50% { transform: translateX(-50%) scale(1.08); opacity: 1; }
    }

    /* REC indicator pulse */
    @keyframes recPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.65; }
    }

    /* REC dot blinking */
    @keyframes recDot {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
    }

    /* Volume slider styling */
    .volume-slider {
        appearance: none;
        -webkit-appearance: none;
        background: #222;
        border-radius: 2px;
        outline: none;
    }

    .volume-slider::-webkit-slider-thumb {
        appearance: none;
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: #9ae600;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 6px rgba(154, 230, 0, 0.4);
    }

    .volume-slider::-moz-range-thumb {
        width: 10px;
        height: 10px;
        background: #9ae600;
        border-radius: 50%;
        cursor: pointer;
        border: none;
        box-shadow: 0 0 6px rgba(154, 230, 0, 0.4);
    }
</style>
