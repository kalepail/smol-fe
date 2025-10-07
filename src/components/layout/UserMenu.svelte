<script lang="ts">
  import { onMount } from 'svelte';
  import { userState, hydrateUserState, ensureWalletConnected } from '../../stores/user.svelte';
  import { balanceState, hydrateBalance, updateContractBalance, resetBalance } from '../../stores/balance.svelte';
  import {
    mixtapeModeState,
    mixtapeDraftHasContent,
    enterMixtapeMode,
    exitMixtapeMode,
  } from '../../stores/mixtape.svelte';
  import { useAuthentication } from '../../hooks/useAuthentication';
  import AuthButtons from './AuthButtons.svelte';
  import UserBalance from './UserBalance.svelte';
  import MixtapeModeToggle from './MixtapeModeToggle.svelte';

  interface Props {
    initialKeyId: string | null;
    initialContractId: string | null;
    initialBalance: string | null;
  }

  let { initialKeyId, initialContractId, initialBalance }: Props = $props();

  const authHook = useAuthentication();

  let creating = $state(false);
  let currentPath = $state(typeof window !== 'undefined' ? location.pathname : '');

  // Hydrate stores from server data ONCE on component creation (synchronous)
  hydrateUserState(initialContractId, initialKeyId);
  hydrateBalance(initialBalance);

  onMount(() => {
    const updatePath = () => {
      currentPath = location.pathname;
    };

    document.addEventListener('astro:page-load', updatePath);

    // Connect wallet after initial hydration if authenticated
    if (userState.contractId && userState.keyId) {
      ensureWalletConnected().catch((error) => {
        console.error('[UserMenu] Failed to connect wallet:', error);
      });
    }

    return () => {
      document.removeEventListener('astro:page-load', updatePath);
    };
  });

  // Handle prop updates during navigation (only if values actually changed)
  $effect(() => {
    const authChanged =
      userState.contractId !== initialContractId || userState.keyId !== initialKeyId;

    if (authChanged) {
      userState.contractId = initialContractId;
      userState.keyId = initialKeyId;

      if (initialContractId && initialKeyId) {
        ensureWalletConnected().catch((error) => {
          console.error('[UserMenu] Failed to connect wallet:', error);
        });
      }
    }

    // Update balance if it changed (but don't trigger loading state)
    if (initialBalance !== null && balanceState.balance !== BigInt(initialBalance)) {
      balanceState.balance = BigInt(initialBalance);
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
      class="hover:underline {currentPath === '/create' ? 'underline' : ''}"
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
