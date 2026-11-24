<script lang="ts">
  import { untrack } from 'svelte';
  import { userState } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance } from '../../stores/balance.svelte';
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    mixtapeEditState,
    openMixtapeSheet,
  } from '../../stores/mixtape.svelte';
  import { loadMyMixtapes, myMixtapesCounts, myMixtapesState } from '../../stores/myMixtapes.svelte';
  import { useAuthentication } from '../../hooks/useAuthentication';
  import { formatKaleBalance } from '../../utils/kaleFormatting';
  import { shortenAddress } from '../../utils/address';
  import { toast } from '../../stores/toast.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import '../ui/ownerIcons';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const authHook = useAuthentication();
  let signingOut = $state(false);

  const draftCount = $derived(mixtapeDraftState.tracks.length);
  const editSession = $derived(mixtapeEditState.session);
  const mineCounts = $derived(
    myMixtapesState.status === 'ready' && myMixtapesState.owner === userState.contractId ? myMixtapesCounts.current : null
  );

  // Owner mixtapes load when the sheet opens (SWR).
  $effect(() => {
    if (open && userState.contractId) void loadMyMixtapes();
  });

  // KALE balance: the TopBar already auto-loads it, so this is a free no-op
  // while fresh (15s SWR) or in flight; otherwise it revalidates on open.
  $effect(() => {
    const wallet = userState.contractId;
    if (open && wallet) untrack(() => void updateContractBalance(wallet));
  });

  const sheetBalance = $derived(
    userState.contractId && balanceState.address === userState.contractId ? balanceState.balance : null
  );

  // A refresh failed but the last real value is still shown: say so, offer Retry.
  const refreshFailed = $derived(sheetBalance !== null && balanceState.error && !balanceState.loading);

  function refreshBalance() {
    if (!userState.contractId || balanceState.loading) return;
    void updateContractBalance(userState.contractId, { force: true });
  }

  async function copyAddress() {
    if (!userState.contractId) return;
    try {
      await navigator.clipboard.writeText(userState.contractId);
      toast.success('Wallet address copied.');
    } catch {
      toast.error('Could not copy wallet address.');
    }
  }

  function handleOpenMixtape() {
    onClose();
    openMixtapeSheet();
  }

  function handleOpenEditor() {
    onClose();
    openMixtapeSheet('builder');
  }

  async function handleSignOut() {
    signingOut = true;
    try {
      onClose();
      await authHook.logout();
      toast.info('Signed out.');
    } finally {
      signingOut = false;
    }
  }
</script>

