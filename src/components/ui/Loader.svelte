<script lang="ts">
  interface Props {
    classNames?: string;
    textColor?: string;
  }

  let { classNames = 'size-5', textColor = 'text-current' }: Props = $props();
</script>

<span class={`inline-flex shrink-0 animate-spin ${classNames} ${textColor}`} aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" class="h-full w-full">
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-opacity="0.22"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    />
  </svg>
</span>
