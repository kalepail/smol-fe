<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { userState } from '../../stores/user.svelte';
  import { mixtapeDraftState, mixtapeModeState, openMixtapeSheet } from '../../stores/mixtape.svelte';
  import { openAccountSheet, openAuthSheet } from '../../stores/authSheet.svelte';
  import { useCurrentPath } from '../../hooks/useCurrentPath.svelte';
  import { shortenAddress } from '../../utils/address';
  import Icon from '../ui/Icon.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Button from '../ui/Button.svelte';

  interface Props {
    _kid: string | null;
    _cid: string | null;
  }

  let { _kid, _cid }: Props = $props();

  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);

  let searchQuery = $state('');
  let playlist = $state<string | null>(null);

  // Sync SSR cookie credentials into userState without eager wallet/RPC calls.
  let lastContractId = $state<string | null | undefined>(undefined);
  let lastKeyId = $state<string | null | undefined>(undefined);

  $effect(() => {
    if (_cid !== lastContractId || _kid !== lastKeyId) {
      lastContractId = _cid;
      lastKeyId = _kid;
      userState.contractId = _cid;
      userState.keyId = _kid;
      if (!_cid || !_kid) {
        userState.walletConnected = false;
      }
    }
  });

  const isAuthenticated = $derived(Boolean(userState.contractId));
  const draftCount = $derived(mixtapeDraftState.tracks.length);

  function syncFromLocation() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    searchQuery = url.pathname === '/search' ? (url.searchParams.get('q') ?? '') : '';
    try {
      playlist = localStorage.getItem('smol:playlist');
    } catch {
      playlist = null;
    }
  }

  onMount(() => {
    syncFromLocation();
    document.addEventListener('astro:page-load', syncFromLocation);
    return () => {
      document.removeEventListener('astro:page-load', syncFromLocation);
    };
  });

  function handleSearchSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = searchQuery.trim();
    const target = trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search';
    void navigate(target);
  }

  function handleOpenMixtape() {
    openMixtapeSheet();
  }
</script>

<header
  class="sticky top-0 z-30 border-b border-line bg-surface-1/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-lg"
