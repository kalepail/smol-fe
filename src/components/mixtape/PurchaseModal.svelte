<script lang="ts">
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    isOpen?: boolean;
    balancesLoading?: boolean;
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
    tracksToMint = [],
    tracksToPurchase = [],
    isProcessing = false,
    currentStep = '',
    completedSteps = new Set(),
    onClose,
    onConfirm,
  }: Props = $props();

  const totalMintCost = $derived(tracksToMint.length * 100);
  const totalPurchaseCost = $derived(tracksToPurchase.length * 33);
  const totalCost = $derived(totalMintCost + totalPurchaseCost);
  const mintBatches = $derived(Math.ceil(tracksToMint.length / 5));
  const swapBatches = $derived(Math.ceil(tracksToPurchase.length / 9));
  const totalSignatures = $derived(mintBatches + swapBatches);
  const estimatedSeconds = $derived(totalSignatures * 10);
  const estimatedMinutes = $derived(Math.floor(estimatedSeconds / 60));
  const remainingSeconds = $derived(estimatedSeconds % 60);

  const steps = $derived([
    ...(tracksToMint.length > 0
      ? [
          {
            id: 'mint',
            label: `Mint ${tracksToMint.length} ${tracksToMint.length === 1 ? 'track' : 'tracks'}`,
            detail: `${totalMintCost} KALE (${mintBatches} ${mintBatches === 1 ? 'signature' : 'signatures'})`,
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
            detail: `${totalPurchaseCost} KALE (${swapBatches} ${swapBatches === 1 ? 'signature' : 'signatures'})`,
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
  subtitle={balancesLoading ? 'Checking your track balances…' : hasWork ? 'Review and confirm your purchase' : 'You already own every track'}
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
    <div class="space-y-5">
      <dl class="tabular grid grid-cols-2 gap-4 rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line">
        <div>
          <dt class="text-xs text-ink-2">Tracks to acquire</dt>
          <dd class="mt-0.5 text-lg font-semibold text-ink-1">
            {tracksToMint.length + tracksToPurchase.length}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Estimated total</dt>
          <dd class="mt-0.5 text-lg font-semibold text-accent">{totalCost} KALE</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Signatures</dt>
          <dd class="mt-0.5 text-sm font-medium text-ink-1">{totalSignatures}</dd>
        </div>
        <div>
          <dt class="text-xs text-ink-2">Estimated time</dt>
          <dd class="mt-0.5 text-sm font-medium text-ink-1">
            {#if estimatedMinutes > 0}
              ~{estimatedMinutes}m {remainingSeconds}s
            {:else}
              ~{remainingSeconds}s
            {/if}
          </dd>
        </div>
      </dl>

      {#if !isProcessing && totalSignatures > 1}
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
        <Button variant="primary" fullWidth loading={isProcessing} onclick={onConfirm}>
          {isProcessing ? 'Processing…' : 'Confirm purchase'}
        </Button>
      </div>
    {:else}
      <Button variant="secondary" fullWidth onclick={onClose}>Close</Button>
    {/if}
  {/snippet}
</Sheet>
