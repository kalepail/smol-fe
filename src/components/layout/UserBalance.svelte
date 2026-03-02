<script lang="ts">
  import Loader from "../ui/Loader.svelte";
  import { formatKaleBalanceWithSuffix } from "../../utils/kaleFormatting";

  interface Props {
    contractId: string;
    balance: bigint | null;
    loading: boolean;
  }

  let { contractId, balance, loading }: Props = $props();

  let copied = $state(false);
  let copiedTimeout: ReturnType<typeof setTimeout> | null = null;

  function copyToClipboard() {
    navigator.clipboard.writeText(contractId);
    copied = true;
    // Clear any existing timeout to prevent accumulation
    if (copiedTimeout) clearTimeout(copiedTimeout);
    copiedTimeout = setTimeout(() => {
      copied = false;
      copiedTimeout = null;
    }, 2000);
  }
</script>

<div class="flex items-center gap-2 font-pixel tracking-wider text-[10px]">
  <a
    class="hover:text-[#9ae600] transition-colors"
    href="https://stellar.expert/explorer/public/contract/{contractId}"
    target="_blank">{contractId.slice(0, 2)}...{contractId.slice(-2)}</a
  >
  <button
    onclick={copyToClipboard}
    class="hover:bg-white/10 rounded p-1 transition-colors"
    aria-label="Copy contract ID"
  >
    {#if copied}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="w-3 h-3"
      >
        <path
          fill-rule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clip-rule="evenodd"
        />
      </svg>
    {:else}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="w-3 h-3"
      >
        <path
          d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z"
        />
        <path
          d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z"
        />
      </svg>
    {/if}
  </button>
</div>
<a
  class="text-lime-500 bg-lime-500/20 border-2 border-lime-500 hover:bg-lime-500/30 rounded-sm px-2 py-1 flex items-center justify-center min-w-[80px] font-pixel tracking-wider text-[10px]"
  href="/account"
>
  {#if loading}
    <Loader classNames="w-3 h-3" textColor="text-lime-500" />
  {:else if balance !== null}
    {formatKaleBalanceWithSuffix(balance)}
  {:else}
    <span class="opacity-50">--- KALE</span>
  {/if}
</a>
