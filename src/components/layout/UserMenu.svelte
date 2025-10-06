<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { userState } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance, resetBalance } from '../../stores/balance.svelte';
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

  // Initialize state immediately (before render) to prevent flash
  if (initialKeyId && initialContractId && !userState.keyId && !userState.contractId) {
    userState.contractId = initialContractId;
    userState.keyId = initialKeyId;
  }

  // Always sync server balance to prevent stale persisted state
  if (initialBalance !== null) {
    balanceState.balance = BigInt(initialBalance);
  }

  const authHook = useAuthentication();

  let creating = $state(false);
  let currentPath = $state(typeof window !== 'undefined' ? location.pathname : '');
  let initialized = $state(false);

  onMount(() => {
    const updatePath = () => {
      currentPath = location.pathname;
    };

    document.addEventListener('astro:page-load', updatePath);

    // Connect wallet if we have keyId but haven't initialized yet
    if (userState.keyId && !initialized) {
      initialized = true;

      (async () => {
        const keyId = userState.keyId ?? undefined;

        if (!userState.contractId) {
          const cid = await authHook.connectWalletOnMount(keyId, userState.contractId);
          if (cid) {
            userState.contractId = cid;
          }
        } else {
          await authHook.connectWalletOnMount(keyId, userState.contractId);
        }
      })();
    }

    return () => {
      document.removeEventListener('astro:page-load', updatePath);
    };
  });

  $effect(() => {
    const cid = userState.contractId;
    if (cid) {
      // Only fetch balance if we don't already have it (e.g., from server-side render)
      // Use untrack to prevent balance state changes from triggering this effect
      untrack(() => {
        if (balanceState.balance === null && !balanceState.loading) {
          updateContractBalance(cid);
        }
      });
    } else {
      untrack(() => {
        resetBalance();
      });
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
