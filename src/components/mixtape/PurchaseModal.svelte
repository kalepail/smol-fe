<script lang="ts">
  import { estimateMixtapeCost } from '../../utils/mixtapePricing';
  import { formatKaleBalanceWithSuffix } from '../../utils/kaleFormatting';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    isOpen?: boolean;
    balancesLoading?: boolean;
    kaleBalance?: bigint | null;
    kaleBalanceLoading?: boolean;
    onRefreshKaleBalance?: () => void;
    tracksToMint?: Array<{ id: string; title: string }>;
    tracksToPurchase?: Array<{ id: string; title: string }>;
    isProcessing?: boolean;
    currentStep?: string;
    completedSteps?: Set<string>;
    onClose: () => void;
    onConfirm: () => void;
  }

  let {
    isOpen = false,
    balancesLoading = false,
    kaleBalance = null,
    kaleBalanceLoading = false,
    onRefreshKaleBalance,
    tracksToMint = [],
    tracksToPurchase = [],
    isProcessing = false,
    currentStep = '',
    completedSteps = new Set(),
    onClose,
    onConfirm,
  }: Props = $props();

  const quote = $derived(estimateMixtapeCost(tracksToMint.length, tracksToPurchase.length));
  const insufficientKale = $derived(
    kaleBalance !== null && kaleBalance < quote.requiredStroops
  );

  const steps = $derived([
    ...(tracksToMint.length > 0
      ? [
          {
            id: 'mint',
            label: `Mint ${tracksToMint.length} ${tracksToMint.length === 1 ? 'track' : 'tracks'}`,
            detail: `${quote.totalMintCost} KALE (${quote.mintBatches} ${quote.mintBatches === 1 ? 'signature' : 'signatures'})`,
            substeps: tracksToMint.map((t, i) => ({
              id: `mint-${t.id}`,
              label: `${i + 1}. ${t.title}`,
            })),
          },
        ]
      : []),
    ...(tracksToPurchase.length > 0
      ? [
          {
            id: 'purchase',
            label: `Purchase ${tracksToPurchase.length} ${tracksToPurchase.length === 1 ? 'track' : 'tracks'}`,
            detail: `~${quote.totalPurchaseCost} KALE (${quote.swapBatches} ${quote.swapBatches === 1 ? 'signature' : 'signatures'})`,
            substeps: tracksToPurchase.map((t, i) => ({
              id: `purchase-${t.id}`,
              label: `${i + 1}. ${t.title}`,
            })),
          },
        ]
      : []),
    {
      id: 'complete',
      label: 'Mixtape fully owned',
      detail: '',
    },
  ]);

  const hasWork = $derived(tracksToMint.length > 0 || tracksToPurchase.length > 0);
</script>

<Sheet
  open={isOpen}
  title="Buy mixtape"
  subtitle={balancesLoading ? 'Checking your track balances…' : hasWork ? 'Review estimate and wallet balance before signing' : 'You already own every track'}
  dismissible={!isProcessing}
  maxWidth="md"
  {onClose}
