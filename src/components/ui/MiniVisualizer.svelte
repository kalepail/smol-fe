<script lang="ts">
    import { onMount } from "svelte";
    import { audioState } from "../../stores/audio.svelte.ts";
    import { preferences } from "../../stores/preferences.svelte.ts";

    // Oscillator State
    let lastDataArray: Float32Array | null = null;
    // Reusable typed array to avoid per-frame allocations (memory optimization)
    let dataArray: Uint8Array | null = null;
    const SMOOTHING = 0.12; // Smoother movement

    let canvas = $state<HTMLCanvasElement>();
    let ctx: CanvasRenderingContext2D | null = null;
    let animationId: number;

    function draw() {
        if (!canvas || !audioState.analyser) return;

        if (!ctx) {
            ctx = canvas.getContext("2d");
            if (!ctx) return;
        }

        const bufferLength = audioState.analyser.frequencyBinCount;

        // Reuse typed arrays instead of allocating new ones every frame
        if (!dataArray || dataArray.length !== bufferLength) {
            dataArray = new Uint8Array(bufferLength);
        }
        audioState.analyser.getByteTimeDomainData(dataArray as any);

        // Initialize smoothing buffer
        if (!lastDataArray || lastDataArray.length !== bufferLength) {
            lastDataArray = new Float32Array(bufferLength).fill(128);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2.5;
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0.1, "#10b981");
        gradient.addColorStop(0.5, "#a855f7");
        gradient.addColorStop(0.9, "#f97316");

        ctx.strokeStyle = gradient;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        const centerY = canvas.height / 2;
        const BOOST = 1.5;

        for (let i = 0; i < bufferLength; i++) {
            const currentVal = dataArray[i];
            lastDataArray[i] += (currentVal - lastDataArray[i]) * SMOOTHING;

            const v = (lastDataArray[i] - 128) / 128.0;
            const boostedV = v * (1 + Math.abs(v));
            const y = centerY + boostedV * (canvas.height / 2) * BOOST;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        ctx.lineTo(canvas.width, centerY);
        ctx.stroke();

        animationId = requestAnimationFrame(draw);
    }

    $effect(() => {
        // Only run visualizer in thinking mode (performance optimization)
        if (
            canvas &&
            audioState.analyser &&
            preferences.renderMode === "thinking"
        ) {
            draw();
        }

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    });
</script>

{#if preferences.renderMode === "thinking"}
    <canvas
        bind:this={canvas}
        width="300"
        height="150"
        class="w-full h-full object-cover"
    ></canvas>
{/if}
