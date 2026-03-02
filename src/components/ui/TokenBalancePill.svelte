<script lang="ts">
    import { abbreviateNumber } from "../../utils/balance";

    interface Props {
        balance?: bigint;
        classNames?: string;
    }

    let { balance = 0n, classNames = "" }: Props = $props();
</script>

{#if balance > 0n}
    <span
        class="text-[8px] md:text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-md font-pixel uppercase tracking-wide border border-sky-500/20 {classNames}"
    >
        {abbreviateNumber(balance)}
    </span>
{/if}
