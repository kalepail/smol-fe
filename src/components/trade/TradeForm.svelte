<script lang="ts">
  interface Props {
    mode: 'buy' | 'sell';
    inputAmount: string;
    sellDisabled: boolean;
    kaleSymbol: string;
    displayTokenName: string;
    onModeChange: (mode: 'buy' | 'sell') => void;
    onAmountInput: (event: Event) => void;
  }

  let {
    mode,
    inputAmount,
    sellDisabled,
    kaleSymbol,
    displayTokenName,
    onModeChange,
    onAmountInput,
  }: Props = $props();
</script>

<div class="mb-4 flex gap-2">
  <button
    class={`flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors ${
      mode === 'buy'
        ? 'bg-lime-500 text-slate-900'
        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
    }`}
    onclick={() => onModeChange('buy')}
    disabled={mode === 'buy'}
  >
    Buy
  </button>
  <button
    class={`flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors ${
      mode === 'sell' && !sellDisabled
        ? 'bg-rose-400 text-slate-900'
        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
    } ${sellDisabled ? 'opacity-50' : ''}`}
    onclick={() => onModeChange('sell')}
    disabled={sellDisabled}
  >
    Sell
  </button>
</div>

{#if sellDisabled}
  <p class="mb-4 text-xs text-slate-400">
    You don't hold any {displayTokenName} yet, so selling is disabled.
  </p>
{/if}

<div class="space-y-4">
  <label class="block text-sm font-medium">
    Amount to {mode === 'buy' ? 'spend' : 'sell'}
    <input
      class="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-base focus:border-lime-500 focus:outline-none"
      type="text"
      inputmode="decimal"
      placeholder={mode === 'buy'
        ? `0.0 ${kaleSymbol}`
        : `0.0 ${displayTokenName}`}
      value={inputAmount}
      oninput={onAmountInput}
      autocomplete="off"
    />
  </label>
</div>
