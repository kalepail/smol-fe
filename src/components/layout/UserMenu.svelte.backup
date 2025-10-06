<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Cookies from 'js-cookie';
  import { getDomain } from 'tldts';
  import { userState, setUserAuth, clearUserAuth } from '../../stores/user.svelte';
  import { balanceState, updateContractBalance, resetBalance } from '../../stores/balance.svelte';
  import {
    mixtapeModeState,
    mixtapeDraftHasContent,
    enterMixtapeMode,
    exitMixtapeMode,
  } from '../../stores/mixtape.svelte';
  import { account, server } from '../../utils/passkey-kit';
  import { truncate } from '../../utils/base';
  import Loader from '../ui/Loader.svelte';

  interface Props {
    initialKeyId: string | null;
    initialContractId: string | null;
    initialBalance: string | null;
  }

  let { initialKeyId, initialContractId, initialBalance }: Props = $props();

  // Initialize user state synchronously from server-rendered props
  // This prevents flash of unauthenticated state
  if (initialKeyId && initialContractId && !userState.keyId && !userState.contractId) {
    userState.contractId = initialContractId;
    userState.keyId = initialKeyId;
  }

  // Initialize balance state synchronously from server-rendered props
  // This prevents flash of loading state
  if (initialBalance && balanceState.balance === null) {
    balanceState.balance = BigInt(initialBalance);
  }

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
        const rpId = getDomain(window.location.hostname);
        const rpIdValue = rpId ?? undefined;
        const keyId = userState.keyId ?? undefined;

        if (!userState.contractId) {
          const { contractId: cid } = await account.connectWallet({
            rpId: rpIdValue,
            keyId,
          });
          userState.contractId = cid;
        } else {
          await account.connectWallet({
            rpId: rpIdValue,
            keyId,
          });
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

  async function login() {
    const rpId = getDomain(window.location.hostname);
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = await account.connectWallet({
      rpId: rpId !== null ? rpId : undefined,
    });

    const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'connect',
        keyId: keyIdBase64,
        contractId: cid,
        response: rawResponse,
      }),
    }).then(async (res) => {
      if (res.ok) return res.text();
      throw await res.text();
    });

    setUserAuth(cid, keyIdBase64);

    Cookies.set('smol_token', jwt, {
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain: '.smol.xyz',
      expires: 30,
    });
  }

  async function signUp() {
    creating = true;

    try {
      const username = prompt('Enter your username');

      if (!username) {
        throw new Error('Username is required');
      }

      const rpId = getDomain(window.location.hostname);
      const {
        rawResponse,
        keyIdBase64,
        contractId: cid,
        signedTx,
      } = await account.createWallet('smol.xyz', `SMOL — ${username}`, {
        rpId: rpId !== null ? rpId : undefined,
      });

      const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'create',
          keyId: keyIdBase64,
          contractId: cid,
          response: rawResponse,
          username,
        }),
      }).then(async (res) => {
        if (res.ok) return res.text();
        throw await res.text();
      });

      await server.send(signedTx);

      setUserAuth(cid, keyIdBase64);

      Cookies.set('smol_token', jwt, {
        path: '/',
        secure: true,
        sameSite: 'Lax',
        domain: '.smol.xyz',
        expires: 30,
      });
    } finally {
      creating = false;
    }
  }

  function handleMixtapeClick() {
    if (mixtapeModeState.active) {
      if (mixtapeDraftHasContent.value) {
        const confirmed = confirm('Exit Mixtape Mode? Your draft will stay saved locally.');
        if (!confirmed) return;
      }
      exitMixtapeMode();
    } else {
      enterMixtapeMode();
    }
  }

  async function logout() {
    clearUserAuth();

    Cookies.remove('smol_token', {
      path: '/',
      secure: true,
      sameSite: 'Lax',
      domain: '.smol.xyz',
    });

    Object.keys(localStorage).forEach((key) => {
      if (key.includes('smol:')) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach((key) => {
      if (key.includes('smol:')) {
        sessionStorage.removeItem(key);
      }
    });

    await fetch(`${import.meta.env.PUBLIC_API_URL}/logout`, {
      method: 'POST',
    });

    location.reload();
  }

  const isAuthenticated = $derived(userState.contractId !== null);
</script>

{#if isAuthenticated}
  <div class="flex items-center gap-3">
    <button
      class={`rounded px-2 py-1 text-sm transition-colors ${
        mixtapeModeState.active
          ? 'bg-lime-400 text-slate-950 hover:bg-lime-300'
          : 'text-lime-400 ring-1 ring-lime-400/40 hover:bg-lime-400/10'
      }`}
      onclick={handleMixtapeClick}
    >
      <span class="mr-1">{mixtapeModeState.active ? 'Mixtape Mode' : '+ Mixtape'}</span>
      {#if !mixtapeModeState.active && mixtapeDraftHasContent.value}
        <span class="inline-block h-2 w-2 rounded-full bg-lime-300 align-middle"></span>
      {/if}
    </button>

    <a
      class="hover:underline {currentPath === '/create' ? 'underline' : ''}"
      href="/create">+ Create</a
    >
  </div>
{/if}

<div class="flex items-center gap-3 ml-auto">
  {#if isAuthenticated}
    <a
      class="font-mono text-sm underline"
      href="https://stellar.expert/explorer/public/contract/{userState.contractId}"
      target="_blank">{truncate(userState.contractId!, 4)}</a
    >
    <a
      class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded-full px-2 py-1 flex items-center justify-center min-w-[80px]"
      href="/account"
    >
      {#if balanceState.loading}
        <Loader classNames="w-4 h-4" textColor="text-lime-500" />
      {:else if balanceState.balance !== null}
        {(() => {
          const raw = Number(balanceState.balance) / 1e7;
          const [int, dec] = raw.toFixed(7).split('.');
          const intWithCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          if (Number(dec) > 0) {
            const trimmedDec = dec.replace(/0+$/, '');
            return `${intWithCommas}.${trimmedDec} KALE`;
          }
          return `${intWithCommas} KALE`;
        })()}
      {/if}
    </a>
    <button
      class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1"
      onclick={logout}>Logout</button
    >
  {:else}
    <button class="mr-5 hover:underline" onclick={login}>Login</button>
    <button
      class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
      onclick={signUp}
      disabled={creating}
      >{creating ? 'Creating...' : 'Create New Account'}</button
    >
  {/if}
</div>