>
  <div class="app-container flex h-14 items-center gap-3">
    <!-- Wordmark -->
    <a
      href="/"
      aria-label="SMOL"
      class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] pr-1 text-ink-1"
    >
      <svg
        width="82"
        height="22"
        viewBox="0 0 82 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        class="h-[22px] w-auto"
      >
        <!-- Crisp pixel-block wordmark for SMOL -->
        <rect x="0" y="2" width="16" height="4" fill="#9ae600" />
        <rect x="0" y="6" width="4" height="4" fill="#9ae600" />
        <rect x="0" y="9" width="16" height="4" fill="#9ae600" />
        <rect x="12" y="13" width="4" height="4" fill="#9ae600" />
        <rect x="0" y="16" width="16" height="4" fill="#9ae600" />

        <rect x="20" y="2" width="4" height="18" fill="#eef2f7" />
        <rect x="24" y="5" width="4" height="4" fill="#eef2f7" />
        <rect x="28" y="8" width="4" height="4" fill="#eef2f7" />
        <rect x="32" y="5" width="4" height="4" fill="#eef2f7" />
        <rect x="36" y="2" width="4" height="18" fill="#eef2f7" />

        <rect x="44" y="2" width="16" height="4" fill="#eef2f7" />
        <rect x="44" y="6" width="4" height="10" fill="#eef2f7" />
        <rect x="56" y="6" width="4" height="10" fill="#eef2f7" />
        <rect x="44" y="16" width="16" height="4" fill="#eef2f7" />

        <rect x="64" y="2" width="4" height="18" fill="#eef2f7" />
        <rect x="64" y="16" width="16" height="4" fill="#eef2f7" />
      </svg>
    </a>

    <!-- Desktop inline navigation (>=1024px) -->
    <nav aria-label="Primary" class="hidden lg:flex items-center gap-1">
      <a
        href="/"
        class={`focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium ${
          path === '/' ? 'bg-white/10 text-ink-1' : 'text-ink-2 hover:text-ink-1 hover:bg-white/5'
        }`}
      >
        Home
      </a>
      <a
        href="/mixtapes"
        class={`focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-sm font-medium ${
          path === '/mixtapes' || path.startsWith('/mixtapes/')
            ? 'bg-white/10 text-ink-1'
            : 'text-ink-2 hover:text-ink-1 hover:bg-white/5'
        }`}
      >
        <span>Mixtapes</span>
        {#if draftCount > 0}
          <span class="tabular rounded-full bg-accent/20 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
            {draftCount}
          </span>
        {/if}
      </a>
      {#if isAuthenticated}
        <a
          href="/created"
          class={`focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium ${
            path === '/created' ? 'bg-white/10 text-ink-1' : 'text-ink-2 hover:text-ink-1 hover:bg-white/5'
          }`}
        >
          Created
        </a>
        <a
          href="/liked"
          class={`focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium ${
            path === '/liked' ? 'bg-white/10 text-ink-1' : 'text-ink-2 hover:text-ink-1 hover:bg-white/5'
          }`}
        >
          Liked
        </a>
      {/if}
      {#if playlist}
        <a
          href={`/playlist/${encodeURIComponent(playlist)}`}
          class={`focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium ${
            path.startsWith('/playlist/') ? 'bg-white/10 text-ink-1' : 'text-ink-2 hover:text-ink-1 hover:bg-white/5'
          }`}
        >
          {playlist}
        </a>
      {/if}
    </nav>

    <!-- Desktop search field -->
    <form
      action="/search"
      onsubmit={handleSearchSubmit}
      class="hidden lg:block ml-auto w-full max-w-xs"
    >
      <label class="relative block">
        <span class="sr-only">Search songs</span>
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">
          <Icon name="search" size={16} />
        </span>
        <input
          type="search"
          name="q"
          bind:value={searchQuery}
          placeholder="Search songs"
          class="input-ring h-10 w-full rounded-[var(--radius-control)] bg-canvas pl-9 pr-3 text-base text-ink-1 ring-1 ring-inset ring-line placeholder:text-ink-3"
        />
      </label>
    </form>

    <!-- Right actions -->
    <div class="ml-auto flex shrink-0 items-center gap-1.5 lg:ml-2">
      <!-- Mobile search shortcut -->
      <div class="lg:hidden">
        <IconButton label="Search songs" href="/search">
          <Icon name="search" size={20} />
        </IconButton>
      </div>

      <!-- Desktop Create + Mixtape Draft -->
      <div class="hidden lg:flex items-center gap-2">
        {#if isAuthenticated}
          <Button
            variant={mixtapeModeState.active ? 'primary' : 'secondary'}
            size="sm"
            onclick={handleOpenMixtape}
          >
            <Icon name="mixtapes" size={16} />
            <span>{mixtapeModeState.active ? 'Mixtape draft' : 'New mixtape'}</span>
            {#if draftCount > 0}
              <span class="tabular rounded-full bg-black/25 px-1.5 text-xs">{draftCount}</span>
            {/if}
          </Button>
        {/if}

        <Button
          variant="secondary"
          size="sm"
          href="/create"
          class={path === '/create' ? 'ring-accent/50 text-ink-1' : ''}
        >
          <Icon name="plus" size={16} class="text-accent" />
          <span>Create</span>
        </Button>
      </div>

      {#if isAuthenticated && userState.contractId}
        <button
          type="button"
          onclick={openAccountSheet}
          aria-label="Open account menu"
          class="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-surface-2 px-3 text-sm font-medium text-ink-1 ring-1 ring-inset ring-line hover:bg-surface-3"
        >
          <Icon name="user" size={18} class="text-ink-2" />
          <span class="hidden sm:inline font-mono text-xs text-ink-2">
            {shortenAddress(userState.contractId)}
          </span>
        </button>
      {:else}
        <Button
          variant="secondary"
          size="sm"
          class="min-h-11"
          onclick={() => openAuthSheet('signin')}
        >
          Sign in
        </Button>
      {/if}
    </div>
  </div>
</header>
