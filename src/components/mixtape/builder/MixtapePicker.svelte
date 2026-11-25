<script lang="ts">
  import { onMount } from 'svelte';
  import type { Smol } from '../../../types/domain';
  import { searchSmols } from '../../../services/api/search';
  import { fetchWithTimeout, throwIfNotOk } from '../../../services/api/fetch';
  import { mixtapeTrackIds, toggleDraftTrack } from '../../../stores/mixtape.svelte';
  import { userState } from '../../../stores/user.svelte';
  import { shortenAddress } from '../../../utils/address';
  import CoverArt from '../../ui/CoverArt.svelte';
  import Icon from '../../ui/Icon.svelte';
  import Chip from '../../ui/Chip.svelte';
  import Loader from '../../ui/Loader.svelte';
  import Button from '../../ui/Button.svelte';

  type SourceTab = 'suggested' | 'liked' | 'created';

  let activeSource = $state<SourceTab>('suggested');
  let query = $state('');
  let items = $state<Smol[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const API_URL = import.meta.env.PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
  let fetchSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  function parseSmolList(raw: unknown): Smol[] {
    if (Array.isArray(raw)) return raw as Smol[];
    if (raw && typeof raw === 'object') {
      const obj = raw as { smols?: Smol[]; results?: Smol[]; users?: { Address: string; Username?: string }[] };
      const list = Array.isArray(obj.smols) ? obj.smols : Array.isArray(obj.results) ? obj.results : [];
      if (!Array.isArray(obj.users) || obj.users.length === 0) return list;
      const byAddr = new Map(obj.users.map((u) => [u.Address, u.Username]));
      return list.map((s) => (s.Address && !s.Username && byAddr.get(s.Address) ? { ...s, Username: byAddr.get(s.Address) } : s));
    }
    return [];
  }

  function creatorOf(smol: Smol): string {
    return (
      smol.Creator ||
      smol.Username ||
      smol.artist ||
      smol.author ||
      (smol.Address ? shortenAddress(smol.Address) : '')
    );
  }

  async function loadSource(source: SourceTab) {
    const seq = ++fetchSeq;
    loading = true;
    error = null;
    try {
      const path = source === 'liked' ? '/liked?limit=30' : source === 'created' ? '/created?limit=30' : '/?limit=30';
      const response = await fetchWithTimeout(`${API_URL}${path}`, { credentials: 'include' });
      await throwIfNotOk(response, path);
      const data = await response.json();
      if (seq !== fetchSeq) return;
      items = parseSmolList(data);
    } catch {
      if (seq !== fetchSeq) return;
      error = 'Could not load songs right now.';
      items = [];
    } finally {
      if (seq === fetchSeq) loading = false;
    }
  }

  async function runSearch(trimmed: string) {
    const seq = ++fetchSeq;
    loading = true;
    error = null;
    try {
      const response = await searchSmols({ query: trimmed, limit: 24 });
      if (seq !== fetchSeq) return;
      items = (response.results ?? []).map((item) => ({
        ...item,
        Public: item.Public === 0 ? 0 : 1,
      }));
    } catch {
      if (seq !== fetchSeq) return;
      error = 'Could not search songs right now.';
      items = [];
    } finally {
      if (seq === fetchSeq) loading = false;
    }
  }

  function handleQueryInput(value: string) {
    query = value;
    if (searchTimer) clearTimeout(searchTimer);
    const trimmed = value.trim();
    if (!trimmed) {
      void loadSource(activeSource);
      return;
    }
    searchTimer = setTimeout(() => {
      searchTimer = null;
      void runSearch(trimmed);
    }, 220);
  }

  function selectSource(source: SourceTab) {
    activeSource = source;
    if (query.trim()) {
      query = '';
    }
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    void loadSource(source);
  }

  onMount(() => {
    void loadSource(activeSource);
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });
</script>

<div class="flex min-w-0 flex-col gap-3.5">
  <!-- Search input -->
  <label class="relative block min-w-0">
    <span class="sr-only">Search songs to add</span>
    <span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">
      <Icon name="search" size={18} />
    </span>
    <input
      type="search"
      value={query}
      oninput={(event) => handleQueryInput(event.currentTarget.value)}
      placeholder="Search songs by title, mood, or genre"
      class="input-ring min-h-11 w-full rounded-[var(--radius-control)] bg-canvas pl-10 pr-3.5 text-base text-ink-1 ring-1 ring-inset ring-line-strong placeholder:text-ink-3"
    />
  </label>

  <!-- Source filter chips -->
  <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Song sources">
    {#each (
      userState.contractId
        ? ([
            { id: 'suggested', label: 'Suggested' },
            { id: 'liked', label: 'Liked' },
            { id: 'created', label: 'Created' },
          ] as const)
        : ([{ id: 'suggested', label: 'Suggested' }] as const)
    ) as tab (tab.id)}
      {@const selected = !query.trim() && activeSource === tab.id}
      <button
        type="button"
        aria-pressed={selected}
        onclick={() => selectSource(tab.id)}
        class={`focus-ring inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium ring-1 ring-inset ${
          selected
            ? 'bg-accent text-on-accent ring-accent'
            : 'bg-surface-1 text-ink-2 ring-line hover:bg-surface-3 hover:text-ink-1'
        }`}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Results list -->
  {#if loading}
    <div class="flex items-center justify-center py-10">
      <Loader classNames="size-6" textColor="text-ink-2" />
    </div>
  {:else if error}
    <div class="flex flex-col items-center gap-3 rounded-[var(--radius-control)] bg-surface-1 px-4 py-8 text-center ring-1 ring-inset ring-line">
      <p class="text-sm text-ink-2">{error}</p>
      <Button
        variant="secondary"
        size="sm"
        class="min-h-11"
        onclick={() => (query.trim() ? void runSearch(query.trim()) : void loadSource(activeSource))}
      >
        Try again
      </Button>
    </div>
  {:else if items.length === 0}
    <div class="rounded-[var(--radius-control)] bg-surface-1 px-4 py-8 text-center text-sm text-ink-2 ring-1 ring-inset ring-line">
      {query.trim() ? `No songs matched "${query.trim()}".` : 'No songs available in this list yet.'}
    </div>
  {:else}
    <ul class="flex min-w-0 flex-col gap-2" aria-label="Songs to add">
      {#each items as smol (smol.Id)}
        {@const inDraft = mixtapeTrackIds.current.has(smol.Id)}
        {@const isPrivate = smol.Public === 0}
        {@const creator = creatorOf(smol)}
        <li class="flex min-w-0 items-center gap-3 rounded-[var(--radius-control)] bg-surface-1 p-2.5 ring-1 ring-inset ring-line">
          <CoverArt id={smol.Id} alt="" scale={4} class="size-11 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink-1">
              {smol.Title || 'Untitled Smol'}
            </p>
            {#if creator}
              <p class="truncate text-xs text-ink-2">{creator}</p>
            {/if}
          </div>

          {#if isPrivate}
            <Chip tone="neutral">Private</Chip>
          {:else}
            <button
              type="button"
              aria-label={inDraft ? `Remove ${smol.Title || 'song'} from mixtape` : `Add ${smol.Title || 'song'} to mixtape`}
              aria-pressed={inDraft}
              onclick={() => toggleDraftTrack(smol, { silent: true })}
              class={`focus-ring inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
                inDraft
                  ? 'bg-accent text-on-accent hover:bg-accent-press'
                  : 'bg-surface-2 text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3'
              }`}
            >
              <Icon name={inDraft ? 'check' : 'plus'} size={16} />
              <span>{inDraft ? 'Added' : 'Add'}</span>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