>
  {#if balancesLoading}
    <div class="flex flex-col items-center justify-center gap-3 py-10 text-sm text-ink-2">
      <Loader classNames="size-6" textColor="text-accent" />
      <span>Checking ownership on Stellar…</span>
    </div>
  {:else if !hasWork}
    <div class="flex flex-col items-center py-8 text-center">
      <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
        <Icon name="check" size={24} />
      </div>
      <p class="text-base font-semibold text-ink-1">All tracks owned</p>
      <p class="mt-1 text-sm text-ink-2">You already hold every track in this mixtape.</p>
    </div>
  {:else}
    <div class="space-y-4">
      <dl class="tabular grid grid-cols-2 gap-4 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
        <div>
          <dt class="text-xs text-ink-2">Estimated total</dt>
          <dd class="mt-0.5 text-lg font-semibold text-accent">~{quote.totalCost} KALE</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Your KALE balance</dt>
          <dd class="mt-0.5 flex items-center gap-2 text-lg font-semibold text-ink-1">
            {#if kaleBalanceLoading}
              <Loader classNames="size-4" textColor="text-ink-2" />
              <span class="text-sm font-normal text-ink-2">Checking…</span>
            {:else if kaleBalance !== null}
              <span class={insufficientKale ? 'text-warning' : 'text-ink-1'}>
                {formatKaleBalanceWithSuffix(kaleBalance)}
              </span>
            {:else}
              <span class="text-sm font-normal text-ink-2">Unavailable</span>
              {#if onRefreshKaleBalance}
                <button
                  type="button"
                  onclick={onRefreshKaleBalance}
                  class="focus-ring inline-flex min-h-11 items-center rounded px-2 text-xs font-medium text-accent hover:bg-accent/10"
                >
                  Retry
                </button>
              {/if}
            {/if}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Tracks to acquire</dt>
          <dd class="mt-0.5 text-sm font-medium text-ink-1">
            {tracksToMint.length + tracksToPurchase.length}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Signatures · time</dt>
          <dd class="mt-0.5 text-sm font-medium text-ink-1">
            {quote.totalSignatures} ·
            {#if quote.estimatedMinutes > 0}
              ~{quote.estimatedMinutes}m {quote.remainingSeconds}s
            {:else}
              ~{quote.remainingSeconds}s
            {/if}
          </dd>
        </div>
      </dl>

      {#if insufficientKale && kaleBalance !== null}
        <div
          role="alert"
          class="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-warning/10 px-3.5 py-2.5 text-xs leading-relaxed text-ink-1 ring-1 ring-inset ring-warning/35"
        >
          <Icon name="warning" size={16} class="mt-0.5 shrink-0 text-warning" />
          <span>
            Need ~{quote.totalCost} KALE, and your wallet has {formatKaleBalanceWithSuffix(kaleBalance)}. Add KALE before confirming.
          </span>
        </div>
      {:else if tracksToPurchase.length > 0}
        <p class="text-xs leading-relaxed text-ink-3">
          Estimated at 33 KALE per AMM swap and 100 KALE per unminted track. Final AMM swap amounts may vary slightly with pool liquidity.
        </p>
      {/if}

      {#if !isProcessing && quote.totalSignatures > 1}
        <p class="rounded-[var(--radius-control)] bg-surface-1 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2 ring-1 ring-inset ring-line">
          Transactions are signed in batches. If you cancel midway, you can retry without losing progress.
        </p>
      {/if}

      <div class="space-y-2.5">
        {#each steps as step, stepIndex (step.id)}
          {@const isCompleted = completedSteps.has(step.id)}
          {@const isCurrent = currentStep === step.id}

          <div
            class={`rounded-[var(--radius-control)] p-3.5 ring-1 ring-inset ${
              isCurrent
                ? 'bg-accent/10 ring-accent/50'
                : isCompleted
                  ? 'bg-success/10 ring-success/40'
                  : 'bg-surface-1 ring-line'
            }`}
          >
            <div class="flex items-start gap-3">
              <div class="mt-0.5 shrink-0">
                {#if isCompleted}
                  <div class="flex size-6 items-center justify-center rounded-full bg-success text-canvas">
                    <Icon name="check" size={14} />
                  </div>
                {:else if isCurrent}
                  <Loader classNames="size-6" textColor="text-accent" />
                {:else}
                  <div class="flex size-6 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line-strong">
                    {stepIndex + 1}
                  </div>
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-ink-1">{step.label}</p>
                {#if step.detail}
                  <p class="mt-0.5 text-xs text-ink-2">{step.detail}</p>
                {/if}

                {#if step.substeps && (isCurrent || isCompleted) && isProcessing}
                  <ul class="mt-2.5 space-y-1.5 border-l border-line-strong pl-3">
                    {#each step.substeps as substep (substep.id)}
                      {@const subCompleted = completedSteps.has(substep.id)}
                      <li class="flex items-center gap-2 text-xs">
                        {#if subCompleted}
                          <Icon name="check" size={14} class="text-success" />
                          <span class="text-success">{substep.label}</span>
                        {:else}
                          <span class="size-1.5 rounded-full bg-ink-3" aria-hidden="true"></span>
                          <span class="text-ink-2">{substep.label}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#snippet footer()}
    {#if !balancesLoading && hasWork}
      <div class="flex items-center gap-2.5">
        <Button variant="secondary" fullWidth disabled={isProcessing} onclick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          fullWidth
          loading={isProcessing}
          disabled={isProcessing || insufficientKale}
          onclick={onConfirm}
        >
          {#if isProcessing}
            Processing…
          {:else if insufficientKale}
            Insufficient KALE
          {:else}
            Confirm purchase
          {/if}
        </Button>
      </div>
    {:else}
      <Button variant="secondary" fullWidth onclick={onClose}>Close</Button>
    {/if}
  {/snippet}
</Sheet>
