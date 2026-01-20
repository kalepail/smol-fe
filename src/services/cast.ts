/**
 * Google Cast Integration Service
 *
 * Enables casting audio playback to Chromecast devices.
 * Uses Cast Application Framework (CAF) for modern Cast integration.
 */

import { audioState } from "../stores/audio.svelte";

declare const chrome: any;
declare const cast: any;

// Cast debug flag: check localStorage or env
const CAST_DEBUG = typeof window !== "undefined" &&
    (localStorage.getItem("CAST_DEBUG") === "true" ||
        import.meta.env.PUBLIC_CAST_DEBUG === "true");

class CastService {
    private initialized = false;
    private player: any = null;
    private playerController: any = null;
    private lastContentId: string = "";

    constructor() {
        if (typeof window === "undefined") return;

        // Check if Cast SDK is already loaded
        if ((window as any).chrome?.cast?.isAvailable) {
            this.initializeCastApi();
        } else {
            // Register callback for when SDK loads
            (window as any)["__onGCastApiAvailable"] = (isAvailable: boolean) => {
                console.log("[Cast] SDK available:", isAvailable);
                if (isAvailable) {
                    this.initializeCastApi();
                }
            };
        }
    }

    private initializeCastApi() {
        if (this.initialized) return;

        try {
            if (typeof cast === "undefined" || !cast.framework) {
                console.warn("[Cast] SDK loaded but cast.framework not available yet");
                return;
            }

            // Enable Cast debug logging if CAST_DEBUG is set
            if (CAST_DEBUG) {
                cast.framework.CastContext.getInstance().setLoggerLevel(
                    cast.framework.LoggerLevel.DEBUG
                );
                console.log("[Cast] Debug logging enabled");
            }

            // Initialize Cast Context (CAF approach)
            cast.framework.CastContext.getInstance().setOptions({
                receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });

            this.initialized = true;
            audioState.isCastAvailable = true;
            console.log("[Cast] Initialized with CastContext");

            // Listen for session state changes
            cast.framework.CastContext.getInstance().addEventListener(
                cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
                (event: any) => {
                    const sessionState = event.sessionState;
                    if (CAST_DEBUG) {
                        console.log("[Cast] Session state changed:", sessionState);
                    }
                    // SESSION_STARTED, SESSION_RESUMED, SESSION_ENDED
                }
            );

            // Set up Remote Player for controlling playback
            this.player = new cast.framework.RemotePlayer();
            this.playerController = new cast.framework.RemotePlayerController(this.player);

            // Listen for connection changes
            this.playerController.addEventListener(
                cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
                () => {
                    const isConnected = this.player.isConnected;
                    console.log("[Cast] Connection changed:", isConnected);
                    audioState.isCasting = isConnected;

                    if (isConnected && audioState.currentSong) {
                        // Auto-load current song when connected
                        this.loadMedia(audioState.currentSong);
                    }

                    if (!isConnected) {
                        // Resume local playback when disconnected
                        // (optional: could auto-resume local audio)
                    }
                }
            );

            // Listen for player state changes (IDLE, BUFFERING, PLAYING, PAUSED)
            this.playerController.addEventListener(
                cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
                () => {
                    const playerState = this.player.playerState;
                    if (CAST_DEBUG) {
                        console.log("[Cast] Player state changed:", playerState);
                    }

                    // Check if player went IDLE (stopped/errored)
                    if (playerState === "IDLE") {
                        const idleReason = this.player.idleReason;
                        if (CAST_DEBUG) {
                            console.log("[Cast] Idle reason:", idleReason);
                        }

                        // Handle error idle reasons
                        if (idleReason === "ERROR") {
                            this.showCastError("Playback failed on Cast device", this.lastContentId);
                        } else if (idleReason === "CANCELLED") {
                            console.log("[Cast] Playback cancelled");
                        } else if (idleReason === "FINISHED") {
                            console.log("[Cast] Playback finished");
                        }
                    }
                }
            );

            // Sync play/pause state from remote
            this.playerController.addEventListener(
                cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
                () => {
                    if (CAST_DEBUG) {
                        console.log("[Cast] Is paused changed:", this.player.isPaused);
                    }

                    if (this.player.isPaused) {
                        // Remote paused
                        if (audioState.playingId !== null) {
                            audioState.playingId = null;
                        }
                    } else {
                        // Remote playing
                        if (audioState.currentSong && audioState.playingId === null) {
                            audioState.playingId = audioState.currentSong.Id;
                            // Pause local audio to prevent double playback
                            if (audioState.audioElement) {
                                audioState.audioElement.pause();
                            }
                        }
                    }
                }
            );

            // Track playback progress (useful for debugging buffering issues)
            this.playerController.addEventListener(
                cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
                () => {
                    if (CAST_DEBUG && this.player.currentTime > 0) {
                        console.log("[Cast] Current time:", this.player.currentTime, "/", this.player.duration);
                    }
                }
            );

        } catch (e) {
            console.error("[Cast] Initialization failed:", e);
        }
    }

