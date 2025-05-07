<script lang="ts">
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import BarAudioPlayer from "./BarAudioPlayer.svelte";
    import { onMount } from "svelte";
    import Loader from "./Loader.svelte";
    import { Address, hash, StrKey, xdr } from "@stellar/stellar-sdk/minimal";
    import { contractId } from "../store/contractId";
    import { Client } from 'fp-sdk'
    import { publicKey } from "../utils/base";
    import { account } from "../utils/passkey-kit";
    import { keyId } from "../store/keyId";

    export let results: any;

    let previous_id: string | null = null;
    let playing_id: string | null = null;
    let likes: any[] = [];

    contractId.subscribe(async (cid) => {
        if (cid) {
            likes = await fetch(`${import.meta.env.PUBLIC_API_URL}/likes`, {
                credentials: "include",
            }).then(async (res) => {
                if (res.ok) return res.json();
                return [];
            });

            results = results.map((smol: any) => {
                smol.Liked = likes.some((id: string) => id === smol.Id);
                return smol;
            });
        }
    });

    onMount(async () => {
        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("previoustrack", () => {
                if (previous_id) {
                    songToggle(previous_id);
                }
            });

            navigator.mediaSession.setActionHandler("nexttrack", () => {
                songNext();
            });

            // navigator.mediaSession.setActionHandler('play', () => {
            //     play();
            // });

            // navigator.mediaSession.setActionHandler('pause', () => {
            //     pause();
            // });

            navigator.mediaSession.metadata = new MediaMetadata({
                // title: 'Song Title',
                // artist: 'Artist Name',
                album: "Smol",
                artwork: [
                    {
                        src: `https://smol-workflow.sdf-ecosystem.workers.dev/image/${playing_id}.png?scale=8`,
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            });
        }
    });

    function songToggle(id: string) {
        previous_id = playing_id;
        playing_id = playing_id === id ? null : id;
    }

    function songNext() {
        if (playing_id === null || results.length === 0) return;

        // Get an array of all IDs except the currently playing one
        const otherIds = results
            .filter((smol: any) => smol.Id !== playing_id)
            .map((smol: any) => smol.Id);

        // If there are no other songs, return
        if (otherIds.length === 0) return;

        // Select a random ID from the available options
        const randomIndex = Math.floor(Math.random() * otherIds.length);
        songToggle(otherIds[randomIndex]);
    }

    async function songLike(smol: any) {
        try {
            smol.Liking = true;

            let xdr_string: string | undefined = undefined

            // if selling
            if (smol.Liked) {
                if (!$contractId || !$keyId)
                    return

                const contract_id: string | undefined = StrKey.encodeContract(hash(xdr.HashIdPreimage.envelopeTypeContractId(
                    new xdr.HashIdPreimageContractId({
                        networkId: hash(Buffer.from(import.meta.env.PUBLIC_NETWORK_PASSPHRASE)),
                        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                            new xdr.ContractIdPreimageFromAddress({
                                address: Address.fromString(publicKey).toScAddress(),
                                salt: Buffer.from(smol.Id, 'hex'),
                            })
                        )
                    })
                ).toXDR()));

                const contract = new Client({
                    contractId: contract_id,
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
                    networkPassphrase: import.meta.env.PUBLIC_NETWORK_PASSPHRASE,
                });

                let at = await contract.burn({
                    from: $contractId,
                    amount: 1n,
                });

                at = await account.sign(at, { keyId: $keyId })

                xdr_string = at.built?.toXDR()
            }

            await fetch(`${import.meta.env.PUBLIC_API_URL}/like/${smol.Id}`, {
                method: "PUT",
                credentials: "include",
                body: JSON.stringify({
                    xdr: xdr_string
                })
            }).then(async (res) => {
                if (!res.ok) throw await res.text();
            });

            smol.Liked = !smol.Liked;
        } finally {
            smol.Liking = false;
        }
    }
</script>

<!-- TODO 
 have the bg of each card match the image primary color 
 progressive loading of images and music

 build a mini audio player that shows more details of the current song
 also find a way to maintain this player across the app
 -->

<div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
>
    {#each results as smol}
        <div class="flex flex-col bg-slate-700 rounded overflow-hidden">
            <div class="group relative">
                <img
                    class="aspect-square object-contain pixelated w-full shadow-md"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />

                {#if $contractId}
                    <button
                        class="absolute z-2 right-0 bottom-0 p-2 bg-slate-950/50 rounded-tl-lg backdrop-blur-xs {!smol.Liked &&
                            !smol.Liking &&
                            'opacity-0 group-hover:opacity-100'}"
                        aria-label="Like"
                        disabled={smol.Liking}
                        on:click={() => songLike(smol)}
                    >
                        {#if smol.Liking}
                            <Loader classNames="w-6 h-6" />
                        {:else if smol.Liked}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                class="size-6"
                            >
                                <path
                                    d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z"
                                />
                            </svg>
                        {:else}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                                stroke="currentColor"
                                class="size-6"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                                />
                            </svg>
                        {/if}
                    </button>
                {/if}

                <a
                    class="absolute inset-0"
                    href={`/${smol.Id}`}
                    aria-label={smol.Title}
                ></a>
            </div>

            <div class="flex items-center relative p-2 flex-1 overflow-hidden">
                <h1 class="relative z-1 leading-4 text-sm text-white">
                    {smol.Title}
                </h1>
                <img
                    class="absolute inset-0 z-0 opacity-80 scale-y-[-1] w-full h-full blur-lg"
                    src={`${import.meta.env.PUBLIC_API_URL}/image/${smol.Id}.png`}
                    alt={smol.Title}
                    loading="lazy"
                />
                <div class="relative z-2 pl-2 ml-auto">
                    <MiniAudioPlayer
                        id={smol.Id}
                        {playing_id}
                        song={`${import.meta.env.PUBLIC_API_URL}/song/${smol.Song_1}.mp3`}
                        songToggle={() => songToggle(smol.Id)}
                        {songNext}
                    />
                </div>
            </div>
        </div>
    {/each}
</div>

<!-- <BarAudioPlayer classNames="fixed z-2 p-2 bottom-0 left-0 right-0 bg-slate-950/50 backdrop-blur" /> -->
