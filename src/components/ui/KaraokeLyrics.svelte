<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    interface Props {
        text: string;
        speed?: number;
    }

    let { text = "", speed = 50 } = $props();

    let displayedText = $state("");
    let container: HTMLDivElement;
    let interval: any;

    // Use a derived or effect to reset when text input changes
    $effect(() => {
        if (text) {
            startTyping(text);
        }
    });

    function startTyping(fullText: string) {
        clearInterval(interval);
        displayedText = "";
        let i = 0;

        interval = setInterval(() => {
            if (i < fullText.length) {
                displayedText += fullText.charAt(i);
                i++;
                // maintain scroll
                if (container) container.scrollTop = container.scrollHeight;
            } else {
                clearInterval(interval);
            }
        }, speed);
    }

    onDestroy(() => {
        clearInterval(interval);
    });
</script>

<div
    bind:this={container}
    class="font-pixel text-xs sm:text-sm text-slate-200 leading-loose whitespace-pre-wrap h-full overflow-y-auto pr-2 tracking-wide"
>
    {displayedText}
    <span
        class="animate-pulse inline-block w-2 h-4 bg-lime-400 ml-1 align-middle"
    ></span>
</div>
