/**
 * Google Cast Integration Service
 * 
 * Enables casting audio playback to Chromecast devices.
 * Uses Cast Application Framework (CAF) for modern Cast integration.
 */

import { audioState } from "../stores/audio.svelte";

declare const chrome: any;
declare const cast: any;

class CastService {
    private initialized = false;
    private player: any = null;
    private playerController: any = null;

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

            // Initialize Cast Context (CAF approach)
            cast.framework.CastContext.getInstance().setOptions({
                receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
                autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
            });

            this.initialized = true;
            console.log("[Cast] Initialized with CastContext");

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

            // Sync play/pause state from remote
            this.playerController.addEventListener(
                cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
                () => {
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

        } catch (e) {
            console.error("[Cast] Initialization failed:", e);
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

            const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, "audio/mp3");

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

            castSession.loadMedia(request).then(
                () => {
                    console.log("[Cast] Media loaded successfully");
                    // Pause local audio
                    if (audioState.audioElement) {
                        audioState.audioElement.pause();
                    }
                },
                (errorCode: any) => console.error("[Cast] Load error:", errorCode)
            );
        } catch (e) {
            console.error("[Cast] loadMedia failed:", e);
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
}

export const castService = new CastService();
