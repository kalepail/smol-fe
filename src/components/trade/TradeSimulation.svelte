<script lang="ts">
  import Loader from '../ui/Loader.svelte';

  interface Props {
    mode: 'buy' | 'sell';
    lastSimulatedMode: 'buy' | 'sell';
    simulatedDisplay: string;
    simulationLoading: boolean;
    simulationError: string | null;
    kaleSymbol: string;
    displayTokenName: string;
  }

  let {
    mode,
    lastSimulatedMode,
    simulatedDisplay,
    simulationLoading,
    simulationError,
    kaleSymbol,
    displayTokenName,
  }: Props = $props();
</script>

<div class="rounded border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
  <div class="flex items-center justify-between">
    <span>Simulated {mode === 'buy' ? displayTokenName : kaleSymbol} received:</span>
    {#if simulationLoading}
      <Loader classNames=" text-lime-400 w-5 h-5" />
    {:else}
      <span class="font-semibold text-lime-300">{simulatedDisplay}</span>
    {/if}
  </div>
  {#if lastSimulatedMode !== mode}
    <div class="mt-1 text-xs text-slate-400">
      Re-run simulation after switching modes.
    </div>
  {/if}
  {#if simulationError}
    <div
      class="mt-2 rounded border border-rose-500 bg-rose-500/10 p-2 text-xs text-rose-200"
    >
      {simulationError}
    </div>
  {/if}
</div>
