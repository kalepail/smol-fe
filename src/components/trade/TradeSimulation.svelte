<script lang="ts">
  import Loader from '../ui/Loader.svelte';
  import Button from '../ui/Button.svelte';

  interface Props {
    mode: 'buy' | 'sell';
    lastSimulatedMode: 'buy' | 'sell';
    simulatedDisplay: string;
    /** Exact on-chain floor (quote − 1%) the swap will carry; null without a quote. */
    minimumReceivedDisplay: string | null;
    /** Pool refused the last swap below the floor; the quote was refreshed. */
    requoteNotice: string | null;
    /** Reserve re-read after a rejection failed: trading paused until Retry succeeds. */
    reserveRefreshFailed: string | null;
    /** Reserve re-read after a rejection is in flight (no quote shown meanwhile). */
    reserveRefreshing: boolean;
    onRetryReserveRefresh: () => void;
    simulationLoading: boolean;
    simulationError: string | null;
    kaleSymbol: string;
    displayTokenName: string;
  }

  let {
    mode,
    lastSimulatedMode,
    simulatedDisplay,
    minimumReceivedDisplay,
    requoteNotice,
    reserveRefreshFailed,
    reserveRefreshing,
    onRetryReserveRefresh,
    simulationLoading,
    simulationError,
    kaleSymbol,
    displayTokenName,
  }: Props = $props();
</script>

<div class="rounded border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
  <div class="flex items-center justify-between">
    <span>Simulated {mode === 'buy' ? displayTokenName : kaleSymbol} received:</span>
    {#if simulationLoading || reserveRefreshing}
      <Loader classNames=" text-lime-400 w-5 h-5" />
    {:else}
      <span class="font-semibold text-lime-300">{simulatedDisplay}</span>
    {/if}
  </div>
  {#if minimumReceivedDisplay && !simulationLoading}
    <div class="mt-1 flex items-center justify-between text-xs text-slate-400" data-minimum-received>
      <span>Minimum received <span class="text-slate-500">(1% max slippage)</span>:</span>
      <span class="font-medium text-slate-200">{minimumReceivedDisplay} {mode === 'buy' ? displayTokenName : kaleSymbol}</span>
    </div>
  {/if}
  {#if reserveRefreshing}
    <div class="mt-1 text-xs text-slate-400" data-reserve-refreshing>Refreshing prices…</div>
  {/if}
  {#if reserveRefreshFailed}
    <div
      role="alert"
      data-reserve-refresh-failed
      class="mt-2 flex items-start justify-between gap-3 rounded border border-rose-500 bg-rose-500/10 p-2 text-xs text-rose-200"
    >
      <span>{reserveRefreshFailed}</span>
      <Button variant="secondary" size="sm" onclick={onRetryReserveRefresh}>Retry</Button>
    </div>
  {/if}
  {#if requoteNotice}
    <div
      role="alert"
      data-requote-notice
      class="mt-2 rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs text-amber-100"
    >
      {requoteNotice}
    </div>
  {/if}
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
