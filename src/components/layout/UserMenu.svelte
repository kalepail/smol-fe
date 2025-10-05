<script lang="ts">
  import { onMount } from 'svelte';
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
  import Loader from '../Loader.svelte';

  interface Props {
    initialKeyId: string | null;
    initialContractId: string | null;
  }

  let { initialKeyId, initialContractId }: Props = $props();

  let creating = $state(false);

  onMount(async () => {
    setUserAuth(initialContractId, initialKeyId);

    if (userState.keyId) {
      if (!userState.contractId) {
        const { contractId: cid } = await account.connectWallet({
          rpId: getDomain(window.location.hostname) ?? undefined,
          keyId: userState.keyId,
        });
        userState.contractId = cid;
      } else {
        await account.connectWallet({
          rpId: getDomain(window.location.hostname) ?? undefined,
          keyId: userState.keyId,
        });
      }
    }
  });

  $effect(() => {
    const cid = userState.contractId;
    if (cid) {
      updateContractBalance(cid);
    } else {
      resetBalance();
    }
  });

  async function login() {
    const {
      rawResponse,
      keyIdBase64,
      contractId: cid,
    } = await account.connectWallet({
      rpId: getDomain(window.location.hostname) ?? undefined,
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

      const {
        rawResponse,
        keyIdBase64,
        contractId: cid,
        signedTx,
      } = await account.createWallet('smol.xyz', `SMOL — ${username}`, {
        rpId: getDomain(window.location.hostname) ?? undefined,
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

<div class="flex items-center ml-auto gap-3">
  {#if isAuthenticated}
    <div class="flex items-center gap-3 my-2">
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
        class="hover:underline {!import.meta.env.SSR && location.pathname.endsWith('create') && 'underline'}"
        href="/create">+ Create</a
      >
    </div>

    <a
      class="font-mono text-sm underline ml-5"
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
