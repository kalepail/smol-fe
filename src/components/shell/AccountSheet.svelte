<script lang="ts">
  import { userState } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance } from '../../stores/balance.svelte';
  import { mixtapeDraftState, mixtapeModeState, enterMixtapeMode, exitMixtapeMode } from '../../stores/mixtape.svelte';
  import { useAuthentication } from '../../hooks/useAuthentication';
  import { formatKaleBalanceWithSuffix } from '../../utils/kaleFormatting';
  import { shortenAddress } from '../../utils/address';
  import { toast } from '../../stores/toast.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Icon from '../ui/Icon.svelte';
  import Button from '../ui/Button.svelte';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const authHook = useAuthentication();
  let signingOut = $state(false);
  let balanceRequested = $state(false);

  const draftCount = $derived(mixtapeDraftState.tracks.length);

  // Only load KALE balance on demand when the user actually opens the account sheet.
  function loadBalanceOnDemand() {
    if (!userState.contractId || balanceState.loading) return;
    balanceRequested = true;
    void updateContractBalance(userState.contractId);
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

  function handleMixtapeMode() {
    if (mixtapeModeState.active) {
      exitMixtapeMode();
    } else {
      enterMixtapeMode();
    }
    onClose();
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
          <Button variant="ghost" size="sm" onclick={copyAddress}>
            <Icon name="copy" size={16} />
            <span>Copy</span>
          </Button>
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span class="text-xs text-ink-2">KALE balance</span>
          {#if balanceState.loading}
            <Loader classNames="size-4" textColor="text-ink-2" />
          {:else if balanceState.balance !== null}
            <span class="tabular text-sm font-medium text-ink-1">
              {formatKaleBalanceWithSuffix(balanceState.balance)}
            </span>
          {:else}
            <button
              type="button"
              class="focus-ring rounded px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
              onclick={loadBalanceOnDemand}
            >
              {balanceRequested ? 'Retry' : 'Check balance'}
            </button>
          {/if}
        </div>
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

        <button
          type="button"
          onclick={handleMixtapeMode}
          class="focus-ring flex min-h-12 w-full items-center justify-between px-3.5 text-left text-sm font-medium text-ink-1 hover:bg-white/5"
        >
          <span class="flex items-center gap-3">
            <Icon name="mixtapes" size={18} class="text-ink-2" />
            <span>{mixtapeModeState.active ? 'Open mixtape draft' : 'New mixtape'}</span>
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
