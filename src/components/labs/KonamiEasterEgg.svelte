<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import confetti from "canvas-confetti";

    let activated = $state(false);
    let konamiIndex = $state(0);
    const konamiCode = [
        "ArrowUp",
        "ArrowUp",
        "ArrowDown",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowLeft",
        "ArrowRight",
        "b",
        "a",
    ];

    function handleKeyPress(e: KeyboardEvent) {
        if (activated) return;

        const expectedKey = konamiCode[konamiIndex];
        if (e.key === expectedKey) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                activateEasterEgg();
            }
        } else {
            konamiIndex = 0;
        }
    }

    function activateEasterEgg() {
        activated = true;

        // Epic confetti explosion!
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

        function randomInRange(min: number, max: number) {
            return Math.random() * (max - min) + min;
        }

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                colors: ['#9ae600', '#f91880', '#FDDA24', '#fff', '#00ffff']
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                colors: ['#9ae600', '#f91880', '#FDDA24', '#fff', '#00ffff']
            });
        }, 250);

        // Play a hidden smol song!
        const audio = new Audio('https://api.smol.xyz/song/random.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});

        // Reset after showing
        setTimeout(() => {
            activated = false;
            konamiIndex = 0;
        }, 5000);
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeyPress);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeyPress);
    });
</script>

{#if activated}
    <div class="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center">
        <div class="animate-in zoom-in fade-in duration-500">
            <div class="bg-gradient-to-r from-[#9ae600] via-[#f91880] to-[#FDDA24] p-1 rounded-2xl animate-pulse">
                <div class="bg-black px-12 py-8 rounded-2xl flex flex-col items-center gap-4">
                    <span class="text-6xl animate-bounce">🎮</span>
                    <h2 class="text-3xl font-black font-pixel text-white tracking-wider">
                        KONAMI CODE!
                    </h2>
                    <p class="text-sm text-[#9ae600] font-pixel">
                        You've unlocked the secret smol vibes!
                    </p>
                    <div class="flex gap-2 text-xs text-[#555] font-pixel">
                        <span>↑↑↓↓←→←→BA</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}
