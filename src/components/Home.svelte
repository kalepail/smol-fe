<script lang="ts">
    import MiniAudioPlayer from "./MiniAudioPlayer.svelte";
    import BarAudioPlayer from "./BarAudioPlayer.svelte";
    import { onMount } from "svelte";
    import Loader from "./Loader.svelte";
    import { Address, hash, StrKey, xdr } from "@stellar/stellar-sdk/minimal";
    import { contractId } from "../store/contractId";
    import { Client } from "fp-sdk";
    import { publicKey, rpc } from "../utils/base";
    import { account } from "../utils/passkey-kit";
    import { keyId } from "../store/keyId";
    import {
        playingId,
        currentSong,
        audioProgress,
        selectSong,
        togglePlayPause,
    } from "../store/audio";

    export let results: any;
    export let playlist: string | null;

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
                const currentIndex = results.findIndex(
                    (s: any) => s.Id === $currentSong?.Id,
                );
                if (currentIndex > 0) {
                    selectSong(results[currentIndex - 1]);
                } else if (results.length > 0) {
                    selectSong(results[results.length - 1]);
                }
            });

            navigator.mediaSession.setActionHandler("nexttrack", () => {
                songNext();
            });
        }

        if (playlist) {
            localStorage.setItem("smol:playlist", playlist);
        }
    });

    $: if ("mediaSession" in navigator && $currentSong) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: $currentSong.Title,
            artist: "Smol",
            album: "Smol",
            artwork: [
                {
                    src: `${import.meta.env.PUBLIC_API_URL}/image/${$currentSong.Id}.png?scale=8`,
                    sizes: "512x512",
                    type: "image/png",
                },
            ],
        });
    } else if ("mediaSession" in navigator && !$currentSong) {
        navigator.mediaSession.metadata = null;
    }

    function songNext() {
        if (results.length === 0) return;
        const currentId = $currentSong?.Id;
        let nextIndex = 0;

        if (currentId) {
            const currentIndex = results.findIndex(
                (smol: any) => smol.Id === currentId,
            );
            if (currentIndex !== -1 && currentIndex < results.length - 1) {
                nextIndex = currentIndex + 1;
            }
        }
        selectSong(results[nextIndex]);
    }

    async function songLike(smol: any) {
        try {
            smol.Liking = true;
            let xdr_string: string | undefined = undefined;
            if (smol.Liked) {
                if (!$contractId || !$keyId) return;

                const contract_id: string | undefined = StrKey.encodeContract(
                    hash(
                        xdr.HashIdPreimage.envelopeTypeContractId(
                            new xdr.HashIdPreimageContractId({
                                networkId: hash(
                                    Buffer.from(
                                        import.meta.env
                                            .PUBLIC_NETWORK_PASSPHRASE,
                                    ),
                                ),
                                contractIdPreimage:
                                    xdr.ContractIdPreimage.contractIdPreimageFromAddress(
                                        new xdr.ContractIdPreimageFromAddress({
                                            address:
                                                Address.fromString(
                                                    publicKey,
                                                ).toScAddress(),
                                            salt: Buffer.from(smol.Id, "hex"),
                                        }),
                                    ),
                            }),
                        ).toXDR(),
                    ),
                );

                const contract = new Client({
                    contractId: contract_id,
                    rpcUrl: import.meta.env.PUBLIC_RPC_URL,
                    networkPassphrase: import.meta.env
                        .PUBLIC_NETWORK_PASSPHRASE,
                });

                let at = await contract.burn({
                    from: $contractId,
                    amount: 1n,
                });

                const { sequence } = await rpc.getLatestLedger();
                at = await account.sign(at, {
                    keyId: $keyId,
                    expiration: sequence + 60,
                });
                xdr_string = at.built?.toXDR();
            }

            await fetch(`${import.meta.env.PUBLIC_API_URL}/like/${smol.Id}`, {
                method: "PUT",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    xdr: xdr_string,
                }),
            }).then(async (res) => {
                if (!res.ok) throw await res.text();
            });

            smol.Liked = !smol.Liked;
        } finally {
            smol.Liking = false;
        }
    }
</script>

<div
    class="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2 m-2 pb-10"
>
    {#each results as smol (smol.Id)}
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
                            'opacity-0 group-hover:opacity-100 hover:bg-slate-950/70'}"
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
                        playing_id={$playingId}
                        songToggle={() => {
                            if ($currentSong?.Id === smol.Id) {
                                togglePlayPause();
                            } else {
                                selectSong(smol);
                            }
                        }}
                        {songNext}
                        progress={$currentSong?.Id === smol.Id
                            ? $audioProgress
                            : 0}
                    />
                </div>
            </div>
        </div>
    {/each}
</div>

<BarAudioPlayer
    classNames="fixed z-2 p-2 bottom-2 lg:w-full left-4 right-4 lg:max-w-1/2 lg:min-w-[300px] lg:left-1/2 lg:-translate-x-1/2 rounded-md bg-slate-950/50 backdrop-blur-lg border border-white/20 shadow-lg"
    {songNext}
    onLike={songLike}
/>
