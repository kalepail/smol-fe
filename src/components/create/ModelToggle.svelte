<script lang="ts">
  import {
    PROVIDER_META,
    saveStoredProvider,
    type MusicProvider,
  } from '../../utils/takes';
  import SegmentedControl, { type SegmentOption } from '../ui/SegmentedControl.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  interface Props {
    provider: MusicProvider;
    disabled?: boolean;
    onChange?: (provider: MusicProvider) => void;
  }

  let { provider = $bindable(), disabled = false, onChange }: Props = $props();

  let infoOpen = $state(false);

  const options: SegmentOption<MusicProvider>[] = [
    {
      value: 'aisonggenerator',
      label: PROVIDER_META.aisonggenerator.label,
      sublabel: PROVIDER_META.aisonggenerator.takeCopy,
    },
    {
      value: 'elevenlabs',
      label: PROVIDER_META.elevenlabs.label,
      sublabel: PROVIDER_META.elevenlabs.takeCopy,
    },
  ];

  function handleChange(next: MusicProvider) {
    provider = next;
    saveStoredProvider(next);
    onChange?.(next);
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center justify-between">
    <span class="text-sm font-medium text-ink-2">Model</span>
    <IconButton label="About music models" onclick={() => (infoOpen = true)} class="-mr-2">
      <Icon name="info" size={18} />
    </IconButton>
  </div>

  <SegmentedControl
    name="provider"
    legend="Music generation model"
    {options}
    bind:value={provider}
    {disabled}
    onChange={handleChange}
  />
</div>

<Sheet open={infoOpen} title="Models" maxWidth="sm" onClose={() => (infoOpen = false)}>
  <div class="space-y-4">
    {#each (['aisonggenerator', 'elevenlabs'] as const) as id (id)}
      {@const meta = PROVIDER_META[id]}
      <div class="rounded-[var(--radius-control)] bg-surface-1 p-3.5 ring-1 ring-inset ring-line">
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="text-sm font-semibold text-ink-1">{meta.label}</h3>
          <span class="text-xs text-ink-2">{meta.takeCopy}</span>
        </div>
        <p class="mt-1 text-sm leading-relaxed text-ink-2">{meta.description}</p>
      </div>
    {/each}
    <p class="text-xs leading-relaxed text-ink-3">
      If Classic is temporarily unavailable, SMOL can automatically fall back to ElevenLabs so your generation still completes.
    </p>
  </div>
</Sheet>
