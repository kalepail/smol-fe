<script lang="ts">
  import { userState, ensureWalletConnected } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance, resetBalance } from '../../stores/balance.svelte';
  import {
    mixtapeModeState,
    mixtapeDraftHasContent,
    enterMixtapeMode,
    exitMixtapeMode,
  } from '../../stores/mixtape.svelte';
  import { useAuthentication } from '../../hooks/useAuthentication';
  import { useCurrentPath, currentPathState } from '../../hooks/useCurrentPath.svelte.ts';
  import AuthButtons from './AuthButtons.svelte';
  import UserBalance from './UserBalance.svelte';
  import MixtapeModeToggle from './MixtapeModeToggle.svelte';

  interface Props {
    initialKeyId: string | null;
    initialContractId: string | null;
  }

  let { initialKeyId, initialContractId }: Props = $props();

  const authHook = useAuthentication();
  useCurrentPath();

  let creating = $state(false);

  // Initialize user state from server props
  userState.contractId = initialContractId;
  userState.keyId = initialKeyId;

  // Track last processed auth state to prevent duplicate operations
  let lastProcessedContractId = $state<string | null>(null);
  let lastProcessedKeyId = $state<string | null>(null);

  // React to prop changes during navigation
  $effect(() => {
    // Only process if props actually changed
    if (initialContractId !== lastProcessedContractId || initialKeyId !== lastProcessedKeyId) {
      lastProcessedContractId = initialContractId;
      lastProcessedKeyId = initialKeyId;

      // Update userState
      userState.contractId = initialContractId;
      userState.keyId = initialKeyId;

      if (initialContractId && initialKeyId) {

        // User authenticated - connect wallet and fetch balance
        ensureWalletConnected().catch((error) => {
          console.error('[UserMenu] Failed to connect wallet:', error);
        });

        updateContractBalance(initialContractId).catch((error) => {
          console.error('[UserMenu] Failed to fetch balance:', error);
        });
      } else {
        // User logged out - reset balance
        resetBalance();
      }
    }
  });

  async function handleLogin() {
    await authHook.login();
  }

  async function handleSignUp() {
    creating = true;

    try {
      const username = prompt('Enter your username');

      if (!username) {
        throw new Error('Username is required');
      }

      await authHook.signUp(username);
    } finally {
      creating = false;
    }
  }

  async function handleLogout() {
    await authHook.logout();
  }

  function handleMixtapeClick() {
    if (mixtapeModeState.active) {
      if (mixtapeDraftHasContent.current) {
        const confirmed = confirm('Exit Mixtape Mode? Your draft will stay saved locally.');
        if (!confirmed) return;
      }
      exitMixtapeMode();
    } else {
      enterMixtapeMode();
    }
  }

  const isAuthenticated = $derived(userState.contractId !== null);
</script>

{#if isAuthenticated}
  <div class="flex items-center gap-3">
    <MixtapeModeToggle
      active={mixtapeModeState.active}
      hasDraft={mixtapeDraftHasContent.current}
      onClick={handleMixtapeClick}
    />

    <a
      class="hover:underline {currentPathState.path === '/create' ? 'underline' : ''}"
      href="/create">+ Create</a
    >
  </div>
{/if}

<div class="flex items-center gap-3 ml-auto">
  {#if isAuthenticated && userState.contractId}
    <UserBalance
      contractId={userState.contractId}
      balance={balanceState.balance}
      loading={balanceState.loading}
    />
  {/if}

  <AuthButtons
    {isAuthenticated}
    {creating}
    onLogin={handleLogin}
    onSignUp={handleSignUp}
    onLogout={handleLogout}
  />
</div>
