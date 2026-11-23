<script lang="ts">
  import type { MixtapeSummary, OwnedMixtape } from '../../services/api/mixtapes';
  import { shortenAddress } from '../../utils/address';
  import { hiddenReasonLabel } from '../../utils/mixtapeCoaching';
  import MixtapeCollage from '../ui/MixtapeCollage.svelte';
  import Icon from '../ui/Icon.svelte';
  import MixtapeOwnerMenu, { type OwnerMenuItem } from './MixtapeOwnerMenu.svelte';

  /**
   * One mixtape card (Report 24 §5.2). Public/non-owner cards are unchanged
   * from the grid; owner cards add a ⋯ menu, and hidden owner cards get a
   * dimmed collage, an icon + "Hidden" chip and a plain reason label.
   */
  interface Props {
    mixtape: MixtapeSummary | OwnedMixtape;
    /** Owner view: show listing status + ⋯ menu. */
    owned?: boolean;
    menuItems?: OwnerMenuItem[];
    showCreator?: boolean;
    headingLevel?: 2 | 3;
  }

  let { mixtape, owned = false, menuItems = [], showCreator = true, headingLevel = 2 }: Props = $props();

  const ownedRow = $derived(owned ? (mixtape as OwnedMixtape) : null);
  const hidden = $derived(ownedRow?.visibility === 'owner');
  const reason = $derived(hidden ? hiddenReasonLabel(ownedRow?.hiddenReason, ownedRow?.relatedMixtapeTitle) : null);
  const songs = $derived(`${mixtape.trackCount} ${mixtape.trackCount === 1 ? 'song' : 'songs'}`);
  const accessibleName = $derived(
    hidden ? `${mixtape.title}, hidden from the Mixtapes page: ${reason}` : mixtape.title
  );
</script>

<article class="group relative flex min-w-0 flex-col" data-mixtape-card={mixtape.id} data-hidden={hidden ? 'true' : undefined}>
  <a
    href={`/mixtapes/${mixtape.id}`}
    aria-label={owned ? accessibleName : undefined}
    class="focus-ring flex flex-col gap-2.5 rounded-[var(--radius-media)]"
  >
    <div class="relative">
      <div class={hidden ? 'opacity-60' : ''}>
        <MixtapeCollage coverUrls={mixtape.coverUrls} alt={mixtape.title} />
      </div>
      {#if hidden}
        <span
          class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-canvas/85 px-2 py-1 text-[11px] font-semibold text-warning ring-1 ring-inset ring-warning/40 backdrop-blur"
        >
          <Icon name="eye-off" size={12} />
          Hidden
        </span>
      {/if}
    </div>

    <div class={`min-w-0 space-y-0.5 ${owned && menuItems.length ? 'pr-1' : ''}`}>
      <svelte:element this={`h${headingLevel}`} class="truncate text-[15px] font-medium leading-5 text-ink-1 group-hover:underline">
        {mixtape.title}
      </svelte:element>
      <p class="tabular truncate text-[13px] text-ink-2">
        {songs}{#if showCreator && mixtape.creator}{' · '}{shortenAddress(mixtape.creator)}{/if}
      </p>
      {#if reason}
        <p class="flex min-w-0 items-center gap-1 text-xs font-medium text-warning">
          <Icon name="eye-off" size={12} />
          <span class="truncate">{reason}</span>
        </p>
      {:else if mixtape.description}
        <p class="line-clamp-2 text-xs leading-relaxed text-ink-3">
          {mixtape.description}
        </p>
      {/if}
    </div>
  </a>

  {#if owned && menuItems.length}
    <div class="absolute right-2 top-2">
      <MixtapeOwnerMenu label={`More actions for ${mixtape.title}`} items={menuItems} variant="overlay" />
    </div>
  {/if}
</article>
