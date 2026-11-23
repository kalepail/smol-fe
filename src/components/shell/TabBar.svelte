<script lang="ts">
  import { userState } from '../../stores/user.svelte';
  import {
    mixtapeDraftState,
    mixtapeDraftHasContent,
    mixtapeSheetState,
    openMixtapeSheet,
  } from '../../stores/mixtape.svelte';
  import {
    accountSheetState,
    authSheetState,
    closeAccountSheet,
    openAccountSheet,
    openAuthSheet,
  } from '../../stores/authSheet.svelte';
  import { confirmState } from '../../stores/confirm.svelte';
  import { generationsState, clearReadyNotifications } from '../../stores/generations.svelte';
  import { useCurrentPath } from '../../hooks/useCurrentPath.svelte';
  import Icon from '../ui/Icon.svelte';
  import ToastHost from '../ui/ToastHost.svelte';

  const currentPath = useCurrentPath();
  const path = $derived(currentPath.path);
  const isAuthenticated = $derived(Boolean(userState.contractId));
  const draftCount = $derived(mixtapeDraftState.tracks.length);
  const hasDraft = $derived(mixtapeDraftHasContent.current);
  const showDraftPill = $derived(
    isAuthenticated && (hasDraft || mixtapeSheetState.browsingDraft) && !mixtapeSheetState.open
  );
  const draftLabel = $derived(mixtapeDraftState.title.trim() || 'Mixtape draft');
  const hasReady = $derived(generationsState.readyIds.length > 0);

  let AccountSheetComp = $state<typeof import('./AccountSheet.svelte').default | null>(null);
  let AuthSheetComp = $state<typeof import('./AuthSheet.svelte').default | null>(null);
  let ConfirmSheetComp = $state<typeof import('../ui/ConfirmSheet.svelte').default | null>(null);

  $effect(() => {
    if (accountSheetState.open && !AccountSheetComp) {
      void import('./AccountSheet.svelte').then((mod) => {
        AccountSheetComp = mod.default;
      });
    }
  });

  $effect(() => {
    if (authSheetState.open && !AuthSheetComp) {
      void import('./AuthSheet.svelte').then((mod) => {
        AuthSheetComp = mod.default;
      });
    }
  });

  $effect(() => {
    if (confirmState.open && !ConfirmSheetComp) {
      void import('../ui/ConfirmSheet.svelte').then((mod) => {
        ConfirmSheetComp = mod.default;
      });
    }
  });

  const isHome = $derived(path === '/');
  const isSearch = $derived(path === '/search');
  const isCreate = $derived(path === '/create');
  const isMixtapes = $derived(path === '/mixtapes' || path.startsWith('/mixtapes/'));
  const isLibrary = $derived(path === '/created' || path === '/liked' || path === '/account');

  function handleYouClick() {
    if (isAuthenticated) {
      clearReadyNotifications();
      openAccountSheet();
    } else {
      openAuthSheet('signin', 'Sign in to view your library and wallet.');
    }
  }
</script>

<!-- Mobile bottom tab bar (<1024px) — max 2 fixed bars total with PlayerDock -->
<nav
  aria-label="Mobile navigation"
  class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-1/95 pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] backdrop-blur-lg lg:hidden"
>
  <div class="grid h-14 grid-cols-5 items-center">
    <a
      href="/"
      aria-current={isHome ? 'page' : undefined}
      class={`focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
        isHome ? 'text-ink-1' : 'text-ink-2'
      }`}
    >
      <span class="flex h-6 items-center justify-center">
        <Icon name={isHome ? 'home-solid' : 'home'} size={20} />
      </span>
      <span>Home</span>
    </a>

    <a
      href="/search"
      aria-current={isSearch ? 'page' : undefined}
      class={`focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
        isSearch ? 'text-ink-1' : 'text-ink-2'
      }`}
    >
      <span class="flex h-6 items-center justify-center">
        <Icon name="search" size={20} />
      </span>
      <span>Search</span>
    </a>

    <a
      href="/create"
      aria-current={isCreate ? 'page' : undefined}
      class="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-1"
    >
      <span
        class={`flex h-6 w-10 items-center justify-center rounded-full ${
          isCreate
            ? 'bg-accent text-on-accent'
            : 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/35'
        }`}
      >
        <Icon name="plus" size={16} />
      </span>
      <span class={isCreate ? 'text-accent' : 'text-ink-2'}>Create</span>
    </a>

    <!-- Mixtapes tab is ALWAYS reachable (never hijacked by draft state — B-05) -->
    <a
      href="/mixtapes"
      aria-current={isMixtapes ? 'page' : undefined}
      class={`focus-ring relative flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
        isMixtapes ? 'text-ink-1' : 'text-ink-2'
      }`}
    >
      <span class="relative flex h-6 items-center justify-center">
        <Icon name={isMixtapes ? 'mixtapes-solid' : 'mixtapes'} size={20} />
        {#if draftCount > 0}
          <span
            aria-label={`${draftCount} tracks in mixtape draft`}
            class="tabular absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent"
          >
            {draftCount}
          </span>
        {/if}
      </span>
      <span>Mixtapes</span>
    </a>

    <button
      type="button"
      onclick={handleYouClick}
      aria-label={isAuthenticated ? 'You and library' : 'Sign in'}
      class={`focus-ring relative flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
        isLibrary ? 'text-ink-1' : 'text-ink-2'
      }`}
    >
      <span class="relative flex h-6 items-center justify-center">
        <Icon name={isLibrary ? 'user-solid' : 'user'} size={20} />
        {#if hasReady}
          <span
            class="absolute -right-1 top-0 size-2 rounded-full bg-accent"
            aria-hidden="true"
          ></span>
        {/if}
      </span>
      <span>{isAuthenticated ? 'You' : 'Sign in'}</span>
    </button>
  </div>
</nav>

<!-- Compact floating draft pill on mobile when a draft is active and builder is closed -->
{#if showDraftPill}
  <button
    type="button"
    onclick={() => openMixtapeSheet('builder')}
    aria-label={draftCount > 0 ? `Open mixtape draft (${draftCount})` : 'Open mixtape draft'}
    class="draft-floating-pill focus-ring fixed right-[max(0.75rem,env(safe-area-inset-right,0px))] z-30 inline-flex min-h-11 max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full bg-surface-2/95 pl-3.5 pr-3 text-xs font-medium text-ink-1 ring-1 ring-inset ring-accent/45 backdrop-blur-lg hover:bg-surface-3 lg:hidden"
  >
    <span class="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
    <span class="truncate">{draftLabel}</span>
    <span class="tabular shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
      {draftCount}
    </span>
    <Icon name="chevron-right" size={14} class="text-ink-2" />
  </button>
{/if}

{#if AccountSheetComp}
  <AccountSheetComp open={accountSheetState.open} onClose={closeAccountSheet} />
{/if}
{#if AuthSheetComp}
  <AuthSheetComp />
{/if}
{#if ConfirmSheetComp}
  <ConfirmSheetComp />
{/if}
<ToastHost />
