<script lang="ts">
  import { abbreviateNumber } from '../../utils/balance';

  interface Props {
    balance?: bigint;
    classNames?: string;
  }

  let { balance = 0n, classNames = '' }: Props = $props();
</script>

{#if balance > 0n}
  <span class={`tabular inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-ink-1 ring-1 ring-inset ring-line-strong ${classNames}`}>
    {abbreviateNumber(balance)}
  </span>
{/if}
