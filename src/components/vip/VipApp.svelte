<script lang="ts">
  import { onMount } from "svelte";
  import { findRoom } from "../../lib/vip/rooms";
  import VipChat from "./VipChat.svelte";
  import { loadWalletKit } from "../../lib/vip/walletKit.lazy";
  import {
    fetchChallenge,
    signChallenge,
    verifyProof,
  } from "../../lib/vip/proof";
  import { loadKeys, type ClientKeyBundle } from "../../lib/vip/e2ee/protocol";
  import { shortKey } from "../../lib/vip/e2ee/keys";

  export let roomId: string;

  const room = findRoom(roomId);

  let status:
    | "idle"
    | "loading-kit"
    | "auth"
    | "signing"
    | "verifying"
    | "ready" = "idle";
  let error: string | null = null;
  let walletAddress = "";
  let token = "";
  let bundle: ClientKeyBundle | null = null;
  let kit: any = null;

  onMount(async () => {
    bundle = await loadKeys();
  });

  async function connectAndJoin() {
    if (!room || room.status !== "enabled") return;
    if (!bundle) bundle = await loadKeys();
    error = null;
    status = "loading-kit";
    try {
      const { kit: loadedKit } = await loadWalletKit();
      kit = loadedKit;
      status = "auth";

      await kit.openModal({
        onWalletSelected: async (option: any) => {
          kit.setWallet(option.id);
          const { address } = await kit.getAddress();
          walletAddress = address;
        },
      });

      // Wait for walletAddress to be set via callback if not already
      if (!walletAddress) {
        // Fallback if modal closed without selection or callback async issue?
        // Actually openModal awaits until closed. If user selected, callback ran.
        // But let's check just in case.
        try {
          const { address } = await kit.getAddress();
          walletAddress = address;
        } catch (e) {
          throw new Error("No wallet selected");
        }
      }

      status = "signing";
      const challenge = await fetchChallenge({
        roomId: room.id,
        address: walletAddress,
      });
      const signed = await signChallenge(kit, walletAddress, challenge.xdr);

      status = "verifying";
      const verify = await verifyProof({
        roomId: room.id,
        address: walletAddress,
        xdr: signed.xdr,
      });

      if (verify.roomStatus !== "ok") {
        error = verify.reason || "Not eligible";
        status = "idle";
        return;
      }
      token = verify.token;
      status = "ready";
    } catch (err: any) {
      console.error(err);
      error = err?.message || "Unable to join";
      status = "idle";
    }
  }
</script>

{#if !room}
  <p class="text-white/80">Room not found.</p>
{:else}
  <section
    class="rounded-3xl border border-white/10 bg-gradient-to-br from-black/70 to-black/50 p-6 shadow-xl"
    style={`background:${room.theme.bg};`}
  >
    <div class="flex items-center justify-between">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-white/60">THE VIP</p>
        <h1 class="text-3xl font-semibold text-white">{room.name}</h1>
        <p class="mt-2 text-white/70 max-w-2xl leading-relaxed">
          {room.description}
        </p>
        {#if room.qualifier.cutoffTs}
          <p class="mt-1 text-xs text-white/50">
            Cutoff: {room.qualifier.cutoffTs}
          </p>
        {/if}
      </div>
      <div
        class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-wide text-white/70"
      >
        {room.status === "enabled" ? "Live" : "Coming soon"}
      </div>
    </div>

    <div class="mt-4 grid gap-2 text-sm text-white/70">
      {#each room.proofFlow as step}
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-white/30"></span>
          <span>{step}</span>
        </div>
      {/each}
    </div>

    {#if room.status === "comingSoon"}
      <div
        class="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-white/60"
      >
        Aquarius tiers and ICE delegates are wired but pending verifiers. Stay
        tuned.
      </div>
    {:else}
      <div class="mt-6 flex flex-col gap-4">
        <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <p class="text-white text-sm font-semibold">Wallet</p>
              <p class="text-white/70 text-sm">
                {walletAddress ? shortKey(walletAddress) : "Not connected"}
              </p>
            </div>
            <button
              class="rounded-lg bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-40"
              on:click={connectAndJoin}
              disabled={status !== "idle" && status !== "ready"}
            >
              {status === "idle"
                ? "Connect & Enter"
                : status === "ready"
                  ? "Re-enter"
                  : "Working…"}
            </button>
          </div>
          <p class="mt-2 text-xs text-white/60">
            Flow: connect wallet → single signature → encrypted chat. No
            on-chain tx.
          </p>
          {#if error}
            <p class="mt-2 text-xs text-rose-300">{error}</p>
          {/if}
        </div>

        {#if status === "ready" && token && bundle}
          <VipChat
            roomId={room.id}
            {token}
            account={walletAddress}
            {bundle}
            rotation={{
              messages: room.e2eePolicy.rotateEveryMessages,
              minutes: room.e2eePolicy.rotateEveryMinutes,
            }}
          />
        {:else}
          <div
            class="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/60"
          >
            {status === "auth"
              ? "Awaiting wallet approval…"
              : status === "signing"
                ? "Requesting single signature…"
                : status === "verifying"
                  ? "Verifying eligibility…"
                  : "Connect to start encrypted chat."}
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}
