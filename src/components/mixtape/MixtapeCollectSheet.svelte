<script lang="ts">
  import type { CollectController } from '../../stores/mixtapeCollect.svelte';
  import { userState } from '../../stores/user.svelte';
  import { toast } from '../../stores/toast.svelte';
  import {
    MINT_OWNS_COPY,
    abbreviateTokens,
    describeStepFailure,
    formatKale,
    formatStroops,
    isAcknowledgeable,
    isRunnable,
    kaleGuard,
    nextRunnableStep,
    type FlowStep,
  } from '../../utils/mixtapeOwnership';
  import { BUY_COST_KALE, MINT_COST_KALE } from '../../utils/mixtapePricing';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import Loader from '../ui/Loader.svelte';
  import CoverArt from '../ui/CoverArt.svelte';

  interface Props {
    controller: CollectController;
    mixtapeTitle: string;
  }

  let { controller: c, mixtapeTitle }: Props = $props();

  let chooseOpen = $state(false);

  const plan = $derived(c.plan);
  const kale = $derived(c.kale);
  const cost = $derived(plan?.costStroops ?? 0n);
  const short = $derived(kale.status === 'known' && kale.balance < cost ? cost - kale.balance : 0n);
  const checking = $derived(!c.hydrated || c.summary.checking > 0);
  const songsToCollect = $derived((plan?.mint.length ?? 0) + (plan?.buy.length ?? 0));
  const actionable = $derived(
    c.rows.filter((r) => r.state === 'available' || r.state === 'unminted' || r.state === 'owned')
  );
  const selectedIds = $derived(
    c.selection ?? new Set([...(c.fullPlan?.mint ?? []), ...(c.fullPlan?.buy ?? [])].map((t) => t.id))
  );
  const ownedRows = $derived(
    c.rows
      .map((r, i) => ({ ...r, balance: c.balances[i] }))
      .filter((r) => r.state === 'owned')
  );
  const nextStep = $derived(nextRunnableStep(c.steps));
  const stepIndex = $derived(nextStep ? c.steps.indexOf(nextStep) + 1 : 0);
  const signing = $derived(c.steps.some((s) => s.status === 'signing'));
  const confirmingOnly = $derived(
    !nextStep && c.steps.some((s) => s.status === 'confirming' || s.status === 'submitting')
  );
  const hasMintStep = $derived(c.steps.some((s) => s.kind === 'mint') || (plan?.mint.length ?? 0) > 0);

  const sheetTitle = $derived.by(() => {
    switch (c.view) {
      case 'progress':
        return `Collecting “${mixtapeTitle}”`;
      case 'holdings':
        return 'Your songs';
      case 'getKale':
        return 'Get KALE';
      case 'explain':
        return 'How collecting works';
      case 'done':
        return `Collect “${mixtapeTitle}”`;
      default:
        return `Collect “${mixtapeTitle}”`;
    }
  });
  const sheetSubtitle = $derived(
    c.view === 'review' && songsToCollect > 0
      ? `${songsToCollect} ${songsToCollect === 1 ? 'song' : 'songs'} to collect`
      : c.view === 'holdings'
        ? `From “${mixtapeTitle}”`
        : undefined
  );

  const reviewPrimary = $derived.by((): { label: string; disabled: boolean } => {
    if (checking) return { label: 'Checking…', disabled: true };
    if (!plan || plan.steps.length === 0) return { label: 'Nothing selected', disabled: true };
    if (kale.status === 'loading' || kale.status === 'idle') return { label: 'Checking balance…', disabled: true };
    if (kale.status === 'error') return { label: 'Check balance first', disabled: true };
    if (short > 0n) return { label: 'Not enough KALE', disabled: true };
    return { label: `Collect for ${formatKale(plan.costKale)}`, disabled: c.approving };
  });

  const progressPrimary = $derived.by((): { label: string; disabled: boolean } => {
    if (signing) return { label: 'Waiting for passkey…', disabled: true };
    if (c.approving) return { label: 'Checking…', disabled: true };
    if (nextStep) {
      // Same guard as signing: a KNOWN balance that covers the next step (C-10).
      const guard = kaleGuard(kale, nextStep.costStroops);
      if (guard === 'unknown') return { label: 'Check balance again', disabled: kale.status === 'loading' };
      if (guard === 'short') return { label: 'Not enough KALE', disabled: true };
      const paused = nextStep.status === 'cancelled' || nextStep.status === 'failed';
      const left = c.steps.filter(isRunnable).length;
      if (paused) return { label: `Continue · approve ${left}`, disabled: false };
      return { label: `Approve step ${stepIndex} of ${c.steps.length}`, disabled: false };
    }
    if (confirmingOnly) return { label: 'Minting on Stellar…', disabled: true };
    if (c.steps.some((s) => isAcknowledgeable(s, Date.now()))) {
      return { label: 'Acknowledge & start new purchase', disabled: false };
    }
    if (c.steps.some((s) => s.status === 'failed')) return { label: 'Check again', disabled: false };
    return { label: 'Done', disabled: false };
  });

  function stepLabel(step: FlowStep) {
    const n = step.trackIds.length;
    return `${step.kind === 'mint' ? 'Mint' : 'Buy'} ${n} ${n === 1 ? 'song' : 'songs'}`;
  }

  function stepStatusLine(step: FlowStep): string {
    switch (step.status) {
      case 'signing':
        return 'Approve with your passkey';
      case 'submitting':
        return 'Sending…';
      case 'confirming':
        return step.kind === 'mint' ? 'Minting on Stellar… usually under 30 seconds' : 'Confirming…';
      case 'cancelled':
      case 'failed':
        return describeStepFailure(step.failure, step.titles[0]);
      default:
        return '';
    }
  }

  async function copyAddress() {
    if (!userState.contractId) return;
    try {
      await navigator.clipboard.writeText(userState.contractId);
      toast.success('Wallet address copied.');
    } catch {
      toast.error('Could not copy address.');
    }
  }
