<script lang="ts">
    import { abbreviateNumber } from "../../utils/balance";

    interface Props {
        balance?: bigint;
        classNames?: string;
    }

    let { balance = 0n, classNames = "" }: Props = $props();
</script>

{#if balance > 0n}
    <span class="text-[10px] bg-sky-400/20 text-sky-300 px-1.5 py-0.5 rounded-full font-medium {classNames}">
        {abbreviateNumber(balance)}
    </span>
{/if}
