<script lang="ts">
  interface Props {
    active: boolean;
    hasDraft: boolean;
    onClick: () => void;
  }

  let { active, hasDraft, onClick }: Props = $props();
</script>

<button
  class={`rounded px-2 py-1 font-pixel uppercase tracking-wider text-[10px] transition-colors ${
    active
      ? "bg-lime-400 text-slate-950 hover:bg-lime-300"
      : "text-lime-400 ring-1 ring-lime-400/40 hover:bg-lime-400/10"
  }`}
  onclick={onClick}
>
  <span class="mr-1">{active ? "Mixtape Mode" : "+ Mixtape"}</span>
  {#if !active && hasDraft}
    <span class="inline-block h-2 w-2 rounded-full bg-lime-300 align-middle"
    ></span>
  {/if}
</button>