</script>

<Sheet
  open={c.sheetOpen}
  title={sheetTitle}
  subtitle={sheetSubtitle}
  maxWidth="md"
  onClose={() => c.closeSheet()}
>
  {#if c.notices.length > 0 && (c.view === 'review' || c.view === 'progress')}
    <ul class="mb-4 space-y-2" aria-live="polite">
      {#each c.notices as notice, i (i)}
        <li
          class={`flex items-start gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-xs leading-relaxed ring-1 ring-inset ${
            notice.tone === 'warning' ? 'bg-warning/10 text-ink-1 ring-warning/30' : 'bg-surface-1 text-ink-1 ring-line'
          }`}
        >
          <Icon name={notice.tone === 'warning' ? 'warning' : 'info'} size={14} class={`mt-0.5 shrink-0 ${notice.tone === 'warning' ? 'text-warning' : 'text-ink-2'}`} />
          <span>{notice.text}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if c.view === 'review'}
    <div class="space-y-4">
      <dl class="tabular space-y-3 text-sm">
        {#if plan && plan.mint.length > 0}
          <div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="flex items-center gap-2 font-medium text-ink-1">
                <span class="size-2.5 rounded-full ring-1 ring-ink-2" aria-hidden="true"></span>
                Mint {plan.mint.length} {plan.mint.length === 1 ? 'song' : 'songs'}
              </dt>
              <dd class="font-medium text-ink-1">{formatKale(plan.mint.length * MINT_COST_KALE)}</dd>
            </div>
            <p class="mt-0.5 pl-[18px] text-xs text-ink-2">You'll own them right away.</p>
          </div>
        {/if}
        {#if plan && plan.buy.length > 0}
          <div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="flex items-center gap-2 font-medium text-ink-1">
                <span class="ml-0.5 size-2 rotate-45 rounded-[1px] bg-ink-2" aria-hidden="true"></span>
                Buy {plan.buy.length} {plan.buy.length === 1 ? 'song' : 'songs'}
              </dt>
              <dd class="font-medium text-ink-1">{formatKale(plan.buy.length * BUY_COST_KALE)}</dd>
            </div>
            <p class="mt-0.5 pl-[18px] text-xs text-ink-2">{BUY_COST_KALE} KALE each. Tokens you get vary with the song's market.</p>
          </div>
        {/if}
        <div class="flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt class="font-semibold text-ink-1">Total</dt>
          <dd class="text-base font-semibold text-ink-1">{formatKale(plan?.costKale ?? 0)}</dd>
        </div>
        <div class="flex items-center justify-between gap-3">
          <dt class="text-ink-2">Your balance</dt>
          <dd class="flex items-center gap-1.5 font-medium">
            {#if kale.status === 'known'}
              <span class={short > 0n ? 'text-warning' : 'text-ink-1'}>{formatStroops(kale.balance)} KALE</span>
              {#if short > 0n}
                <Icon name="warning" size={14} class="text-warning" />
              {:else}
                <Icon name="check" size={14} class="text-success" />
              {/if}
            {:else if kale.status === 'error'}
              <span class="text-ink-2">Couldn't load</span>
              <button type="button" onclick={() => c.refreshKale()} class="focus-ring inline-flex min-h-11 items-center rounded px-2 text-xs font-medium text-accent hover:bg-accent/10">
                Retry
              </button>
            {:else}
              <Loader classNames="size-4" textColor="text-ink-2" />
              <span class="text-ink-2">Checking…</span>
            {/if}
          </dd>
        </div>
      </dl>

      {#if short > 0n}
        <div class="space-y-1 rounded-[var(--radius-control)] bg-warning/10 p-3 ring-1 ring-inset ring-warning/30">
          <p class="text-xs font-medium text-warning">You're {formatStroops(short)} KALE short.</p>
          <div class="flex flex-wrap items-center gap-x-3">
            <button type="button" onclick={() => (c.view = 'getKale')} class="focus-ring inline-flex min-h-11 items-center gap-0.5 rounded text-sm font-medium text-ink-1 hover:underline">
              Get KALE <Icon name="chevron-right" size={14} />
            </button>
            {#if c.affordable && c.affordable.count > 0}
              <button type="button" onclick={() => c.selectAffordable()} class="focus-ring inline-flex min-h-11 items-center rounded text-sm font-medium text-ink-1 underline-offset-4 hover:underline">
                {c.affordable.mints > 0 ? (c.affordable.mints === c.affordable.count ? 'Mint' : 'Collect') : 'Buy'} {c.affordable.count} for {formatKale(c.affordable.costKale)} instead
              </button>
            {/if}
          </div>
        </div>
      {/if}

      {#if actionable.length > 1}
        <div class="rounded-[var(--radius-control)] ring-1 ring-inset ring-line">
          <button
            type="button"
            aria-expanded={chooseOpen}
            onclick={() => (chooseOpen = !chooseOpen)}
            class="focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-ink-1"
          >
            <span>Choose songs ({songsToCollect} selected)</span>
            <Icon name="chevron-down" size={16} class={chooseOpen ? 'rotate-180' : ''} />
          </button>
          {#if chooseOpen}
            <ul class="divide-y divide-line border-t border-line">
              {#each actionable as row (row.track.id)}
                {@const owned = row.state === 'owned'}
                <li>
                  <label class={`flex min-h-12 items-center gap-3 px-3 py-1.5 ${owned ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      class="size-4 shrink-0 accent-[var(--color-accent)]"
                      checked={owned || selectedIds.has(row.track.id)}
                      disabled={owned}
                      onchange={() => c.toggleTrack(row.track.id)}
                    />
                    <CoverArt id={row.track.id} alt="" scale={4} class="size-8 shrink-0" />
                    <span class="min-w-0 flex-1 truncate text-sm text-ink-1">{row.track.title}</span>
                    <span class="tabular shrink-0 text-xs text-ink-2">
                      {owned ? 'Owned' : row.state === 'unminted' ? MINT_COST_KALE : BUY_COST_KALE}
                    </span>
                  </label>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <div class="space-y-2 rounded-[var(--radius-control)] bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
        {#if hasMintStep}
          <p class="font-medium text-ink-1">{MINT_OWNS_COPY}</p>
        {/if}
        {#if plan && plan.signatures > 0}
          <p>
            {plan.signatures} passkey {plan.signatures === 1 ? 'approval' : 'approvals'}. If you stop partway, you keep what's done and can continue later.
          </p>
        {/if}
      </div>

      {#if plan && plan.excluded.length > 0}
        {@const unknown = plan.excluded.filter((e) => e.reason === 'unknown').length}
        {@const tooSmall = plan.excluded.filter((e) => e.reason === 'poolTooSmall')}
        {#if unknown > 0}
          <p class="flex items-start gap-2 text-xs text-warning">
            <Icon name="warning" size={14} class="mt-0.5 shrink-0" />
            {unknown} {unknown === 1 ? "song couldn't be checked and isn't" : "songs couldn't be checked and aren't"} included.
          </p>
        {/if}
        {#each tooSmall as item (item.id)}
          <p class="flex items-start gap-2 text-xs text-warning">
            <Icon name="warning" size={14} class="mt-0.5 shrink-0" />
            {describeStepFailure('poolTooSmall', item.title)}
          </p>
        {/each}
      {/if}
    </div>
  {:else if c.view === 'progress'}
    <div class="space-y-4">
      <ol class="space-y-2.5">
        {#each c.steps as step, i (step.id)}
          {@const active = step.status === 'signing' || step.status === 'submitting' || step.status === 'confirming'}
          {@const problem = step.status === 'cancelled' || step.status === 'failed'}
          <li
            aria-label={`Step ${i + 1}, ${stepLabel(step).toLowerCase()}, ${step.status === 'done' ? 'done' : stepStatusLine(step) || 'waiting'}`}
            class={`rounded-[var(--radius-control)] p-3 ring-1 ring-inset ${
              active ? 'bg-accent/8 ring-accent/50' : problem ? 'bg-warning/8 ring-warning/40' : step.status === 'done' ? 'bg-success/8 ring-success/30' : 'bg-surface-1 ring-line'
            }`}
          >
            <div class="flex items-start gap-3">
              <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
                {#if step.status === 'done'}
                  <span class="flex size-6 items-center justify-center rounded-full bg-success text-canvas"><Icon name="check" size={14} /></span>
                {:else if active}
                  <Loader classNames="size-5" textColor="text-accent" />
                {:else if problem}
                  <span class="flex size-6 items-center justify-center rounded-full bg-warning/20 text-warning">
                    <Icon name={step.status === 'cancelled' ? 'pause' : 'warning'} size={13} />
                  </span>
                {:else}
                  <span class="flex size-6 items-center justify-center rounded-full bg-surface-2 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line-strong">{i + 1}</span>
                {/if}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="text-sm font-medium text-ink-1">{stepLabel(step)}</p>
                  <p class="tabular shrink-0 text-sm text-ink-2">{formatStroops(step.costStroops)} KALE</p>
                </div>
                {#if stepStatusLine(step)}
                  <p class={`mt-0.5 text-xs ${problem ? 'text-warning' : 'text-ink-2'}`}>{stepStatusLine(step)}</p>
                {/if}
                <p class="mt-1 line-clamp-2 text-xs text-ink-3">{step.titles.join(' · ')}</p>
              </div>
            </div>
          </li>
        {/each}
      </ol>
      <p class="tabular text-xs text-ink-2" aria-live="polite">
        You own {c.summary.owned} of {c.summary.total} so far.
      </p>
    </div>
  {:else if c.view === 'done'}
    <div class="flex flex-col items-center py-6 text-center">
      <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
        <Icon name="check" size={24} />
      </div>
      <h3 class="text-base font-semibold text-ink-1" tabindex="-1">
        {#if c.summary.owned === c.summary.collectible}
          You own this mixtape
        {:else}
          You own {c.doneSummary?.added ?? 0} more {(c.doneSummary?.added ?? 0) === 1 ? 'song' : 'songs'}
        {/if}
      </h3>
      <p class="mt-1 text-sm text-ink-2">
        {c.summary.owned} of {c.summary.total} songs are in your wallet.
      </p>
    </div>
  {:else if c.view === 'holdings'}
    {#if ownedRows.length === 0}
      <p class="py-6 text-center text-sm text-ink-2">You don't own any songs from this mixtape yet.</p>
    {:else}
      <ul class="divide-y divide-line">
        {#each ownedRows as row (row.track.id)}
          <li class="flex min-h-14 items-center gap-3 py-2">
            <CoverArt id={row.track.id} alt="" scale={4} class="size-10 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-1">{row.track.title}</span>
            {#if row.balance}
              <span class="tabular shrink-0 text-xs text-ink-2">{abbreviateTokens(row.balance)}</span>
            {/if}
            <a href={`/${row.track.id}?trade=1`} class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded px-1 text-sm font-medium text-ink-1 hover:underline">
              Trade <Icon name="chevron-right" size={14} />
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if c.view === 'getKale'}
    <div class="space-y-4">
      <p class="text-sm text-ink-2">Send KALE to your SMOL wallet:</p>
      <p class="break-all rounded-[var(--radius-control)] bg-surface-1 p-3 font-mono text-xs text-ink-1 ring-1 ring-inset ring-line">
        {userState.contractId}
      </p>
      <div class="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" fullWidth onclick={copyAddress}>
          <Icon name="copy" size={16} /> Copy address
        </Button>
        <Button variant="secondary" fullWidth onclick={() => c.refreshKale()} loading={kale.status === 'loading'}>
          <Icon name="refresh" size={16} /> Check balance again
        </Button>
      </div>
      {#if kale.status === 'known'}
        <p class="tabular text-xs text-ink-2">Your balance: {formatStroops(kale.balance)} KALE</p>
      {/if}
    </div>
  {:else if c.view === 'explain'}
    <div class="space-y-3 text-sm leading-relaxed text-ink-2">
      <p><strong class="text-ink-1">Owning a song</strong> means holding some of its tokens.</p>
      <p><strong class="text-ink-1">Minted songs</strong> can be bought for {BUY_COST_KALE} KALE each. How many tokens you get depends on the song's market.</p>
      <p>
        <strong class="text-ink-1">Songs that aren't minted yet</strong> can be minted for {MINT_COST_KALE} KALE. Minting creates the song's coin and gives you 10,000,000 tokens, so <strong class="text-ink-1">you own it right away. No second purchase.</strong> Your {MINT_COST_KALE} KALE starts the song's market, and you earn a share of the fee on every trade, alongside the song's creator.
      </p>
      <p>Anyone can mint a public song.</p>
    </div>
  {/if}

  {#snippet footer()}
    {#if c.view === 'review'}
      <div class="flex items-center gap-2.5">
        <Button variant="secondary" fullWidth onclick={() => c.closeSheet()}>Cancel</Button>
        <Button variant="primary" fullWidth disabled={reviewPrimary.disabled} loading={c.approving} onclick={() => c.approveNext('review')}>
          <span class="tabular">{reviewPrimary.label}</span>
        </Button>
      </div>
    {:else if c.view === 'progress'}
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2.5">
          <Button variant="secondary" fullWidth onclick={() => c.closeSheet()}>Close</Button>
          <Button
            variant="primary"
            fullWidth
            disabled={progressPrimary.disabled}
            onclick={() =>
              progressPrimary.label === 'Done'
                ? c.closeSheet()
                : progressPrimary.label === 'Check balance again'
                  ? c.refreshKale()
                  : progressPrimary.label === 'Acknowledge & start new purchase'
                    ? c.acknowledge()
                    : c.approveNext('step')}
          >
            {progressPrimary.label}
          </Button>
        </div>
        {#if c.flowKind === 'paused'}
          <button type="button" onclick={() => c.startOver()} class="focus-ring mx-auto inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-ink-2 hover:text-ink-1 hover:underline">
            Start over
          </button>
        {/if}
      </div>
    {:else if c.view === 'done'}
      <div class="flex items-center gap-2.5">
        <Button variant="secondary" fullWidth onclick={() => (c.view = 'holdings')}>See your songs</Button>
        <Button variant="primary" fullWidth onclick={() => c.closeSheet()}>Done</Button>
      </div>
    {:else if c.view === 'getKale' || c.view === 'explain'}
      <Button variant="secondary" fullWidth onclick={() => (c.signedIn ? (c.view = 'review') : c.closeSheet())}>
        {c.signedIn ? 'Back' : 'Close'}
      </Button>
    {:else}
      <Button variant="secondary" fullWidth onclick={() => c.closeSheet()}>Close</Button>
    {/if}
  {/snippet}
</Sheet>
