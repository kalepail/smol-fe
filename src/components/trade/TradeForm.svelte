<script lang="ts">
  import SegmentedControl from '../ui/SegmentedControl.svelte';

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

  const options = $derived([
    { value: 'buy' as const, label: 'Buy' },
    {
      value: 'sell' as const,
      label: 'Sell',
      disabled: sellDisabled,
      disabledReason: `You do not hold any ${displayTokenName} to sell.`,
    },
  ]);
</script>

<div class="space-y-4">
  <SegmentedControl
    name="trade-mode"
    legend="Trade direction"
    {options}
    value={mode}
    onChange={onModeChange}
  />

  {#if sellDisabled}
    <p class="text-xs text-ink-2">
      You do not hold any {displayTokenName} yet, so selling is unavailable.
    </p>
  {/if}

  <label class="block">
    <span class="mb-1.5 block text-sm font-medium text-ink-2">
      Amount to {mode === 'buy' ? 'spend' : 'sell'}
    </span>
    <input
      class="input-ring tabular min-h-12 w-full rounded-[var(--radius-control)] bg-surface-1 px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
      type="text"
      inputmode="decimal"
      placeholder={mode === 'buy' ? `0.0 ${kaleSymbol}` : `0.0 ${displayTokenName}`}
      value={inputAmount}
      oninput={onAmountInput}
      autocomplete="off"
    />
  </label>
</div>
