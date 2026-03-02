<script lang="ts">
    import StorePolicyModal from "./StorePolicyModal.svelte";

    let showPolicy = $state(false);

    $effect(() => {
        // Show policy modal if user hasn't seen it yet
        if (typeof window !== "undefined") {
            const seen = localStorage.getItem("smolmart_policy_seen");
            if (!seen) {
                showPolicy = true;
            }
        }
    });

    function openPolicy() {
        showPolicy = true;
    }
</script>

<button
    class="fixed bottom-24 right-4 z-50 w-10 h-10 bg-[#9ae600] text-black font-black text-lg border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:scale-110 transition-transform"
    onclick={openPolicy}
    title="Store Policy"
>
    ?
</button>

<StorePolicyModal bind:open={showPolicy} />
