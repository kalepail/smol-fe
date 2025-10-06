<script lang="ts">
  import Loader from '../ui/Loader.svelte';
  import { formatKaleBalanceWithSuffix } from '../../utils/kaleFormatting';

  interface Props {
    contractId: string;
    balance: bigint | null;
    loading: boolean;
  }

  let { contractId, balance, loading }: Props = $props();
</script>

<a
  class="font-mono text-sm underline"
  href="https://stellar.expert/explorer/public/contract/{contractId}"
  target="_blank"
  >{contractId.slice(0, 4)}...{contractId.slice(-4)}</a
>
<a
  class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded-full px-2 py-1 flex items-center justify-center min-w-[80px]"
  href="/account"
>
  {#if loading}
    <Loader classNames="w-4 h-4" textColor="text-lime-500" />
  {:else if balance !== null}
    {formatKaleBalanceWithSuffix(balance)}
  {/if}
</a>
