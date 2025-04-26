<script lang="ts">
    import { onMount } from "svelte";
    import { keyId } from "../store/keyId";
    import { contractId } from "../store/contractId";
    import { account, server } from "../utils/passkey-kit";
    import { truncate } from "../utils/base";
    // import { contractBalance, updateContractBalance } from "../store/contractBalance";

    let unsure = true;
    let creating = false;

    onMount(async () => {
        if ($keyId) {
            const { contractId: cid } = await account.connectWallet({
                keyId: $keyId,
            });

            contractId.set(cid);
        }

        unsure = false;
    });

    // contractId.subscribe(async (cid) => {
    //     if (!cid) return;
    //     await updateContractBalance(cid);
    // })

    async function login() {
        const { keyIdBase64, contractId: cid } = await account.connectWallet();

        keyId.set(keyIdBase64);
        localStorage.setItem("smol:keyId", keyIdBase64);

        contractId.set(cid);
    }

    async function signUp() {
        creating = true;

        try {
            const {
                keyIdBase64,
                contractId: cid,
                signedTx,
            } = await account.createWallet("smol.xyz", "SMOL Player");

            await server.send(signedTx);

            keyId.set(keyIdBase64);
            localStorage.setItem("smol:keyId", keyIdBase64);

            contractId.set(cid);
        } finally {
            creating = false;
        }
    }

    function logout() {
        keyId.set(null);
        contractId.set(null);

        Object.keys(localStorage).forEach((key) => {
            if (key.includes("smol:")) {
                localStorage.removeItem(key);
            }
        });

        Object.keys(sessionStorage).forEach((key) => {
            if (key.includes("smol:")) {
                sessionStorage.removeItem(key);
            }
        });

        location.reload();
    }
</script>

<header class="relative p-2 bg-slate-800 text-lime-500">
    <div class="flex items-center flex-wrap max-w-[1024px] mx-auto">
        <h1 class="flex text-xl py-1">
            <a href="/"><strong>SMOL</strong></a>
        </h1>

        <!-- <a
            class="ml-4 hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                'create',
            ) && 'underline'}"
            href="/create">+ Create</a
        > -->

        {#if !unsure}
            <div class="flex items-center ml-auto">
                {#if $contractId}
                    <a
                        class="mr-4 font-mono text-sm underline"
                        href="https://stellar.expert/explorer/public/contract/{$contractId}"
                        target="_blank">{truncate($contractId, 4)}</a
                    >
                    <!-- <span class="bg-green-700 text-yellow-100 px-3 py-1 rounded-full font-mono text-sm">{(Number($contractBalance ?? 0) / 1e7)} KALE</span> -->
                    <button
                        class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1"
                        on:click={logout}>Logout</button
                    >
                {:else}
                    <button class="mr-4 hover:underline" on:click={login}>Login</button>
                    <button
                        class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
                        on:click={signUp}
                        disabled={creating}
                        >{creating ? "Creating..." : "Create New Account"}</button
                    >
                {/if}
            </div>
        {/if}
    </div>
</header>
