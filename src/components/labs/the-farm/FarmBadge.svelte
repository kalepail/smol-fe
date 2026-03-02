<script lang="ts">
    import { TIER_CONFIG, truncateHash, type EarnedBadge, type BadgeDef } from "./zkTypes";

    let { badge, def, locked = false }: {
        badge: EarnedBadge | null;
        def: BadgeDef;
        locked?: boolean;
    } = $props();

    let tierData = $derived(badge?.data?.tier != null ? TIER_CONFIG[badge.data.tier as number] : null);
    let commitment = $derived(badge?.data?.commitment as string | undefined);
    let attestationTx = $derived(badge?.data?.attestationTx as string | undefined);
    let verificationState = $derived(badge?.data?.state as 'local' | 'attested' | undefined);

    function timeAgo(ts: number): string {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
</script>

{#if locked}
    <!-- Locked / coming-soon badge -->
    <div class="badge-card badge-locked">
        <div class="badge-inner">
            <span class="badge-icon-locked">{def.icon}</span>
            <span class="badge-title-locked">{def.title}</span>
            <span class="badge-desc-locked">{def.description}</span>
            <span class="badge-soon">COMING SOON</span>
        </div>
    </div>
{:else if badge && tierData}
    <!-- Earned badge — holographic card -->
    <div class="badge-card badge-earned" style="--tier-color:{tierData.color};--tier-glow:{tierData.glow}">
        <div class="badge-shimmer"></div>
        <div class="badge-inner">
            <div class="badge-tier-icon">{tierData.icon}</div>
            <div class="badge-tier-name" style="color:{tierData.color}">{tierData.name}</div>

            <div class="badge-verified">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                {#if verificationState === 'attested' && attestationTx}
                    <span>Attested on Stellar (Mainnet)</span>
                {:else if verificationState === 'local'}
                    <span>Verified locally</span>
                {:else}
                    <span>Not attested</span>
                {/if}
            </div>

            {#if commitment}
                <div class="badge-commitment">
                    <span class="badge-label">Commitment</span>
                    <span class="badge-hash">{truncateHash(commitment)}</span>
                </div>
            {/if}

            <div class="badge-meta">
                <span class="badge-timestamp">{timeAgo(badge.earnedAt)}</span>
                <span class="badge-protocol">Protocol X-Ray</span>
            </div>
        </div>
    </div>
{:else}
    <!-- Unearned but available -->
    <button class="badge-card badge-available" type="button">
        <div class="badge-inner">
            <span class="badge-icon-available">{def.icon}</span>
            <span class="badge-title-available">{def.title}</span>
            <span class="badge-desc-available">{def.description}</span>
            <span class="badge-earn">TAP TO EARN</span>
        </div>
    </button>
{/if}

<style>
    .badge-card {
        position: relative;
        border-radius: 16px;
        overflow: hidden;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
        min-height: 180px;
        display: flex;
    }
    .badge-card:hover {
        transform: translateY(-2px);
    }

    /* --- Earned --- */
    .badge-earned {
        background: linear-gradient(145deg, rgba(13,13,15,0.85), rgba(20,30,20,0.7));
        border: 1px solid var(--tier-color, #4ade80);
        box-shadow: 0 0 30px var(--tier-glow, rgba(74,222,128,0.2)),
                    inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .badge-earned:hover {
        box-shadow: 0 0 50px var(--tier-glow, rgba(74,222,128,0.35)),
                    inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .badge-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            105deg,
            transparent 30%,
            rgba(255,255,255,0.06) 45%,
            rgba(255,255,255,0.12) 50%,
            rgba(255,255,255,0.06) 55%,
            transparent 70%
        );
        background-size: 250% 100%;
        animation: shimmer 4s ease-in-out infinite;
        pointer-events: none;
        z-index: 1;
    }
    @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }

    .badge-inner {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px 20px;
        width: 100%;
        text-align: center;
    }

    .badge-tier-icon {
        font-size: 2.5rem;
        filter: drop-shadow(0 0 12px var(--tier-glow));
        animation: gentle-bob 3s ease-in-out infinite;
    }
    @keyframes gentle-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }

    .badge-tier-name {
        font-family: 'Press Start 2P', monospace;
        font-size: 14px;
        letter-spacing: 2px;
        text-transform: uppercase;
    }

    .badge-verified {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--tier-color, #4ade80);
        font-size: 9px;
        font-family: 'Press Start 2P', monospace;
        letter-spacing: 0.5px;
        opacity: 0.9;
    }

    .badge-commitment {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 4px;
    }
    .badge-label {
        font-size: 7px;
        font-family: 'Press Start 2P', monospace;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .badge-hash {
        font-size: 10px;
        font-family: monospace;
        color: #888;
        background: rgba(255,255,255,0.03);
        padding: 3px 8px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,0.05);
    }

    .badge-meta {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-top: 4px;
    }
    .badge-timestamp, .badge-protocol {
        font-size: 7px;
        font-family: 'Press Start 2P', monospace;
        color: #444;
        text-transform: uppercase;
    }

    /* --- Locked --- */
    .badge-locked {
        background: rgba(13,13,15,0.5);
        border: 1px dashed rgba(255,255,255,0.08);
        opacity: 0.5;
        cursor: default;
    }
    .badge-locked:hover {
        transform: none;
        opacity: 0.6;
    }
    .badge-icon-locked {
        font-size: 1.8rem;
        filter: grayscale(1) brightness(0.5);
    }
    .badge-title-locked {
        font-family: 'Press Start 2P', monospace;
        font-size: 9px;
        color: #444;
        letter-spacing: 1px;
    }
    .badge-desc-locked {
        font-size: 8px;
        color: #333;
        max-width: 160px;
        line-height: 1.5;
    }
    .badge-soon {
        font-family: 'Press Start 2P', monospace;
        font-size: 7px;
        color: #555;
        letter-spacing: 2px;
        margin-top: 4px;
        border: 1px solid rgba(255,255,255,0.05);
        padding: 3px 8px;
        border-radius: 4px;
    }

    /* --- Available (unearned) --- */
    .badge-available {
        background: rgba(13,13,15,0.6);
        border: 1px solid rgba(154,230,0,0.2);
        cursor: pointer;
        width: 100%;
    }
    .badge-available:hover {
        border-color: rgba(154,230,0,0.5);
        box-shadow: 0 0 25px rgba(154,230,0,0.15);
    }
    .badge-icon-available {
        font-size: 2rem;
    }
    .badge-title-available {
        font-family: 'Press Start 2P', monospace;
        font-size: 10px;
        color: #9ae600;
        letter-spacing: 1px;
    }
    .badge-desc-available {
        font-size: 9px;
        color: #666;
        line-height: 1.5;
    }
    .badge-earn {
        font-family: 'Press Start 2P', monospace;
        font-size: 8px;
        color: #9ae600;
        letter-spacing: 2px;
        margin-top: 4px;
        animation: pulse-text 2s ease-in-out infinite;
    }
    @keyframes pulse-text {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
    }
</style>
