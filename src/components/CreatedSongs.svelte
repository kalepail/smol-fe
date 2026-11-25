<script lang="ts">
  import { onDestroy } from 'svelte';
  import SmolGrid from './smol/SmolGrid.svelte';
  import Icon from './ui/Icon.svelte';
  import { userState } from '../stores/user.svelte';
  import {
    CREATED_QUERY_MAX,
    activeCreatedQuery,
    readCreatedQuery,
    withCreatedQuery,
  } from '../utils/createdQuery';

  const DEBOUNCE_MS = 250;

  // client:only island: `window` is always available here.
  const initialInput = readCreatedQuery(window.location.search);
  let input = $state(initialInput);
  let query = $state(activeCreatedQuery(initialInput));
  // The account the query was typed for (`null` = a signed-out deep link, applied once signed in).
  let queryOwner = $state(userState.contractId);
  let inputEl = $state<HTMLInputElement | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Never send one account's query for another: drop it in the same tick the account changes.
  const gridQuery = $derived(queryOwner === null || queryOwner === userState.contractId ? query : '');

  function commit(value: string) {
    clearTimeout(timer);
    const next = activeCreatedQuery(value);
    if (next === query) return;
    query = next;
    window.history.replaceState(window.history.state, '', withCreatedQuery(window.location.href, next));
  }

  function clear() {
    input = '';
    commit('');
    inputEl?.focus();
  }

  $effect(() => {
    const account = userState.contractId;
    if (account === queryOwner) return;
    if (queryOwner !== null) {
      input = '';
      commit('');
    }
    queryOwner = account;
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
