<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { fade, fly } from "svelte/transition";
    import {
        getLocalKeyPair,
        encryptMessage,
        decryptMessage,
        unwrapRoomKey,
        toHex,
    } from "../../lib/the-vip/crypto";

    export let roomId: string;
    export let authToken: string;
    export let address: string;

    let messages: any[] = [];
    let inputValue = "";
    let isLoading = true;
    let status = "Initializing...";
    let roomKey: Uint8Array | null = null;
    let pollInterval: any;
    let error: string | null = null;

    let currentEpoch = 0;

    async function init() {
        try {
            status = "Securing keys...";
            // 1. Ensure we have local keys
            const keyPair = await getLocalKeyPair();

            // 2. Upload PubKey if strictly needed?
            // We typically do this at login, but doing it here ensures it's fresh.
            // Optimization: Check session storage to see if we already uploaded?
            // Let's just do it. It's cheap.
            const pubKeyHex = toHex(keyPair.publicKey);
            await fetch("/api/chat/keys", {
                method: "PUT",
                headers: { Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ publicKey: pubKeyHex }),
            });

            await fetchKey(keyPair);

            // 5. Start Polling
            status = "Connected.";
            isLoading = false;
            poll();
            pollInterval = setInterval(poll, 3000); // 3s polling for MVP
        } catch (e: any) {
            error = e.message;
            isLoading = false;
        }
    }

    async function fetchKey(keyPair: any) {
        // 3. Get Room Key (Sealed)
        status = "Obtaining room access...";
        const keyRes = await fetch(`/api/chat/rooms/${roomId}/key`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!keyRes.ok) {
            throw new Error((await keyRes.json()).error || "Access Denied");
        }

        const keyData = await keyRes.json();
        currentEpoch = keyData.epoch || 0;

        // 4. Unwrap Key
        status = "Decrypting channel...";
        roomKey = unwrapRoomKey(
            keyData.encryptedKey,
            keyData.nonce,
            keyData.serverPublicKey,
            keyPair,
        );

        if (!roomKey) {
            throw new Error("Failed to derive room key. Security mismatched.");
        }
    }

    async function poll() {
        if (!roomKey) return;
        try {
            const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
                // Add cursor later
                headers: { Authorization: `Bearer ${authToken}` },
            });
            if (res.ok) {
                const data = await res.json();

                // Self-Healing: Check Epoch
                if (
                    data.meta?.currentEpoch &&
                    data.meta.currentEpoch !== currentEpoch
                ) {
                    console.log(
                        "Epoch mismatch detected. Self-healing keys...",
                    );
                    const keyPair = await getLocalKeyPair();
                    await fetchKey(keyPair);
                    // Retry poll next cycle or immediately?
                    // Let's let next cycle handle it to avoid loops, but we have new key now.
                }

                // Decrypt all
                const decrypted = data.messages.map((m: any) => {
                    const content = decryptMessage(
                        m.ciphertext,
                        m.nonce,
                        roomKey!,
                    );
                    return { ...m, content: content || "⚠️ Decryption Failed" };
                });

                // Simple dedupe or replace
                // For MVP just replace
                messages = decrypted;
            }
        } catch (e) {
            console.error("Poll error", e);
        }
    }

    async function send() {
        if (!inputValue.trim() || !roomKey) return;

        const text = inputValue.trim();
        inputValue = ""; // Optimistic clear

        try {
            // Encrypt
            const { ciphertext, nonce } = encryptMessage(text, roomKey);

            // Send
            await fetch(`/api/chat/rooms/${roomId}/messages`, {
                method: "POST",
                headers: { Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ ciphertext, nonce }),
            });

            poll(); // Immediate refresh
        } catch (e) {
            error = "Failed to send";
        }
    }

    onMount(() => {
        init();
    });

    onDestroy(() => {
        if (pollInterval) clearInterval(pollInterval);
    });
</script>

<div
    class="flex flex-col h-[600px] border border-white/10 rounded-xl bg-black/40 overflow-hidden relative"
>
    {#if error}
        <div
            class="absolute inset-0 bg-red-900/90 flex items-center justify-center p-8 z-50 text-center"
        >
            <div>
                <h3 class="text-xl font-bold mb-2">Access Error</h3>
                <p>{error}</p>
                <button
                    class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded"
                    on:click={() => location.reload()}>Retry</button
                >
            </div>
        </div>
    {/if}

    <div class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {#if isLoading}
            <div
                class="flex h-full items-center justify-center text-white/50 animate-pulse"
            >
                {status}
            </div>
        {:else if messages.length === 0}
            <div
                class="flex h-full items-center justify-center text-white/30 text-sm"
            >
                This frequency is quiet. Start the transmission.
            </div>
        {/if}

        {#each messages as msg}
            <div
                class="flex flex-col {msg.sender_hash.startsWith(
                    address.slice(0, 3),
                )
                    ? 'items-end'
                    : 'items-start'}"
                transition:fly={{ y: 10, duration: 200 }}
            >
                <!-- We assume simple self check logic or just generic display -->
                <!-- Sender hash is 16 chars. We can't match it easily to "self" without hashing self. -->
                <!-- For MVP, just align left. Or Hash self once. -->

                <div
                    class="max-w-[80%] bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
                >
                    <div
                        class="text-[10px] text-white/30 font-mono mb-1 flex justify-between gap-4"
                    >
                        <span>{msg.sender_hash}</span>
                        <span
                            >{new Date(
                                msg.created_at,
                            ).toLocaleTimeString()}</span
                        >
                    </div>
                    <div
                        class="text-sm font-light text-white/90 break-words whitespace-pre-wrap"
                    >
                        {msg.content}
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <div class="p-4 border-t border-white/10 bg-white/5 flex gap-2">
        <input
            type="text"
            bind:value={inputValue}
            on:keydown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Encrypting message..."
            class="flex-1 bg-black/50 border border-white/10 rounded px-4 py-2 text-sm focus:outline-none focus:border-accent text-white placeholder-white/20"
            disabled={isLoading || !roomKey}
        />
        <button
            on:click={send}
            disabled={isLoading || !inputValue.trim() || !roomKey}
            class="px-4 py-2 bg-accent text-black font-bold text-sm rounded hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            SEND
        </button>
    </div>
</div>
