<script lang="ts">
  import { onMount } from 'svelte';
  import { userState } from '../stores/user.svelte';
  import { balanceState, updateContractBalance } from '../stores/balance.svelte';
  import { openAuthSheet } from '../stores/authSheet.svelte';
  import { toast } from '../stores/toast.svelte';
  import { shortenAddress } from '../utils/address';
  import { getConnectedAccount } from '../utils/wallet';
  import { KALE_DECIMALS } from '../utils/mixtapePricing';
  import { logger } from '../utils/logger';
  import Button from './ui/Button.svelte';
  import Icon from './ui/Icon.svelte';
  import Skeleton from './ui/Skeleton.svelte';
  import StateFeedback from './ui/StateFeedback.svelte';

  let to = $state('');
  let amount = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  // KALE is a SAC with a fixed 7 decimals: no decimals() simulation needed.
  const kaleDecimals = KALE_DECIMALS;
  const decimalsFactor = 10n ** BigInt(KALE_DECIMALS);
  let showKaleInfo = $state(false);

  onMount(() => {
    if (userState.contractId && !balanceState.loading) {
      void updateContractBalance(userState.contractId);
    }
  });

  function parseAmount(value: string | number): bigint | null {
    const sanitized = String(value).trim();
    if (!sanitized || !/^\d+$/.test(sanitized)) return null;
    try {
      const baseUnits = BigInt(sanitized);
      if (baseUnits <= 0n) return null;
      return baseUnits * decimalsFactor;
    } catch {
      return null;
    }
  }

  function formatKaleBalance(balance: bigint): string {
    const whole = balance / decimalsFactor;
    const fraction = balance % decimalsFactor;
    const intWithCommas = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (fraction === 0n) return intWithCommas;

    const fractionStr = fraction.toString().padStart(kaleDecimals, '0').replace(/0+$/, '');
    return fractionStr ? `${intWithCommas}.${fractionStr}` : intWithCommas;
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

  async function sendKale(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    success = null;

    if (!userState.contractId || !userState.keyId) {
      openAuthSheet('signin', 'Sign in to transfer KALE.');
      return;
    }

    const destination = to.trim();
    if (!destination) {
      error = 'Enter a destination address.';
      return;
    }

    if (destination === userState.contractId) {
      error = 'You already control this address.';
      return;
    }

    const amountInUnits = parseAmount(amount);
    if (!amountInUnits) {
      error = 'Enter a valid whole-number amount.';
      return;
    }

    const currentBalance = balanceState.balance;
    if (typeof currentBalance === 'bigint' && amountInUnits > currentBalance) {
      error = 'Amount exceeds your available balance.';
      return;
    }

    submitting = true;
    try {
      const [{ kale, send }, { signWithPasskey }] = await Promise.all([
        getConnectedAccount(),
        import('../utils/passkeySign'),
      ]);

      let tx = await kale.transfer({
        from: userState.contractId,
        to: destination,
        amount: amountInUnits,
      });

      tx = await signWithPasskey(tx, { keyId: userState.keyId });

      await send(tx);
      await updateContractBalance(userState.contractId, { force: true });

      const displayAmount = formatKaleBalance(amountInUnits);
      success = `Sent ${displayAmount} KALE to ${shortenAddress(destination, 4)}.`;
      toast.success(success);
      to = '';
      amount = '';
    } catch (err) {
      logger.error('account', 'Failed to send KALE', err);
      error = err instanceof Error ? err.message : 'Transfer failed.';
    } finally {
      submitting = false;
    }
  }
</script>

<section class="app-container py-6 sm:py-8">
  <div class="mx-auto max-w-lg space-y-6">
    <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight text-ink-1">Account</h1>

    {#if !userState.contractId}
      <StateFeedback
        kind="empty"
        icon="wallet"
        title="Sign in to manage your wallet"
        message="View your Stellar smart wallet address, check your KALE balance, and send transfers."
        actionLabel="Sign in"
        onAction={() => openAuthSheet('signin')}
      />
    {:else}
      <!-- Wallet card -->
      <div class="rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-ink-2">Connected address</span>
          <Button variant="ghost" size="sm" onclick={copyAddress}>
            <Icon name="copy" size={14} />
            <span>Copy</span>
          </Button>
        </div>
        <p class="break-all font-mono text-xs text-ink-1">{userState.contractId}</p>
        <div class="border-t border-line pt-3">
          <p class="text-xs text-ink-2">KALE balance</p>
          {#if balanceState.loading}
            <Skeleton variant="line" class="mt-1.5 w-32" />
          {:else if typeof balanceState.balance === 'bigint'}
            <p class="tabular mt-0.5 text-xl font-semibold text-ink-1">
              {formatKaleBalance(balanceState.balance)} <span class="text-sm font-normal text-ink-2">KALE</span>
            </p>
          {:else}
            <p class="mt-0.5 text-sm text-ink-3">Unavailable</p>
          {/if}
        </div>
      </div>

      <!-- Send KALE form -->
      <form
        class="rounded-[var(--radius-control)] bg-surface-1 p-4 ring-1 ring-inset ring-line space-y-4"
        onsubmit={sendKale}
      >
        <h2 class="text-base font-semibold text-ink-1">Send KALE</h2>

        <label class="block">
          <span class="mb-1.5 block text-sm font-medium text-ink-2">Recipient address</span>
          <input
            id="account-to"
            type="text"
            class="input-ring min-h-11 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
            bind:value={to}
            placeholder="Stellar G... or C... address"
            autocomplete="off"
            required
          />
        </label>

        <label class="block">
          <span class="mb-1.5 block text-sm font-medium text-ink-2">Amount (KALE)</span>
          <input
            id="account-amount"
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            class="input-ring tabular min-h-11 w-full rounded-[var(--radius-control)] bg-canvas px-3.5 py-2.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
            bind:value={amount}
            placeholder="Whole number of KALE"
            required
          />
        </label>

        {#if error}
          <p role="alert" class="rounded-[var(--radius-control)] bg-danger/15 px-3 py-2 text-sm text-danger ring-1 ring-inset ring-danger/35">
            {error}
          </p>
        {/if}
        {#if success}
          <p role="status" class="rounded-[var(--radius-control)] bg-success/15 px-3 py-2 text-sm text-success ring-1 ring-inset ring-success/35">
            {success}
          </p>
        {/if}

        <Button type="submit" variant="primary" fullWidth loading={submitting}>
          {submitting ? 'Sending…' : 'Send KALE'}
        </Button>
      </form>

      <!-- Collapsible KALE guide -->
      <div class="rounded-[var(--radius-control)] bg-surface-1 ring-1 ring-inset ring-line overflow-hidden">
        <button
          type="button"
          class="focus-ring flex min-h-12 w-full items-center justify-between px-4 text-left text-sm font-semibold text-ink-1 hover:bg-white/5"
          aria-expanded={showKaleInfo}
          onclick={() => (showKaleInfo = !showKaleInfo)}
        >
          <span>About KALE</span>
          <Icon name="chevron-down" size={18} class={`text-ink-2 ${showKaleInfo ? 'rotate-180' : ''}`} />
        </button>

        {#if showKaleInfo}
          <div class="border-t border-line px-4 py-4 space-y-4 text-sm leading-relaxed text-ink-2">
            <p>
              KALE is the Stellar token used on SMOL to mint song collectibles (100 KALE), buy existing song tokens through the built-in AMM, and collect mixtapes.
            </p>
            <ul class="space-y-1.5 list-disc pl-5">
              <li>
                Farm KALE at <a href="https://kalefarm.xyz" target="_blank" rel="noopener noreferrer" class="text-ink-1 underline">kalefarm.xyz</a>
              </li>
              <li>
                Trade KALE/XLM on <a href="https://stellarx.com/markets/KALE:GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE/native" target="_blank" rel="noopener noreferrer" class="text-ink-1 underline">StellarX</a>
              </li>
              <li>
                Transfer KALE directly to your SMOL address from any Stellar wallet.
              </li>
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</section>
