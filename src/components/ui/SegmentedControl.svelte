<script module lang="ts">
  export interface SegmentOption<V extends string = string> {
    value: V;
    label: string;
    sublabel?: string;
    meta?: string;
    metaTone?: 'neutral' | 'warning';
    badge?: string;
    disabled?: boolean;
    disabledReason?: string;
  }
</script>

<script lang="ts" generics="T extends string">
  interface Props {
    name: string;
    legend: string;
    hideLegend?: boolean;
    options: SegmentOption<T>[];
    value: T;
    disabled?: boolean;
    onChange?: (value: T) => void;
    class?: string;
  }

  let {
    name,
    legend,
    hideLegend = true,
    options,
    value = $bindable(),
    disabled = false,
    onChange,
    class: className = '',
  }: Props = $props();

  function handleSelect(nextValue: T) {
    value = nextValue;
    onChange?.(nextValue);
  }
</script>

<fieldset class={`min-w-0 border-0 p-0 ${className}`} {disabled}>
  <legend class={hideLegend ? 'sr-only' : 'mb-2 text-sm font-medium text-ink-2'}>
    {legend}
  </legend>

  <div
    class="grid gap-1 rounded-[var(--radius-control)] bg-surface-1 p-1 ring-1 ring-inset ring-line"
    style={`grid-template-columns: repeat(${options.length}, minmax(0, 1fr));`}
  >
    {#each options as option (option.value)}
      {@const optionDisabled = disabled || option.disabled}
      <label
        title={optionDisabled && option.disabledReason ? option.disabledReason : undefined}
        class="relative flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-[calc(var(--radius-control)-4px)] px-3 py-2 text-center text-ink-2 hover:text-ink-1 has-[:checked]:bg-surface-2 has-[:checked]:text-ink-1 has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-line-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink-1 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
      >
        <input
          type="radio"
          {name}
          value={option.value}
          checked={value === option.value}
          disabled={optionDisabled}
          onchange={() => handleSelect(option.value)}
          class="sr-only"
        />
        <span class="flex items-center gap-1.5 text-sm font-medium leading-tight">
          <span>{option.label}</span>
          {#if option.badge}
            <span class="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
              {option.badge}
            </span>
          {/if}
        </span>
        {#if option.sublabel}
          <span class="mt-0.5 text-xs text-ink-2 leading-tight">{option.sublabel}</span>
        {/if}
        {#if option.meta}
          <span
            class={`tabular mt-0.5 text-[11px] font-medium leading-tight ${
              option.metaTone === 'warning' ? 'text-warning' : 'text-ink-3'
            }`}
          >
            {option.meta}
          </span>
        {/if}
      </label>
    {/each}
  </div>
</fieldset>
