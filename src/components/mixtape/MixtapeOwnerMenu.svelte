<script lang="ts" module>
  import type { IconName } from '../ui/Icon.svelte';

  export interface OwnerMenuItem {
    label: string;
    icon?: IconName;
    tone?: 'default' | 'danger';
    onSelect: () => void;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '../ui/Icon.svelte';
  import '../ui/ownerIcons';

  /**
   * Owner-only ⋯ menu (Edit / Merge / Delete). Popover menu with roving focus,
   * Escape + outside-click close, and 44px targets (Report 24 §5.2 / §7).
   */
  interface Props {
    label: string;
    items: OwnerMenuItem[];
    align?: 'left' | 'right';
    variant?: 'overlay' | 'plain';
  }

  let { label, items, align = 'right', variant = 'plain' }: Props = $props();

  let open = $state(false);
  let rootEl = $state<HTMLDivElement | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  const menuId = `owner-menu-${Math.random().toString(36).slice(2, 9)}`;

  function menuItems(): HTMLButtonElement[] {
    return Array.from(rootEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
  }

  // Flip to whichever side keeps the menu inside the viewport (cards sit in 2-col grids at 390px).
  let resolvedAlign = $state<'left' | 'right'>('right');

  async function openMenu(focus: 'first' | 'last' = 'first') {
    resolvedAlign = align;
    const rect = triggerEl?.getBoundingClientRect();
    if (rect && typeof window !== 'undefined') {
      const menuWidth = 224;
      if (align === 'right' && rect.right - menuWidth < 8) resolvedAlign = 'left';
      else if (align === 'left' && rect.left + menuWidth > window.innerWidth - 8) resolvedAlign = 'right';
    }
    open = true;
    await tick();
    const list = menuItems();
    (focus === 'first' ? list[0] : list[list.length - 1])?.focus();
  }

  function closeMenu(returnFocus = true) {
    if (!open) return;
    open = false;
    if (returnFocus) triggerEl?.focus();
  }

  function select(item: OwnerMenuItem) {
    closeMenu(false);
    item.onSelect();
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      closeMenu(false);
    }
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      void openMenu('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      void openMenu('last');
    }
  }

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootEl && !rootEl.contains(event.target as Node)) closeMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });
</script>

<div bind:this={rootEl} class="relative inline-flex">
  <button
    bind:this={triggerEl}
    type="button"
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-controls={open ? menuId : undefined}
    onclick={() => (open ? closeMenu() : void openMenu())}
    onkeydown={onTriggerKeydown}
    class={`focus-ring inline-flex size-11 items-center justify-center rounded-full ${
      variant === 'overlay'
        ? 'bg-canvas/75 text-ink-1 ring-1 ring-inset ring-line-strong backdrop-blur hover:bg-surface-3'
        : 'bg-surface-2 text-ink-1 ring-1 ring-inset ring-line-strong hover:bg-surface-3'
    }`}
  >
    <Icon name="ellipsis" size={20} />
  </button>

  {#if open}
    <div
      id={menuId}
      role="menu"
      tabindex="-1"
      aria-label={label}
      onkeydown={onMenuKeydown}
      class={`absolute top-full z-30 mt-1.5 flex w-max min-w-52 max-w-[min(18rem,calc(100vw-2rem))] flex-col rounded-[var(--radius-control)] bg-surface-2 p-1 shadow-xl ring-1 ring-inset ring-line-strong ${
        resolvedAlign === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {#each items as item (item.label)}
        <button
          type="button"
          role="menuitem"
          tabindex="-1"
          onclick={() => select(item)}
          class={`focus-ring flex min-h-11 w-full items-center gap-2.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-left text-sm font-medium hover:bg-white/8 focus:bg-white/8 ${
            item.tone === 'danger' ? 'text-danger' : 'text-ink-1'
          }`}
        >
          {#if item.icon}
            <Icon name={item.icon} size={16} class={item.tone === 'danger' ? 'text-danger' : 'text-ink-2'} />
          {/if}
          <span class="min-w-0 truncate">{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