    /**
     * Show user-facing Cast error notification
     */
    private showCastError(message: string, contentId: string) {
        const url = new URL(contentId, window.location.origin);
        const errorMsg = `${message}\nURL: ${url.host}${url.pathname}`;
        console.error(`[Cast Error] ${errorMsg}`);

        // Show toast notification to user
        if (typeof window !== "undefined" && window.alert) {
            // TODO: Replace with proper toast UI component when available
            alert(`Cast Error: ${message}\n\nMedia URL: ${contentId}`);
        }
    }

    /**
     * Request a Cast session (shows device picker)
     */
    public requestSession() {
        if (!this.initialized) {
            console.warn("[Cast] Not initialized yet - SDK may still be loading");
            // Try to initialize now in case it loaded late
            if (typeof cast !== "undefined" && cast.framework) {
                this.initializeCastApi();
            } else {
                console.error("[Cast] SDK not available. Ensure Cast SDK script is loaded.");
                return;
            }
        }

        try {
            const context = cast.framework.CastContext.getInstance();
            context.requestSession().then(
                () => {
                    console.log("[Cast] Session started");
                    audioState.isCasting = true;
                },
                (error: any) => {
                    if (error === "cancel") {
                        console.log("[Cast] User cancelled session request");
                    } else {
                        console.error("[Cast] Session request error:", error);
                    }
                }
            );
        } catch (e) {
            console.error("[Cast] requestSession failed:", e);
        }
    }

