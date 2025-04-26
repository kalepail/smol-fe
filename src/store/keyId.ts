import { writable, type Writable } from 'svelte/store';

export const keyId: Writable<string | null> = writable();

if (!import.meta.env.SSR && localStorage.hasOwnProperty("smol:keyId")) {
    keyId.set(localStorage.getItem("smol:keyId")!);
}