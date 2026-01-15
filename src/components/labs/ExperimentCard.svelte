<script lang="ts">
    interface Props {
        title: string;
        description: string;
        href: string;
        badge?: string;
        isLocked?: boolean;
        tags?: string[];
        status_color?: string;
        readiness_score?: number;
    }

    let {
        title,
        description,
        href,
        badge = "ALPHA",
        isLocked = false,
        tags = [],
        status_color = "GRAY",
        readiness_score = 0,
    }: Props = $props();

    const colors: Record<string, string> = {
        GREEN: "#4ade80",
        YELLOW: "#facc15",
        ORANGE: "#fb923c",
        RED: "#ef4444",
        GRAY: "#666",
    };
</script>

<a
    href={isLocked ? undefined : href}
    class="group relative flex flex-col gap-4 p-6 bg-[#1e1e1e] border-2 border-white/10 rounded-xl transition-all duration-300 hover:border-[#9ae600]/50 hover:-translate-y-1 overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.5)] {isLocked
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:shadow-[0_0_30px_rgba(154,230,0,0.2)] hover:border-[#9ae600]'}"
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
                            class="text-[10px] uppercase font-pixel text-white/50 border border-white/10 px-1.5 rounded bg-black/30"
                            >{tag}</span
                        >
                    {/each}
                </div>
            {/if}
        </div>
        <div class="flex flex-col items-end gap-1">
            <span
                class="text-[10px] font-pixel border border-[#9ae600] text-[#9ae600] px-2 py-0.5 rounded-full uppercase tracking-widest bg-[#9ae600]/10"
            >
                {badge}
            </span>
            <!-- LabTech Badge -->
            <div
                class="flex items-center gap-1 cursor-help"
                title="READINESS: {readiness_score}/100 ({status_color})"
            >
                <div
                    class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px]"
                    style="border-bottom-color: {colors[status_color] ||
                        '#666'}; filter: drop-shadow(0 0 5px {colors[
                        status_color
                    ] || '#666'});"
                ></div>
                <span class="text-[8px] text-[#555] font-mono"
                    >{readiness_score}</span
                >
            </div>
        </div>
    </div>

    <p
        class="text-xs md:text-sm text-white/60 font-pixel leading-relaxed relative z-10"
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
