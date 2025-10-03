<script lang="ts">
    export let _kid: string | null;
    export let _cid: string | null;

    import { onMount } from "svelte";
    import { keyId } from "../store/keyId";
    import { contractId } from "../store/contractId";
    import { account, server } from "../utils/passkey-kit";
    import { truncate } from "../utils/base";
    import Cookies from "js-cookie";
    import { contractBalance, updateContractBalance } from "../store/contractBalance";
    import {
        enterMixtapeMode,
        exitMixtapeMode,
        mixtapeDraftHasContent,
        mixtapeMode,
    } from "../store/mixtape";
    import { getDomain } from "tldts";
    import Loader from "./Loader.svelte";

    keyId.set(_kid);
    contractId.set(_cid);

    let creating = false;
    let playlist: string | null = null;
    let loadingBalance = false;

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

        playlist = localStorage.getItem("smol:playlist");
    });

    contractId.subscribe(async (cid) => {
        if (!cid) {
            loadingBalance = false;
            return;
        }
        loadingBalance = true;
        await updateContractBalance(cid);
        loadingBalance = false;
    })

    async function login() {
        const {
            rawResponse,
            keyIdBase64,
            contractId: cid,
        } = await account.connectWallet({
            rpId: getDomain(window.location.hostname) ?? undefined,
        });

        const jwt = await fetch(`${import.meta.env.PUBLIC_API_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
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
            path: "/",
            secure: true,
            sameSite: "Lax",
            domain: ".smol.xyz",
            expires: 30,
        });

        // Sepecial case for localhost
        // Cookies.set("smol_token", jwt, {
        //     path: "/",
        //     secure: true,
        //     sameSite: "None",
        //     expires: 30,
        // });
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
                path: "/",
                secure: true,
                sameSite: "Lax",
                domain: ".smol.xyz",
                expires: 30,
            });
        } finally {
            creating = false;
        }
    }

    function handleMixtapeClick() {
        if ($mixtapeMode.active) {
            if ($mixtapeDraftHasContent) {
                const confirmed = confirm(
                    "Exit Mixtape Mode? Your draft will stay saved locally.",
                );
                if (!confirmed) return;
            }
            exitMixtapeMode();
        } else {
            enterMixtapeMode();
        }
    }

    async function logout() {
        keyId.set(null);
        contractId.set(null);

        Cookies.remove("smol_token", {
            path: "/",
            secure: true,
            sameSite: "Lax",
            domain: ".smol.xyz",
        });

        // Sepecial case for localhost
        // Cookies.remove("smol_token", {
        //     path: "/",
        //     secure: true,
        //     sameSite: "None",
        // });

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

        await fetch(`${import.meta.env.PUBLIC_API_URL}/logout`, {
            method: "POST",
        });

        location.reload();
    }
</script>

<header class="relative p-2 bg-slate-800 text-lime-500">
    <div class="flex items-center flex-wrap max-w-[1024px] mx-auto">
        <div class="flex items-center mr-auto">
            <h1 class="flex flex-col text-xl py-1">
                <a href="/"><strong>SMOL</strong></a>
            </h1>

            <a
                class="ml-4 hover:underline {!import.meta.env.SSR && location.pathname.includes(
                    "mixtapes",
                ) && 'underline'}"
                href="/mixtapes"
            >Mixtapes</a>

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
            <div class="flex items-center gap-3 my-2">
                <button
                    class={`rounded px-2 py-1 text-sm transition-colors ${
                        $mixtapeMode.active
                            ? "bg-lime-400 text-slate-950 hover:bg-lime-300"
                            : "text-lime-400 ring-1 ring-lime-400/40 hover:bg-lime-400/10"
                    }`}
                    on:click={handleMixtapeClick}
                >
                    <span class="mr-1">{$mixtapeMode.active ? "Mixtape Mode" : "+ Mixtape"}</span>
                    {#if !$mixtapeMode.active && $mixtapeDraftHasContent}
                        <span class="inline-block h-2 w-2 rounded-full bg-lime-300 align-middle"></span>
                    {/if}
                </button>

                <a
                    class="hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                        'create',
                    ) && 'underline'}"
                    href="/create">+ Create</a
                >
            </div>
        {/if}

        <div class="flex items-center ml-auto gap-3">
            {#if $contractId}
                <a
                    class="font-mono text-sm underline ml-5"
                    href="https://stellar.expert/explorer/public/contract/{$contractId}"
                    target="_blank">{truncate($contractId, 4)}</a
                >
                <a
                    class="text-lime-500 bg-lime-500/20 ring ring-lime-500 hover:bg-lime-500/30 rounded-full px-2 py-1 flex items-center justify-center min-w-[80px]"
                    href="/account"
                >
                    {#if loadingBalance}
                        <Loader classNames="w-4 h-4" textColor="text-lime-500" />
                    {:else if $contractBalance !== null}
                        {(() => {
                            const raw = Number($contractBalance) / 1e7;
                            const [int, dec] = raw.toFixed(7).split(".");
                            const intWithCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                            if (Number(dec) > 0) {
                                // Remove trailing zeros from decimals
                                const trimmedDec = dec.replace(/0+$/, "");
                                return `${intWithCommas}.${trimmedDec} KALE`;
                            }
                            return `${intWithCommas} KALE`;
                        })()}
                    {/if}
                </a>
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

    {#if playlist}
        <div class="flex items-center justify-center md:justify-start flex-wrap max-w-[1024px] mx-auto py-2">
            <a
                class="text-sm hover:underline {!import.meta.env.SSR && location.pathname.endsWith(
                    playlist,
                ) && 'underline'}"
                href={`/playlist/${playlist}`}>{playlist}</a
            >
        </div>
    {/if}
</header>
