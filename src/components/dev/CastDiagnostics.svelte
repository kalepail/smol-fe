<script lang="ts">
    import { castService } from "../../services/cast";
    import { audioState } from "../../stores/audio.svelte";

    let testUrl = $state("");
    let isRunning = $state(false);

    async function runDiagnostics() {
        const urlToTest = testUrl || getCurrentAudioUrl();
        if (!urlToTest) {
            alert("No URL to test. Please enter a URL or play a song.");
            return;
        }

        isRunning = true;
        console.log("\n=== CAST DIAGNOSTICS ===");
        await castService.diagnoseMediaUrl(urlToTest);
        console.log("=== END DIAGNOSTICS ===\n");
        isRunning = false;
    }

    function getCurrentAudioUrl(): string {
        if (audioState.currentSong) {
            const songId = audioState.currentSong.Id;
            return `${window.location.origin}/api/audio/${songId}`;
        }
        return "";
    }

    function printCurrentState() {
        console.log("=== CAST STATE ===");
        console.log("Is Casting:", audioState.isCasting);
        console.log("Current Song:", audioState.currentSong);
        console.log("Audio URL:", getCurrentAudioUrl());
        console.log("Cast Available:", castService.isAvailable);
    }

    function toggleDebugMode() {
        const current = localStorage.getItem("CAST_DEBUG") === "true";
        localStorage.setItem("CAST_DEBUG", (!current).toString());
        alert(`CAST_DEBUG ${!current ? "enabled" : "disabled"}. Reload the page for changes to take effect.`);
    }

    const debugEnabled = typeof window !== "undefined" && localStorage.getItem("CAST_DEBUG") === "true";
</script>

<div class="fixed bottom-4 right-4 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-lg max-w-sm z-50">
    <h3 class="text-white font-bold mb-3 text-sm">Cast Diagnostics</h3>

    <div class="space-y-2">
        <div>
            <label class="text-xs text-slate-300 block mb-1">Test URL (leave empty for current song):</label>
            <input
                type="text"
                bind:value={testUrl}
                placeholder={getCurrentAudioUrl() || "Enter audio URL"}
                class="w-full px-2 py-1 text-xs bg-slate-700 text-white border border-slate-600 rounded"
            />
        </div>

        <button
            onclick={runDiagnostics}
            disabled={isRunning}
            class="w-full px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded transition-colors"
        >
            {isRunning ? "Running..." : "Run Diagnostics (check console)"}
        </button>

        <button
            onclick={printCurrentState}
            class="w-full px-3 py-2 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
        >
            Print Cast State
        </button>

        <button
            onclick={toggleDebugMode}
            class="w-full px-3 py-2 text-xs rounded transition-colors {debugEnabled
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-600 hover:bg-slate-500'} text-white"
        >
            {debugEnabled ? "✓ Debug Mode ON" : "Debug Mode OFF"}
        </button>

        <div class="text-xs text-slate-400 pt-2 border-t border-slate-700">
            <p>Current Song: {audioState.currentSong?.Title || "None"}</p>
            <p>Casting: {audioState.isCasting ? "Yes" : "No"}</p>
        </div>
    </div>
</div>
