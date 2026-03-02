<script lang="ts">
    import { onMount } from "svelte";

    let videoFile: File | null = $state(null);
    let videoSrc: string | null = $state(null);
    let videoRef: HTMLVideoElement;
    let canvasRef: HTMLCanvasElement;
    let extractedImage: string | null = $state(null);
    let isProcessing = $state(false);

    // Check for native share support (Mobile)
    let canShare = false;
    onMount(() => {
        canShare = !!navigator.share;
    });

    const handleFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
            videoFile = target.files[0];
            videoSrc = URL.createObjectURL(videoFile);
            extractedImage = null;
            isProcessing = true;
        }
    };

    const onMetadataLoaded = async () => {
        if (!videoRef) return;

        // Wait for valid duration (Address the "First Frame" bug)
        let attempts = 0;
        while (
            (isNaN(videoRef.duration) || videoRef.duration === Infinity) &&
            attempts < 50
        ) {
            await new Promise((r) => setTimeout(r, 100));
            attempts++;
        }

        const duration = videoRef.duration;
        // Fallback: If duration is still weird, we can't seek to end.
        if (isNaN(duration) || duration === Infinity) {
            console.error("[LastFrame] Could not determine video duration");
            isProcessing = false;
            return;
        }

        const targetTime = Math.max(0, duration - 0.1); // Seek slightly earlier to avoid EOF glitches

        if (videoRef.readyState < 2) {
            await new Promise((r) => {
                const onLoaded = () => {
                    videoRef.removeEventListener("loadeddata", onLoaded);
                    r(true);
                };
                videoRef.addEventListener("loadeddata", onLoaded);
            });
        }

        videoRef.currentTime = targetTime;

        await new Promise((r) => {
            const onSeek = () => {
                videoRef.removeEventListener("seeked", onSeek);
                r(true);
            };
            videoRef.addEventListener("seeked", onSeek);
        });

        // Small delay to ensure frame is actually rendered
        await new Promise((r) => setTimeout(r, 150));

        if (canvasRef) {
            canvasRef.width = videoRef.videoWidth;
            canvasRef.height = videoRef.videoHeight;
            const ctx = canvasRef.getContext("2d");
            ctx?.drawImage(videoRef, 0, 0, canvasRef.width, canvasRef.height);
            extractedImage = canvasRef.toDataURL("image/png");
            isProcessing = false;
        }
    };

    const downloadImage = () => {
        if (!extractedImage) return;
        const a = document.createElement("a");
        a.href = extractedImage;
        a.download = `${videoFile?.name?.split(".")[0] || "video"}-last-frame.png`;
        a.click();
    };

    const copyImage = async () => {
        if (!canvasRef) return;
        try {
            canvasRef.toBlob(async (blob) => {
                if (!blob) return;
                await navigator.clipboard.write([
                    new ClipboardItem({ "image/png": blob }),
                ]);
                alert("Copied frame to clipboard!");
            });
        } catch (err) {
            console.error("Failed to copy", err);
            alert("Clipboard not supported. Use Share or Download.");
        }
    };

    const shareImage = async () => {
        if (!canvasRef || !videoFile) return;
        canvasRef.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], "last-frame.png", {
                type: "image/png",
            });
            if (navigator.share) {
                try {
                    await navigator.share({
                        files: [file],
                        title: "Last Frame",
                        text: "Extracted via Smol Labs",
                    });
                } catch (err) {
                    console.log("Share cancelled or failed", err);
                }
            }
        });
    };

    const reset = () => {
        videoFile = null;
        videoSrc = null;
        extractedImage = null;
    };
</script>

<div class="font-pixel text-[#9ae600] space-y-8">
    {#if !videoSrc}
        <!-- Upload Zone -->
        <div
            class="border-2 border-dashed border-[#333] rounded-xl p-12 md:p-24 text-center hover:border-[#9ae600] transition-colors cursor-pointer relative group bg-[#050505]"
        >
            <input
                type="file"
                accept="video/*"
                on:change={handleFileChange}
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div class="space-y-6 pointer-events-none">
                <div
                    class="text-5xl md:text-7xl group-hover:scale-110 transition-transform duration-300"
                >
                    📼
                </div>
                <div>
                    <h3
                        class="text-xl md:text-2xl uppercase tracking-[0.2em] mb-2"
                    >
                        Tap / Drop Video
                    </h3>
                    <p class="text-[#555] text-[10px] md:text-xs">
                        Instant Final Frame Capture
                    </p>
                    <p class="text-[#333] text-[8px] mt-2 uppercase">
                        Works on iOS • Android • Desktop
                    </p>
                </div>
            </div>
        </div>
    {:else}
        <!-- Processing / Result View -->
        <div
            class="border border-[#333] rounded-xl p-4 md:p-8 bg-[#050505] flex flex-col items-center justify-center min-h-[400px]"
        >
            <!-- Hidden Video Element for Processing -->
            <!-- svelte-ignore a11y-media-has-caption -->
            <video
                bind:this={videoRef}
                src={videoSrc}
                class="hidden"
                on:loadedmetadata={onMetadataLoaded}
                muted
                playsinline
                autoplay
            ></video>
            <canvas bind:this={canvasRef} class="hidden"></canvas>

            {#if isProcessing}
                <div class="flex flex-col items-center animate-pulse gap-4">
                    <div
                        class="w-12 h-12 border-4 border-[#333] border-t-[#9ae600] rounded-full animate-spin"
                    ></div>
                    <p
                        class="text-[#9ae600] uppercase tracking-widest text-sm"
                    >
                        Targeting End...
                    </p>
                </div>
            {:else if extractedImage}
                <div
                    class="w-full max-w-4xl space-y-6 animate-in fade-in duration-500"
                >
                    <div
                        class="relative group border border-[#222] rounded-lg overflow-hidden bg-black/50 shadow-2xl shadow-black"
                    >
                        <img
                            src={extractedImage}
                            alt="Last frame"
                            class="w-full h-auto object-contain"
                        />
                        <div
                            class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none"
                        ></div>
                    </div>

                    <div
                        class="flex flex-wrap items-center justify-center gap-4"
                    >
                        <button
                            on:click={reset}
                            class="px-4 py-3 rounded border border-[#333] text-[#777] hover:text-[#bbb] hover:border-[#555] transition-all text-xs uppercase tracking-widest flex-1 md:flex-none"
                        >
                            Restart
                        </button>

                        {#if canShare}
                            <button
                                on:click={shareImage}
                                class="px-4 py-3 rounded border border-[#9ae600] text-[#9ae600] hover:bg-[#9ae600]/10 transition-all text-sm uppercase tracking-widest flex-1 md:flex-none"
                            >
                                Share / Save
                            </button>
                        {:else}
                            <button
                                on:click={copyImage}
                                class="px-4 py-3 rounded border border-[#9ae600] text-[#9ae600] hover:bg-[#9ae600]/10 transition-all text-sm uppercase tracking-widest flex-1 md:flex-none"
                            >
                                Copy
                            </button>
                        {/if}

                        <button
                            on:click={downloadImage}
                            class="bg-[#9ae600] text-black px-6 py-3 rounded font-bold hover:bg-[#b0ff00] hover:scale-105 transition-all shadow-[0_0_20px_rgba(154,230,0,0.3)] text-sm uppercase tracking-widest flex-1 md:flex-none whitespace-nowrap"
                        >
                            Download PNG
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    {/if}
</div>