    /**
     * Load media to the Cast device
     */
    public loadMedia(song: any) {
        if (!audioState.isCasting || !this.initialized) return;

        try {
            const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
            if (!castSession) {
                console.warn("[Cast] No active session");
                return;
            }

            // Build audio URL (Use internal proxy to bypass CORS/Strict Origin policies on Cast)
            // We route through /api/audio/[id] which adds Access-Control-Allow-Origin: *
            const songId = song.music_id || song.Id;
            const audioUrl = `${window.location.origin}/api/audio/${songId}`;
            this.lastContentId = audioUrl;

            // Validate URL is HTTPS (Cast requires secure URLs)
            const url = new URL(audioUrl);
            if (url.protocol !== "https:" && url.hostname !== "localhost") {
                console.error("[Cast] contentId must be HTTPS:", audioUrl);
                this.showCastError("Cast requires HTTPS audio URLs", audioUrl);
                return;
            }

            const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, "audio/mpeg");

            // CRITICAL: Set streamType to BUFFERED for proper Cast playback
            mediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED;

            // Set up metadata
            mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
            mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
            mediaInfo.metadata.title = song.title || "Unknown Title";
            mediaInfo.metadata.artist = song.artist || "Smol AI Music";

            // Cover image
            let imageUrl = "/meta.png";
            if (song.image_url) imageUrl = song.image_url;
            else if (song.id || song.Id) imageUrl = `https://api.smol.xyz/image/${song.id || song.Id}.png`;

            mediaInfo.metadata.images = [new chrome.cast.Image(imageUrl)];

            // Load request
            const request = new chrome.cast.media.LoadRequest(mediaInfo);
            request.autoplay = true;
            request.currentTime = 0;

            if (CAST_DEBUG) {
                console.log("[Cast] Load request:", {
                    contentId: audioUrl,
                    contentType: mediaInfo.contentType,
                    streamType: mediaInfo.streamType,
                    autoplay: request.autoplay,
                    currentTime: request.currentTime,
                    metadata: {
                        title: mediaInfo.metadata.title,
                        artist: mediaInfo.metadata.artist,
                        images: mediaInfo.metadata.images
                    }
                });
            }

            castSession.loadMedia(request).then(
                () => {
                    console.log("[Cast] Media loaded successfully");
                    // Pause local audio
                    if (audioState.audioElement) {
                        audioState.audioElement.pause();
                    }
                },
                (errorCode: any) => {
                    console.error("[Cast] Load error:", errorCode);
                    console.error("[Cast] Failed contentId:", audioUrl);
                    console.error("[Cast] contentId host:", url.host);
                    this.showCastError(`Failed to load media (error: ${errorCode})`, audioUrl);
                }
            );
        } catch (e) {
            console.error("[Cast] loadMedia failed:", e);
            if (this.lastContentId) {
                this.showCastError("Exception during media load", this.lastContentId);
            }
        }
    }

    /**
     * Toggle play/pause on Cast device
     */
    public playPause() {
        if (!this.playerController) return;
        this.playerController.playOrPause();
    }

    /**
     * Play on Cast device
     */
    public play() {
        if (!this.playerController || !this.player) return;
        // Only toggle if currently paused
        if (this.player.isPaused) {
            this.playerController.playOrPause();
        }
    }

    /**
     * Pause on Cast device
     */
    public pause() {
        if (!this.playerController || !this.player) return;
        // Only toggle if currently playing
        if (!this.player.isPaused) {
            this.playerController.playOrPause();
        }
    }

    /**
     * Stop Cast session and disconnect
     */
    public stop() {
        if (!this.initialized) return;

        try {
            const context = cast.framework.CastContext.getInstance();
            context.endCurrentSession(true);
            audioState.isCasting = false;
        } catch (e) {
            console.error("[Cast] Stop failed:", e);
        }
    }

    /**
     * Check if Cast is available
     */
    public get isAvailable(): boolean {
        return this.initialized;
    }

    /**
     * Cast Diagnostics: Validate a media URL for Chromecast compatibility
     */
    public async diagnoseMediaUrl(contentId: string): Promise<void> {
        console.log("[Cast Diagnostics] Testing URL:", contentId);

        try {
            // Test 1: HEAD request
            console.log("[Cast Diagnostics] Test 1: HEAD request");
            const headResponse = await fetch(contentId, { method: "HEAD" });
            console.log("[Cast Diagnostics] HEAD Status:", headResponse.status);
            console.log("[Cast Diagnostics] Content-Type:", headResponse.headers.get("Content-Type"));
            console.log("[Cast Diagnostics] Content-Length:", headResponse.headers.get("Content-Length"));
            console.log("[Cast Diagnostics] Accept-Ranges:", headResponse.headers.get("Accept-Ranges"));
            console.log("[Cast Diagnostics] Cache-Control:", headResponse.headers.get("Cache-Control"));

            // Test 2: Range request (first byte)
            console.log("[Cast Diagnostics] Test 2: Range request (bytes=0-1)");
            const rangeResponse = await fetch(contentId, {
                method: "GET",
                headers: { "Range": "bytes=0-1" }
            });
            console.log("[Cast Diagnostics] Range Status:", rangeResponse.status);
            console.log("[Cast Diagnostics] Content-Range:", rangeResponse.headers.get("Content-Range"));
            console.log("[Cast Diagnostics] Accept-Ranges:", rangeResponse.headers.get("Accept-Ranges"));

            // Validation results
            const contentType = headResponse.headers.get("Content-Type");
            const acceptRanges = rangeResponse.headers.get("Accept-Ranges");
            const rangeStatus = rangeResponse.status;

            console.log("\n[Cast Diagnostics] === VALIDATION RESULTS ===");
            console.log(`✓ HEAD returns 200: ${headResponse.status === 200}`);
            console.log(`✓ Content-Type is audio/*: ${contentType?.startsWith("audio/")}`);
            console.log(`✓ Range request returns 206: ${rangeStatus === 206}`);
            console.log(`✓ Accept-Ranges: bytes: ${acceptRanges === "bytes"}`);

            if (headResponse.status === 200 && contentType?.startsWith("audio/") &&
                rangeStatus === 206 && acceptRanges === "bytes") {
                console.log("[Cast Diagnostics] ✅ URL is Chromecast-compatible");
            } else {
                console.error("[Cast Diagnostics] ❌ URL has compatibility issues");
            }

        } catch (error) {
            console.error("[Cast Diagnostics] Test failed:", error);
        }
    }
}

export const castService = new CastService();
