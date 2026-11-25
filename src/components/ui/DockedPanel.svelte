<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';

  /**
   * Non-modal panel docked to the right edge at desktop widths (Report 19
   * §4.4D / 25d P2-8). Unlike `Sheet` it never traps focus or blocks the page:
   * the owner keeps browsing and adding songs while it is open. Same anatomy as
   * Sheet (title · subtitle · scroll body · sticky footer). Escape closes it
   * when focus is inside; focus returns to where it came from.
   */
  interface Props {
    open: boolean;
    title?: string;
    subtitle?: string;
    dismissible?: boolean;
    onClose: () => void;
    headerExtra?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }

  let { open, title, subtitle, dismissible = true, onClose, headerExtra, footer, children }: Props = $props();

  let panelEl = $state<HTMLElement | null>(null);
  let returnFocus: HTMLElement | null = null;
  const titleId = `docked-panel-${Math.random().toString(36).slice(2, 9)}`;

  // Reserve the panel's width in the page layout while it is open (global.css `html.builder-docked`).
  $effect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add('builder-docked');
    return () => root.classList.remove('builder-docked');
  });

  $effect(() => {
    if (!open) return;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => panelEl?.focus({ preventScroll: true }));
    return () => {
      const target = returnFocus;
      returnFocus = null;
      if (target?.isConnected && panelEl?.contains(document.activeElement)) target.focus({ preventScroll: true });
    };
  });

  $effect(() => {
    const el = panelEl;
    if (!el) return;
    el.addEventListener('keydown', onKeydown);
    return () => el.removeEventListener('keydown', onKeydown);
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented || !dismissible) return;
    // A modal (confirm / merge) stacked above handles its own Escape.
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    onClose();
  }
</script>

{#if open}
  <aside
    bind:this={panelEl}
    tabindex="-1"
    aria-labelledby={titleId}
    data-mixtape-panel
    class="fixed bottom-0 right-0 top-[var(--topbar-h)] z-40 flex w-[var(--builder-panel-w)] min-w-0 flex-col border-l border-line-strong bg-surface-2 text-ink-1 shadow-2xl outline-none"
  >
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3">
      <div class="min-w-0 flex-1">
        <h2 id={titleId} class="truncate text-lg font-semibold text-ink-1">{title}</h2>
        {#if subtitle}
          <p class="mt-0.5 truncate text-sm text-ink-2">{subtitle}</p>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-1">
        {@render headerExtra?.()}
        {#if dismissible}
          <IconButton label="Close" onclick={onClose}>
            <Icon name="x" size={20} />
          </IconButton>
        {/if}
      </div>
    </div>

    <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
      {@render children()}
    </div>

    {#if footer}
      <div class="shrink-0 border-t border-line bg-surface-2 px-5 py-3 pb-4">
        {@render footer()}
      </div>
    {/if}
  </aside>
{/if}
