<script lang="ts">
  import type { Snippet } from 'svelte';
  import { registerOpenDialog, unregisterOpenDialog } from '../../utils/topLayer';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';

  interface Props {
    open: boolean;
    title?: string;
    subtitle?: string;
    dismissible?: boolean;
    fullHeight?: boolean;
    placement?: 'center' | 'right';
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
    onClose: () => void;
    headerExtra?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }

  let {
    open,
    title,
    subtitle,
    dismissible = true,
    fullHeight = false,
    placement = 'center',
    maxWidth = 'md',
    onClose,
    headerExtra,
    footer,
    children,
  }: Props = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let backdropEl = $state<HTMLDivElement | null>(null);
  let pointerDownOnBackdrop = false;

  const widthClass: Record<NonNullable<Props['maxWidth']>, string> = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
  };

  const containerClass = $derived(
    placement === 'right'
      ? 'flex h-full w-full items-end justify-center sm:items-stretch sm:justify-end sm:p-0'
      : 'flex h-full w-full items-end justify-center sm:items-center sm:p-4'
  );

  const panelClass = $derived.by(() => {
    if (placement === 'right') {
      return fullHeight
        ? 'h-dvh pt-[env(safe-area-inset-top,0px)] sm:h-dvh sm:max-h-none sm:pt-0 sm:rounded-l-[var(--radius-sheet)] sm:rounded-r-none'
        : 'max-h-[90dvh] rounded-t-[var(--radius-sheet)] sm:h-dvh sm:max-h-none sm:rounded-l-[var(--radius-sheet)] sm:rounded-r-none';
    }
    return fullHeight
      ? 'h-dvh pt-[env(safe-area-inset-top,0px)] sm:h-auto sm:max-h-[90dvh] sm:pt-0 sm:rounded-[var(--radius-sheet)]'
      : 'max-h-[90dvh] rounded-t-[var(--radius-sheet)] sm:rounded-[var(--radius-sheet)]';
  });

  $effect(() => {
    const dialog = dialogEl;
    if (!dialog) return;
    if (open) {
      pointerDownOnBackdrop = false;
      if (!dialog.open) {
        dialog.showModal();
      }
      registerOpenDialog(dialog);
    } else {
      pointerDownOnBackdrop = false;
      unregisterOpenDialog(dialog);
      if (dialog.open) {
        dialog.close();
      }
    }
    return () => {
      pointerDownOnBackdrop = false;
      unregisterOpenDialog(dialog);
      if (dialog.open) {
        dialog.close();
      }
    };
  });

  function isBackdropTarget(target: EventTarget | null): boolean {
    return target === dialogEl || target === backdropEl;
  }

  function handlePointerDown(event: PointerEvent) {
    pointerDownOnBackdrop = isBackdropTarget(event.target);
  }

  function handleCancel(event: Event) {
    event.preventDefault();
    if (dismissible) onClose();
  }

  function handleBackdropClick(event: MouseEvent) {
    const startedOnBackdrop = pointerDownOnBackdrop;
    pointerDownOnBackdrop = false;
    if (!dismissible) return;
    if (startedOnBackdrop && isBackdropTarget(event.target)) {
      onClose();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  oncancel={handleCancel}
  onpointerdown={handlePointerDown}
  onclick={handleBackdropClick}
  class="sheet-dialog fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-transparent p-0 text-ink-1 backdrop:bg-black/70 backdrop:backdrop-blur-xs"
>
  {#if open}
    <div bind:this={backdropEl} class={containerClass}>
      <div
        class={`flex min-w-0 w-full flex-col overflow-hidden bg-surface-2 ring-1 ring-line-strong ${widthClass[maxWidth]} ${panelClass}`}
      >
        {#if !fullHeight}
          <div class="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
            <span class="h-1 w-9 rounded-full bg-white/20"></span>
          </div>
        {/if}

        {#if title || dismissible || headerExtra}
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-line py-3 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:px-5">
            <div class="min-w-0 flex-1">
              {#if title}
                <h2 class="truncate text-lg font-semibold text-ink-1">{title}</h2>
              {/if}
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
        {/if}

        <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain py-4 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:px-5">
          {@render children()}
        </div>

        {#if footer}
          <div class="shrink-0 border-t border-line bg-surface-2 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] sm:px-5 sm:pb-4">
            {@render footer()}
          </div>
        {:else}
          <div class="h-[env(safe-area-inset-bottom,0px)] shrink-0 sm:hidden"></div>
        {/if}
      </div>
    </div>
  {/if}
</dialog>

<style>
  .sheet-dialog:not([open]) {
    display: none;
  }
</style>
