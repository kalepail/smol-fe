<script lang="ts">
    interface Props {
        size?: string;
        class?: string;
    }

    let { size = "w-4 h-4", class: className = "" }: Props = $props();
</script>

<img
    src="https://em-content.zobj.net/source/apple/354/leafy-green_1f96c.png"
    alt="🥬"
    class="{size} inline-block object-contain {className}"
/>
