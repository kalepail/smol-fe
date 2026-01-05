<script lang="ts">
    import { onMount } from "svelte";
    import { audioState } from "../../stores/audio.svelte";

    // Oscillator State
    let lastDataArray: Float32Array | null = null;
    const SMOOTHING = 0.12; // Smoother movement

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null = null;
    let animationId: number;

    function draw() {
        if (!canvas || !audioState.analyser) {
            animationId = requestAnimationFrame(draw);
            return;
        }

        if (!ctx) {
            ctx = canvas.getContext("2d");
            if (!ctx) return;
        }

        const bufferLength = audioState.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audioState.analyser.getByteTimeDomainData(dataArray); // Use Time Domain for Waveform

        // Initialize smoothing buffer
        if (!lastDataArray || lastDataArray.length !== bufferLength) {
            lastDataArray = new Float32Array(bufferLength).fill(128);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.lineWidth = 2.5; // Slightly thicker
        // Create Gradient: Green -> Purple -> Orange
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

        // Boost for small display
        const BOOST = 1.5;

        // Draw Loop
        for (let i = 0; i < bufferLength; i++) {
            const currentVal = dataArray[i];

            // Temporal Smoothing
            lastDataArray[i] += (currentVal - lastDataArray[i]) * SMOOTHING;

            const v = (lastDataArray[i] - 128) / 128.0;
            // Simple non-linear boost
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

    // Resize observer to handle container size changes if needed
    // For now, fixed internal resolution of 128x64 is plenty for 64px display output
    // but the canvas bind width/height is 64x32 in markup.

    onMount(() => {
        animationId = requestAnimationFrame(draw);
        return () => {
            cancelAnimationFrame(animationId);
        };
    });
</script>

<canvas
    bind:this={canvas}
    width="300"
    height="150"
    class="w-full h-full object-cover"
></canvas>
