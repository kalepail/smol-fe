<script lang="ts">
  import { onDestroy } from 'svelte';
  import SmolGrid from './smol/SmolGrid.svelte';
  import Icon from './ui/Icon.svelte';
  import { userState } from '../stores/user.svelte';
  import {
    CREATED_QUERY_MAX,
    activeCreatedQuery,
    isForeignCreatedQuery,
    readCreatedQuery,
    stampCreatedQueryOwner,
    withCreatedQuery,
  } from '../utils/createdQuery';

  const DEBOUNCE_MS = 250;

  // client:only island: `window` is always available here. A `?q=` restored from another
  // account's history entry (Back after an account switch) is discarded before any fetch.
  // Astro dev also pre-hydrates the next client:only page in a hidden same-origin iframe
  // (a fresh document without our history.state): it never applies or rewrites the query.
  const previewFrame = window.frameElement !== null;
  const foreignQuery = !previewFrame && isForeignCreatedQuery(window.history.state, userState.contractId);
  const initialInput = previewFrame || foreignQuery ? '' : readCreatedQuery(window.location.search);
  let input = $state(initialInput);
  let query = $state(activeCreatedQuery(initialInput));
  // The account the query was typed for (`null` = a signed-out deep link, applied once signed in).
  let queryOwner = $state(userState.contractId);
  let inputEl = $state<HTMLInputElement | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Mirror the query into the URL and stamp its owner on this history entry (no new entry). */
  function writeUrl() {
    if (previewFrame) return;
    window.history.replaceState(
      stampCreatedQueryOwner(window.history.state, query ? queryOwner : null),
      '',
      withCreatedQuery(window.location.href, query)
    );
  }

  if (foreignQuery || activeCreatedQuery(initialInput)) writeUrl();

  // Never send one account's query for another: drop it in the same tick the account changes.
  const gridQuery = $derived(queryOwner === null || queryOwner === userState.contractId ? query : '');

  function commit(value: string) {
    clearTimeout(timer);
    // Unchanged trimmed value: no refetch, but the URL is still normalized (e.g. `?q=%20%20` → none).
    query = activeCreatedQuery(value);
    writeUrl();
  }

  function clear() {
    input = '';
    commit('');
    inputEl?.focus();
  }

  $effect(() => {
    const account = userState.contractId;
    if (account === queryOwner) return;
    const previous = queryOwner;
    queryOwner = account;
    if (previous !== null) {
      input = '';
      commit('');
    } else if (query) {
      writeUrl();
    }
  });

  onDestroy(() => clearTimeout(timer));
</script>

<SmolGrid
  endpoint="created"
  heading="Created"
  emptyTitle="No created songs yet"
  query={gridQuery}
  emptyState={gridQuery
    ? {
        title: 'No matching songs',
        message: `No created songs match “${gridQuery}”.`,
        icon: 'search',
        actionLabel: 'Clear search',
        onAction: clear,
      }
    : undefined}
>
  {#snippet toolbar()}
    {#if userState.contractId}
      <form
        role="search"
        class="mb-5 max-w-xl"
        onsubmit={(event) => {
          event.preventDefault();
          commit(input);
        }}
      >
        <div class="relative">
          <label>
            <span class="sr-only">Filter your songs by title</span>
            <span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
              <Icon name="search" size={18} />
            </span>
            <input
              bind:this={inputEl}
              bind:value={input}
              oninput={() => {
                clearTimeout(timer);
                timer = setTimeout(() => commit(input), DEBOUNCE_MS);
              }}
              type="search"
              name="q"
              maxlength={CREATED_QUERY_MAX}
              autocomplete="off"
              enterkeyhint="search"
              placeholder="Filter by title"
              class="input-ring min-h-11 w-full rounded-[var(--radius-control)] bg-surface-1 pl-10 pr-12 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none"
            />
          </label>
          {#if input}
            <button
              type="button"
              aria-label="Clear title filter"
              title="Clear title filter"
              class="focus-ring absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-ink-3 hover:text-ink-1"
              onclick={clear}
            >
              <Icon name="x" size={16} />
            </button>
          {/if}
        </div>
      </form>
    {/if}
  {/snippet}
</SmolGrid>
