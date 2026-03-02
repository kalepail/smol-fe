<script lang="ts">
    import { onMount } from "svelte";
    import RoomList from "./RoomList.svelte";
    import ChatRoom from "./ChatRoom.svelte";
    import { getLocalKeyPair } from "../../lib/the-vip/crypto";
    import { kit } from "../../lib/the-vip/swk";
    import VipConnect from "./VipConnect.svelte";

    // We need to integrate with the main App Auth.
    // Assuming `walletStore` or similar.
    // For MVP, we'll use a local "Connect" mock or try to use the `kit` if available.
    // But wait, the prompt says "Use SEP-0010 style challenge".
    // This usually requires the User to sign with their wallet.
    // We need a "Login" screen for THE-VIP if not globally logged in.

    // Let's assume we need a simple "Connect to Chat" button that triggers the Auth Flow.

    let view: "list" | "room" = "list";
    let currentRoomId: string | null = null;
    let authToken: string | null = null;
    let address: string | null = null;
    let rooms: any[] = [];
    let isLoading = false;
    let error: string | null = null;

    async function handleConnect(event: CustomEvent) {
        const { publicKey } = event.detail;
        await login(publicKey);
    }

    async function login(userAddress: string) {
        try {
            isLoading = true;

            // Step B: Get Challenge
            const cRes = await fetch("/api/chat/auth/challenge", {
                method: "POST",
                body: JSON.stringify({ address: userAddress }),
            });
            const { xdr } = await cRes.json();

            // Step C: Sign (wallet signs the SEP-10 challenge transaction XDR)
            const { signedTxXdr } = await kit.signTransaction(xdr, {
                address: userAddress,
            });
            const signedXDR = signedTxXdr;

            // Step D: Verify
            const vRes = await fetch("/api/chat/auth/verify", {
                method: "POST",
                body: JSON.stringify({ xdr: signedXDR, address: userAddress }),
            });

            if (!vRes.ok) throw new Error("Auth Failed");

            const data = await vRes.json();
            authToken = data.token;
            address = data.address;

            // Step E: Load Rooms
            await loadRooms();

            isLoading = false;
        } catch (e: any) {
            console.error(e);
            error = e.message || "Authentication failed";
            isLoading = false;
        }
    }

    async function loadRooms() {
        const res = await fetch("/api/chat/rooms", {
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        rooms = data.rooms;
    }

    function onJoin(id: string) {
        currentRoomId = id;
        view = "room";
    }

    function onBack() {
        view = "list";
        currentRoomId = null;
        loadRooms(); // Refresh status
    }

    onMount(() => {
        // Check if we have a stored session?
        // For MVP, pure session.
    });
</script>

<div class="max-w-4xl mx-auto min-h-[500px]">
    {#if !authToken}
        <div
            class="flex flex-col items-center justify-center py-20 bg-white/5 rounded-2xl border border-white/10"
        >
            <h2 class="text-2xl font-bold mb-6">Security Checkpoint</h2>
            {#if error}
                <div
                    class="mb-4 text-red-500 bg-red-900/20 px-4 py-2 rounded border border-red-500/30"
                >
                    {error}
                </div>
            {/if}
            <VipConnect on:connect={handleConnect} />
            <p class="mt-4 text-xs text-white/40 font-mono">
                SEP-0010 AUTHENTICATION REQUIRED
            </p>
        </div>
    {:else if view === "list"}
        <div class="mb-8 flex justify-between items-center">
            <div class="text-xs font-mono text-white/40">
                IDENTITY: {address?.slice(0, 4)}...{address?.slice(-4)}
            </div>
            <button
                class="text-xs text-red-400 hover:text-red-300"
                on:click={() => {
                    authToken = null;
                    view = "list";
                }}
            >
                DISCONNECT
            </button>
        </div>
        <RoomList {rooms} {currentRoomId} {onJoin} />
    {:else if currentRoomId}
        <div class="mb-4 flex items-center gap-4">
            <button
                on:click={onBack}
                class="text-sm text-white/60 hover:text-white flex items-center gap-1"
            >
                &larr; BACK
            </button>
            <h2 class="text-xl font-bold">
                {rooms.find((r) => r.id === currentRoomId)?.name}
            </h2>
        </div>

        <!-- Key Props for ChatRoom -->
        <!-- We force re-mount on room change by keying if needed, but Svelte handles it. -->
        {#key currentRoomId}
            <ChatRoom
                roomId={currentRoomId}
                {authToken}
                address={address || ""}
            />
        {/key}
    {/if}
</div>
