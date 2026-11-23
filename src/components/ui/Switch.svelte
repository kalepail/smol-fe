<script lang="ts">
  interface Props {
    id: string;
    label: string;
    description?: string;
    checked: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
    class?: string;
  }

  let {
    id,
    label,
    description,
    checked = $bindable(),
    disabled = false,
    onChange,
    class: className = '',
  }: Props = $props();
</script>

<label
  for={id}
  class={`flex min-h-12 w-full items-center justify-between gap-4 py-2 ${
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
  } ${className}`}
>
  <span class="min-w-0 flex-1">
    <span class="block text-base sm:text-sm font-medium text-ink-1 leading-snug">{label}</span>
    {#if description}
      <span class="block text-sm text-ink-2 leading-snug mt-0.5">{description}</span>
    {/if}
  </span>

  <span class="relative inline-flex shrink-0 items-center">
    <input
      {id}
      type="checkbox"
      role="switch"
      {disabled}
      bind:checked
      onchange={(event) => onChange?.(event.currentTarget.checked)}
      class="peer sr-only"
    />
    <span
      aria-hidden="true"
      class="h-7 w-12 rounded-full bg-surface-3 ring-1 ring-inset ring-line-strong transition-colors peer-checked:bg-accent peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink-1"
    ></span>
    <span
      aria-hidden="true"
      class="pointer-events-none absolute left-1 size-5 rounded-full bg-ink-1 transition-transform duration-150 ease-out peer-checked:translate-x-5 peer-checked:bg-on-accent"
    ></span>
  </span>
</label>
