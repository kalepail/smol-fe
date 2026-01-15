import { audioState } from "../stores/audio.svelte";

declare const chrome: any;
declare const cast: any;

class CastService {
    private initialized = false;
    private player: any = null;
    private playerController: any = null;

    constructor() {
        if (typeof window !== "undefined") {
            // @ts-ignore
            window["__onGCastApiAvailable"] = (isAvailable: boolean) => {
                if (isAvailable) {
                    this.initializeCastApi();
                }
            };
        }
    }

    private initializeCastApi() {
        if (this.initialized) return;

        const sessionRequest = new chrome.cast.SessionRequest(
            chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
        );

        const apiConfig = new chrome.cast.ApiConfig(
            sessionRequest,
            this.sessionListener.bind(this),
            this.receiverListener.bind(this)
        );

        chrome.cast.initialize(
            apiConfig,
            () => {
                console.log("[Cast] Initialized");
                this.initialized = true;
            },
            (e: any) => console.error("[Cast] Init Error", e)
        );
    }

    private sessionListener(session: any) {
        console.log("[Cast] Session started", session.sessionId);
        audioState.isCasting = true;
        this.setupRemotePlayer(session);
    }

    private receiverListener(e: string) {
        if (e === "available") {
            console.log("[Cast] Receiver available");
        }
    }

    private setupRemotePlayer(session: any) {
        // Initialize Remote Player Controller
        this.player = new cast.framework.RemotePlayer();
        this.playerController = new cast.framework.RemotePlayerController(this.player);

        this.playerController.addEventListener(
            cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
            () => {
                const isConnected = this.player.isConnected;
                console.log("[Cast] Connection changed:", isConnected);
                audioState.isCasting = isConnected;

                if (!isConnected) {
                    // Disconnected
                    this.player = null;
                    this.playerController = null;
                } else {
                    // Connected - Load current media if playing locally
                    if (audioState.currentSong) {
                        this.loadMedia(audioState.currentSong);
                    }
                }
            }
        );

        // Sync Play/Pause state from Remote to Local Store
        this.playerController.addEventListener(
            cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
            () => {
                if (this.player.isPaused) {
                    // Remote paused -> ensure local state reflects pause (playingId = null)
                    if (audioState.playingId !== null) {
                        // We don't want to trigger a 'stop' command back to cast, just update UI
                        // But audioState.playingId logic implies "playing locally". 
                        // We might need to decouple slightly, but for now:
                        audioState.playingId = null;
                    }
                } else {
                    // Remote playing -> ensure local state reflects play
                    if (audioState.currentSong && audioState.playingId === null) {
                        audioState.playingId = audioState.currentSong.Id;
                        // Mute local audio element to prevent double audio
                        if (audioState.audioElement) {
                            audioState.audioElement.pause();
                        }
                    }
                }
            }
        );

        // Initial load if we just connected and have a song
        if (audioState.currentSong) {
            this.loadMedia(audioState.currentSong);
        }
    }

    public requestSession() {
        if (!this.initialized) {
            console.warn("[Cast] Not initialized");
            return;
        }
        chrome.cast.requestSession(
            this.sessionListener.bind(this),
            (e: any) => console.error("[Cast] Request Error", e)
        );
    }

    public loadMedia(song: any) {
        if (!audioState.isCasting) return;

        const session = chrome.cast.requestSession
            ? chrome.cast.framework.CastContext.getInstance().getCurrentSession()
            : null;

        // Fallback to legacy getSession if framework unavailable (though we loaded framework)
        // Standard chrome.cast approach:
        const legacySession = new Promise((resolve, reject) => {
            chrome.cast.requestSession(resolve, reject);
        });

        // But we already have a session from sessionListener? 
        // Actually, let's use the simplest way: functionality via SESSION object.

        // Getting current session via framework is safer
        const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
        if (!castSession) return;

        const mediaInfo = new chrome.cast.media.MediaInfo(
            (song.audio || `https://api.smol.xyz/song/${song.music_id || song.Id}.mp3`),
            'audio/mp3'
        );

        mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
        mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.MUSIC_TRACK;
        mediaInfo.metadata.title = song.title || "Unknown Title";
        mediaInfo.metadata.artist = "Smol AI Music";

        // Extract image
        let imageUrl = "/meta.png"; // Default
        if (song.image_url) imageUrl = song.image_url;
        else if (song.id || song.Id) imageUrl = `https://api.smol.xyz/image/${song.id || song.Id}.png`;

        mediaInfo.metadata.images = [new chrome.cast.Image(imageUrl)];

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;

        castSession.loadMedia(request).then(
            () => console.log('[Cast] Load success'),
            (errorCode: any) => console.error('[Cast] Load error', errorCode)
        );
    }

    // Commands
    public play() {
        if (!this.playerController) return;
        this.playerController.playOrPause();
    }

    public pause() {
        if (!this.playerController) return;
        this.playerController.playOrPause();
    }
}

export const castService = new CastService();

// Define a watcher to sync FROM local TO remote
// This needs to run in a component or effect, but since this is a module,
// we can't easily use $effect.root here without passing a cleanup.
// Better to expose methods and call them from the store or components.