<Sheet {open} title="Your library" maxWidth="sm" {onClose}>
  {#if userState.contractId}
    <div class="space-y-4">
      <!-- Wallet summary -->
      <div class="rounded-[var(--radius-control)] bg-surface-1 p-3.5 ring-1 ring-inset ring-line">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-xs text-ink-2">Wallet</p>
            <p class="mt-0.5 truncate font-mono text-sm text-ink-1">
              {shortenAddress(userState.contractId, 6)}
            </p>
          </div>
          <Button variant="ghost" size="sm" class="min-h-11" onclick={copyAddress}>
            <Icon name="copy" size={16} />
            <span>Copy</span>
          </Button>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span class="text-xs text-ink-2">KALE balance</span>
          {#if sheetBalance !== null}
            <span class="flex min-w-0 items-center gap-1">
              <span data-sheet-balance class="tabular truncate text-sm font-medium text-ink-1">
                {formatKaleBalance(sheetBalance)} KALE
              </span>
              {#if refreshFailed}
                <button
                  type="button"
                  data-sheet-balance-retry
                  class="focus-ring -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-3 text-xs font-medium text-accent hover:bg-accent/10"
                  onclick={refreshBalance}
                >
                  <Icon name="refresh" size={14} />
                  <span>Retry</span>
                </button>
              {:else}
                <button
                  type="button"
                  class="focus-ring -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-white/5 hover:text-ink-1 disabled:opacity-60"
                  aria-label={balanceState.loading ? 'Refreshing KALE balance' : 'Refresh KALE balance'}
                  title="Refresh"
                  disabled={balanceState.loading}
                  onclick={refreshBalance}
                >
                  <Icon name="refresh" size={16} class={balanceState.loading ? 'animate-spin' : ''} />
                </button>
              {/if}
            </span>
          {:else if balanceState.error && !balanceState.loading}
            <span class="flex items-center gap-1">
              <span class="text-sm text-ink-3">Unavailable</span>
              <button
                type="button"
                class="focus-ring -mr-2 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-xs font-medium text-accent hover:bg-accent/10"
                onclick={refreshBalance}
              >
                Retry
              </button>
            </span>
          {:else}
            <span class="inline-flex min-h-11 items-center" aria-label="Loading KALE balance" role="status">
              <Loader classNames="size-4" textColor="text-ink-2" />
            </span>
          {/if}
        </div>
        {#if refreshFailed}
          <p data-sheet-balance-error role="status" class="mt-1 text-right text-xs text-ink-2">
            Couldn't refresh. Showing the last known balance.
          </p>
        {/if}
      </div>

      <!-- Navigation links -->
      <div class="divide-y divide-line rounded-[var(--radius-control)] bg-surface-1 ring-1 ring-inset ring-line">
        <a
          href="/created"
          onclick={onClose}
          class="focus-ring flex min-h-12 items-center justify-between px-3.5 text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex items-center gap-3">
            <Icon name="sparkles" size={18} class="text-ink-2" />
            <span>Created songs</span>
          </span>
          <Icon name="chevron-right" size={16} class="text-ink-3" />
        </a>

        <a
          href="/liked"
          onclick={onClose}
          class="focus-ring flex min-h-12 items-center justify-between px-3.5 text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex items-center gap-3">
            <Icon name="heart" size={18} class="text-ink-2" />
            <span>Liked songs</span>
          </span>
          <Icon name="chevron-right" size={16} class="text-ink-3" />
        </a>

        <a
          href="/mixtapes?view=yours"
          onclick={onClose}
          class="focus-ring flex min-h-12 items-center justify-between gap-3 px-3.5 py-2 text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex min-w-0 items-center gap-3">
            <Icon name="mixtapes-solid" size={18} class="text-ink-2" />
            <span class="flex min-w-0 flex-col">
              <span>Your mixtapes</span>
              {#if mineCounts && mineCounts.hidden > 0}
                <span class="flex items-center gap-1 text-xs font-normal text-warning">
                  <Icon name="eye-off" size={12} />
                  {mineCounts.hidden} hidden from the Mixtapes page
                </span>
              {/if}
            </span>
          </span>
          <span class="flex items-center gap-2">
            {#if mineCounts && mineCounts.total > 0}
              <span class="tabular rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2 ring-1 ring-inset ring-line">
                {mineCounts.total}
              </span>
            {/if}
            <Icon name="chevron-right" size={16} class="text-ink-3" />
          </span>
        </a>

        {#if editSession}
          <button
            type="button"
            onclick={handleOpenEditor}
            class="focus-ring flex min-h-12 w-full items-center justify-between gap-3 px-3.5 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
          >
            <span class="flex min-w-0 items-center gap-3">
              <Icon name="pencil" size={18} class="text-ink-2" />
              <span class="truncate">Editing "{editSession.title.trim() || 'Untitled mixtape'}"</span>
            </span>
            <Icon name="chevron-right" size={16} class="text-ink-3" />
          </button>
        {:else}
        <button
          type="button"
          onclick={handleOpenMixtape}
          class="focus-ring flex min-h-12 w-full items-center justify-between px-3.5 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex items-center gap-3">
            <Icon name="mixtapes" size={18} class="text-ink-2" />
            <span>{mixtapeDraftHasContent.current ? 'Open mixtape draft' : 'New mixtape'}</span>
          </span>
          <span class="flex items-center gap-2">
            {#if draftCount > 0}
              <span class="tabular rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                {draftCount}
              </span>
            {/if}
            <Icon name="chevron-right" size={16} class="text-ink-3" />
          </span>
        </button>
        {/if}

        <a
          href="/account"
          onclick={onClose}
          class="focus-ring flex min-h-12 items-center justify-between px-3.5 text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex items-center gap-3">
            <Icon name="wallet" size={18} class="text-ink-2" />
            <span>Account & transfers</span>
          </span>
          <Icon name="chevron-right" size={16} class="text-ink-3" />
        </a>
      </div>

      <Button
        variant="ghost"
        fullWidth
        loading={signingOut}
        onclick={handleSignOut}
      >
        <Icon name="logout" size={18} />
        <span>Sign out</span>
      </Button>
    </div>
  {/if}
</Sheet>
