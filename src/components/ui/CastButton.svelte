<script lang="ts">
    import { audioState } from "../../stores/audio.svelte.ts";
    import { castService } from "../../services/cast";

    interface Props {
        classNames?: string;
        size?: number;
    }

    let { classNames = "", size = 20 }: Props = $props();
</script>

{#if audioState.isCastAvailable}
    <button
        class="flex items-center justify-center transition-colors relative z-[9999] cursor-pointer {classNames} {audioState.isCasting
            ? 'text-[#4285F4]'
            : 'text-slate-400 hover:text-white'}"
        onclick={(e) => {
            e.stopPropagation();
            castService.requestSession();
        }}
        ontouchend={(e) => {
            e.preventDefault();
            e.stopPropagation();
            castService.requestSession();
        }}
        aria-label="Google Cast"
        title="Cast to device"
    >
        <!-- Google Cast Icon -->
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            width={size}
            height={size}
        >
            <path
                d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
            />
        </svg>
    </button>
{/if}
