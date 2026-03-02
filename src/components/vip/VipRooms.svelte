<script lang="ts">
  import type { VipRoom } from "../../lib/vip/rooms";

  export let rooms: VipRoom[] = [];
</script>

<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  {#each rooms as room}
    <a
      class={`group rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-lg transition hover:-translate-y-1 hover:border-[${room.theme.accent}]`}
      href={room.status === "enabled" ? room.route : undefined}
    >
      <div class="flex items-start justify-between">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-white/60">
            THE VIP
          </p>
          <h3 class="mt-1 text-xl font-semibold text-white">{room.name}</h3>
        </div>
        <span
          class={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${room.status === "enabled"
            ? "bg-[rgba(16,185,129,0.15)] text-emerald-200"
            : "bg-white/10 text-white/60"}`}
        >
          {room.status === "enabled" ? "Live" : "Coming soon"}
        </span>
      </div>
      <p class="mt-3 text-sm text-white/70 leading-relaxed">{room.description}</p>
      <div class="mt-4 flex flex-wrap gap-2 text-[11px] text-white/60">
        {#each room.proofFlow.slice(0, 2) as step}
          <span class="rounded-full border border-white/10 px-2 py-1">
            {step}
          </span>
        {/each}
      </div>
    </a>
  {/each}
</div>
