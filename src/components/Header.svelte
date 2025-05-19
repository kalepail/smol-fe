<script lang="ts">
    export let _kid: string | null;
    export let _cid: string | null;

    import { onMount } from "svelte";
    import { keyId } from "../store/keyId";
    import { contractId } from "../store/contractId";
    import { account, server } from "../utils/passkey-kit";
    import { truncate } from "../utils/base";
    import Cookies from "js-cookie";
    // import { contractBalance, updateContractBalance } from "../store/contractBalance";

    keyId.set(_kid);
    contractId.set(_cid);

    let creating = false;

    onMount(async () => {
        if ($keyId) {
            if (!$contractId) {
                const { contractId: cid } = await account.connectWallet({
                    keyId: $keyId,
                });

                contractId.set(cid);
            } else {
                await account.connectWallet({keyId: $keyId});
            }
            
        }
    });

    // contractId.subscribe(async (cid) => {
    //     if (!cid) return;
    //     await updateContractBalance(cid);
    // })

    async function login() {
        const {
            rawResponse,
            keyIdBase64,
            contractId: cid,
        } = await account.connectWallet();

        const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
                type: "connect",
                keyId: keyIdBase64,
                contractId: cid,
                response: rawResponse,
            }),
        }).then(async (res) => {
            if (res.ok)
                return res.text();
            throw await res.text();
        });

        keyId.set(keyIdBase64);
        contractId.set(cid);

        Cookies.set("smol_token", jwt, {
            expires: 30,
            secure: true,
            sameSite: "None",
        });
    }

    async function signUp() {
        creating = true;

        try {
            const username = prompt("Enter your username");

            if (!username) {
                throw new Error("Username is required");
            }

            const {
                rawResponse,
                keyIdBase64,
                contractId: cid,
                signedTx,
            } = await account.createWallet("smol.xyz", `SMOL — ${username}`);

            const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                    type: "create",
                    keyId: keyIdBase64,
                    contractId: cid,
                    response: rawResponse,
                    username,
                }),
            }).then(async (res) => {
                if (res.ok)
                    return res.text();
                throw await res.text();
            });

            await server.send(signedTx);

            keyId.set(keyIdBase64);
            contractId.set(cid);

            Cookies.set("smol_token", jwt, {
                expires: 30,
                secure: true,
                sameSite: "None",
            });
        } finally {
            creating = false;
        }
    }

    function logout() {
        keyId.set(null);
        contractId.set(null);

        Cookies.remove("smol_token");

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
        <div class="flex items-center mr-auto">
            <h1 class="flex text-xl py-1">
                <a href="/"><strong>SMOL</strong></a>
            </h1>

            {#if $contractId}
                <a
                    class="ml-5 hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                        'created',
                    ) && 'underline'}"
                    href="/created">Created</a
                >

                <a
                    class="mx-5 hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                        'liked',
                    ) && 'underline'}"
                    href="/liked">Liked</a
                >
            {/if}
        </div>

        {#if $contractId}
            <a
                class="hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                    'create',
                ) && 'underline'}"
                href="/create">+ Create</a
            >
        {/if}

        <div class="flex items-center ml-auto">
            {#if $contractId}
                <a
                    class="mx-5 font-mono text-sm underline"
                    href="https://stellar.expert/explorer/public/contract/{$contractId}"
                    target="_blank">{truncate($contractId, 4)}</a
                >
                <!-- <span class="bg-green-700 text-yellow-100 px-3 py-1 rounded-full font-mono text-sm">{(Number($contractBalance ?? 0) / 1e7)} KALE</span> -->
                <button
                    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1"
                    on:click={logout}>Logout</button
                >
            {:else}
                <button class="mr-5 hover:underline" on:click={login}
                    >Login</button
                >
                <button
                    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded px-2 py-1 disabled:opacity-50"
                    on:click={signUp}
                    disabled={creating}
                    >{creating ? "Creating..." : "Create New Account"}</button
                >
            {/if}
        </div>
    </div>
</header>
