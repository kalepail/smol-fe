<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { syncUserAuthFromCookie, userState } from '../../stores/user.svelte';
  import {
    mixtapeActive,
    mixtapeEditState,
    mixtapeDraftHasContent,
    mixtapeSheetState,
    openMixtapeSheet,
  } from '../../stores/mixtape.svelte';
  import { openAccountSheet, openAuthSheet } from '../../stores/authSheet.svelte';
  import { useCurrentPath } from '../../hooks/useCurrentPath.svelte';
  import { shortenAddress } from '../../utils/address';
  import {
    balanceState,
    ensureContractBalance,
    releaseKalePageHold,
    resetBalance,
  } from '../../stores/balance.svelte';
  import { formatCompactKaleBalance, formatKaleBalance } from '../../utils/kaleFormatting';
  import { subscribeAuthTransitions } from '../../services/api/auth';
  import { e2eSeams } from '../../utils/collectSeams';
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

  // Page islands (mixtape snapshot, /account) start (or claim) their batched
  // reads first. The live session is re-validated before the deferred read.
  const BALANCE_DEFER_MS = 120;
  // On a mixtape detail page the SSR page marks the island that owns the KALE
  // read (its 49-key collector snapshot carries the KALE key). Until it
  // hydrates and claims, the shell holds instead of racing it with a 1-key
  // read, however slow its JS. The hold ends only when the island claims, the
  // page changes, or the island's code fails to load.
  const PAGE_OWNER_MARKER = 'template[data-kale-page-owner]';

  /** Islands whose modules failed to load: they can never claim, so never wait on them again. */
  const failedPageOwners = new WeakSet<Element>();

  /** This page's KALE-owning island, while it has not hydrated yet (and still can). */
  function pendingPageOwner(): Element | null {
    if (typeof document === 'undefined') return null;
    const island = document.querySelector(PAGE_OWNER_MARKER)?.nextElementSibling;
    if (!island || failedPageOwners.has(island)) return null;
    return island.localName === 'astro-island' && island.hasAttribute('ssr') ? island : null;
  }

  /**
   * Explicit page error: import the island's own modules (shared with its
   * in-flight hydration, no extra fetch). If they fail, the island can never
   * claim, so the hold is released and the shell reads the key itself.
   */
  let watchedPageOwner: Element | null = null;
  function watchPageOwnerLoad(island: Element) {
    if (watchedPageOwner === island) return;
    watchedPageOwner = island;
    const urls = ['component-url', 'renderer-url']
      .map((name) => island.getAttribute(name))
      .filter((url): url is string => Boolean(url));
    Promise.all(urls.map((url) => import(/* @vite-ignore */ url))).catch(() => {
      // Remembered for this island: a later account switch (A→B) on the same
      // page reads B's balance itself instead of holding for a dead island.
      failedPageOwners.add(island);
      if (island.isConnected && island.hasAttribute('ssr')) releaseKalePageHold();
    });
  }

  function reconcileSession() {
    if (syncUserAuthFromCookie()) resetBalance();
  }

  function ensureHeaderBalance() {
    const wallet = userState.contractId;
    const pageOwner = pendingPageOwner();
    if (!pageOwner) releaseKalePageHold();
    if (!wallet) return;
    if (pageOwner) watchPageOwnerLoad(pageOwner);
    ensureContractBalance(wallet, {
      deferMs: e2eSeams()?.balanceDeferMs ?? BALANCE_DEFER_MS,
      awaitPageOwner: pageOwner !== null,
    });
  }

  // Reconcile against the live document.cookie smol_token (never restoring
  // identity from stale SSR props after cross-tab logout or expiry).
  $effect(() => {
    void _cid;
    void _kid;
    reconcileSession();
  });

  const isAuthenticated = $derived(Boolean(userState.contractId));

  // Auto-load the header KALE balance whenever signed in (first load, sign-in,
  // account switch). Signed out: no read, ever.
  $effect(() => {
    if (userState.contractId) untrack(ensureHeaderBalance);
  });

  // Only this wallet's balance is ever shown; an error never renders as 0.
  const headerBalance = $derived(
    userState.contractId && balanceState.address === userState.contractId ? balanceState.balance : null
  );
  const headerBalanceLoading = $derived(
    Boolean(userState.contractId) && headerBalance === null && !balanceState.error
  );
  const headerBalanceExact = $derived(headerBalance === null ? null : `${formatKaleBalance(headerBalance)} KALE`);
  const accountButtonLabel = $derived(
    headerBalanceExact ? `Open account menu, ${headerBalanceExact}` : 'Open account menu'
  );
  const draftCount = $derived(mixtapeActive.current.tracks.length);
  const isEditingMixtape = $derived(mixtapeEditState.session !== null);
  const hasActiveDraft = $derived(
    isEditingMixtape || mixtapeDraftHasContent.current || mixtapeSheetState.browsingDraft
  );

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

  function handleNavigationSync() {
    reconcileSession();
    syncFromLocation();
    // ViewTransition navigation: SWR refresh (no-op while fresh or in flight).
    ensureHeaderBalance();
  }

  // Another tab signed out / switched accounts, or this tab is returning to
  // the foreground: reconcile against the live session cookie immediately
  // (never keep showing a signed-out wallet's pill until the next navigation).
  function handleVisibility() {
    if (document.visibilityState === 'visible') reconcileSession();
  }

  onMount(() => {
    syncFromLocation();
    document.addEventListener('astro:after-swap', handleNavigationSync);
    document.addEventListener('astro:page-load', handleNavigationSync);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', reconcileSession);
    const unsubscribeAuth = subscribeAuthTransitions(reconcileSession);
    return () => {
      document.removeEventListener('astro:after-swap', handleNavigationSync);
      document.removeEventListener('astro:page-load', handleNavigationSync);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', reconcileSession);
      unsubscribeAuth();
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
            variant={hasActiveDraft ? 'primary' : 'secondary'}
            size="sm"
            onclick={handleOpenMixtape}
          >
            <Icon name="mixtapes" size={16} />
            <span>{isEditingMixtape ? 'Editing mixtape' : hasActiveDraft ? 'Mixtape draft' : 'New mixtape'}</span>
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
          aria-label={accountButtonLabel}
          title={headerBalanceExact ?? undefined}
          data-account-pill
          class="focus-ring inline-flex min-h-11 min-w-11 max-w-[11rem] items-center justify-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-medium text-ink-1 ring-1 ring-inset ring-line hover:bg-surface-3 sm:max-w-none sm:gap-2"
        >
          <Icon name="user" size={18} class="shrink-0 text-ink-2" />
          {#if headerBalance !== null}
            <span data-header-balance class="tabular truncate whitespace-nowrap text-xs font-semibold text-ink-1">
              {formatCompactKaleBalance(headerBalance)} <span class="font-medium text-ink-2">KALE</span>
            </span>
          {:else if headerBalanceLoading}
            <span
              data-header-balance-loading
              aria-hidden="true"
              class="h-3 w-12 shrink-0 animate-pulse rounded-full bg-white/10"
            ></span>
          {/if}
          <span class="hidden shrink-0 items-center gap-2 sm:inline-flex">
            {#if headerBalance !== null || headerBalanceLoading}
              <span aria-hidden="true" class="text-ink-3">·</span>
            {/if}
            <span class="font-mono text-xs text-ink-2">{shortenAddress(userState.contractId)}</span>
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
