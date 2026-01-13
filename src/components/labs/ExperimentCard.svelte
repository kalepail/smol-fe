<script lang="ts">
    interface Props {
        title: string;
        description: string;
        href: string;
        badge?: string;
        isLocked?: boolean;
        tags?: string[];
    }

    let {
        title,
        description,
        href,
        badge = "ALPHA",
        isLocked = false,
        tags = [],
    }: Props = $props();
</script>

<a
    href={isLocked ? undefined : href}
    class="group relative flex flex-col gap-4 p-6 bg-[#1e1e1e] border-2 border-white/10 rounded-xl transition-all duration-300 hover:border-[#9ae600]/50 hover:-translate-y-1 overflow-hidden {isLocked
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:shadow-[4px_4px_0px_0px_rgba(154,230,0,0.3)]'}"
>
    <!-- Background Hover Effect -->
    <div
        class="absolute inset-0 bg-gradient-to-br from-[#9ae600]/0 to-[#9ae600]/0 group-hover:from-[#9ae600]/5 group-hover:to-transparent transition-all duration-500"
    ></div>

    <div class="flex justify-between items-start relative z-10">
        <div class="flex flex-col gap-1">
            <h3
                class="text-xl font-bold uppercase tracking-wider text-white group-hover:text-[#9ae600] transition-colors"
            >
                {title}
            </h3>
            {#if tags.length > 0}
                <div class="flex gap-2">
                    {#each tags as tag}
                        <span
                            class="text-[10px] uppercase font-mono text-white/50 border border-white/10 px-1.5 rounded bg-black/30"
                            >{tag}</span
                        >
                    {/each}
                </div>
            {/if}
        </div>
        <span
            class="text-[10px] font-mono border border-[#9ae600] text-[#9ae600] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[#9ae600]/10"
        >
            {badge}
        </span>
    </div>

    <p
        class="text-xs md:text-sm text-white/60 font-mono leading-relaxed relative z-10"
    >
        {description}
    </p>

    <div
        class="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-[#9ae600] relative z-10"
    >
        <span class="text-[10px] uppercase tracking-[0.2em] font-bold">
            {isLocked ? "LOCKED" : "INITIALIZE ->"}
        </span>
    </div>
</a>
