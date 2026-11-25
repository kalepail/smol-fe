<script lang="ts" module>
  export type CoachingTone = 'warning' | 'info' | 'success';

  export interface MixtapeCoaching {
    /** Stable key: the live region only re-announces when this changes. */
    key: string;
    tone: CoachingTone;
    title: string;
    body?: string | null;
    action?: { label: string; matchId: string } | null;
  }
</script>

<script lang="ts">
  import Icon from '../../ui/Icon.svelte';
  import '../../ui/ownerIcons';
  import Button from '../../ui/Button.svelte';

  /**
   * Live, non-punitive coaching docked directly above the builder's sticky
   * footer (Report 24 §5.4, Manus "note above the CTA" pattern). Uses the
   * shared Tier 1 classifier result computed by the sheet.
   */
  interface Props {
    coaching: MixtapeCoaching | null;
    busy?: boolean;
    onAction?: (matchId: string) => void;
  }

  let { coaching, busy = false, onAction }: Props = $props();

  const toneClasses: Record<CoachingTone, string> = {
    warning: 'bg-warning/15 ring-warning/30',
    info: 'bg-surface-2 ring-line',
    success: 'bg-success/15 ring-success/30',
  };
  const iconClasses: Record<CoachingTone, string> = {
    warning: 'text-warning',
    info: 'text-ink-2',
    success: 'text-success',
  };
</script>

<div aria-live="polite" aria-atomic="true" data-mixtape-coaching>
  {#if coaching}
    {#key coaching.key}
      <div
        class={`mb-3 flex flex-col gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-sm ring-1 ring-inset ${toneClasses[coaching.tone]}`}
        data-tone={coaching.tone}
      >
        <div class="flex min-w-0 gap-2.5">
          <Icon
            name={coaching.tone === 'success' ? 'check' : coaching.tone === 'warning' ? 'warning' : 'info'}
            size={18}
            class={`mt-0.5 ${iconClasses[coaching.tone]}`}
          />
          <div class="min-w-0 space-y-0.5">
            <p class="font-medium leading-snug text-ink-1">{coaching.title}</p>
            {#if coaching.body}
              <p class="text-xs leading-relaxed text-ink-2">{coaching.body}</p>
            {/if}
          </div>
        </div>
        {#if coaching.action && onAction}
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            class="min-h-11"
            disabled={busy}
            onclick={() => onAction?.(coaching.action!.matchId)}
          >
            <Icon name="pencil" size={16} />
            <span class="truncate">{coaching.action.label}</span>
          </Button>
        {/if}
      </div>
    {/key}
  {/if}
</div>
