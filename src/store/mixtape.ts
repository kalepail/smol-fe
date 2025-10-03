import { derived, get, writable } from "svelte/store";

export type MixtapeTrack = {
    id: string;
    title: string;
    coverUrl: string | null;
    creator: string | null;
};

export type MixtapeDraft = {
    draftId: string;
    title: string;
    description: string;
    tracks: MixtapeTrack[];
    updatedAt: string;
};

type MixtapeModeState = {
    active: boolean;
};

const STORAGE_KEY = "smol:mixtape-draft";
const MODE_STORAGE_KEY = "smol:mixtape-mode";
const isBrowser = typeof window !== "undefined";

function createDraftId(): string {
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraft(overrides: Partial<MixtapeDraft> = {}): MixtapeDraft {
    return {
        draftId: createDraftId(),
        title: "",
        description: "",
        tracks: [],
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function loadDraftFromStorage(): MixtapeDraft {
    if (!isBrowser) return emptyDraft();

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyDraft();

        const parsed = JSON.parse(raw) as Partial<MixtapeDraft>;
        if (!parsed || typeof parsed !== "object") {
            return emptyDraft();
        }

        const tracks: MixtapeTrack[] = Array.isArray(parsed.tracks)
            ? parsed.tracks
                  .filter((track) => track && typeof track === "object" && typeof track.id === "string")
                  .map((track) => ({
                      id: track.id,
                      title: typeof track.title === "string" ? track.title : "Untitled Smol",
                      coverUrl: typeof track.coverUrl === "string" ? track.coverUrl : null,
                      creator: typeof track.creator === "string" ? track.creator : null,
                  }))
            : [];

        return {
            draftId: typeof parsed.draftId === "string" ? parsed.draftId : createDraftId(),
            title: typeof parsed.title === "string" ? parsed.title : "",
            description: typeof parsed.description === "string" ? parsed.description : "",
            tracks,
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        };
    } catch (error) {
        console.warn("Failed to read mixtape draft from storage", error);
        return emptyDraft();
    }
}

function persistDraft(draft: MixtapeDraft) {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
        console.warn("Failed to persist mixtape draft", error);
    }
}

function touchDraft(draft: MixtapeDraft): MixtapeDraft {
    return {
        ...draft,
        updatedAt: new Date().toISOString(),
    };
}

function normalizeTrack(track: MixtapeTrack): MixtapeTrack {
    return {
        id: track.id,
        title: track.title ?? "Untitled Smol",
        coverUrl: track.coverUrl ?? null,
        creator: track.creator ?? null,
    };
}

function dedupeTracks(tracks: MixtapeTrack[]): MixtapeTrack[] {
    const seen = new Set<string>();
    const cleaned: MixtapeTrack[] = [];
    for (const track of tracks) {
        if (!track?.id || seen.has(track.id)) continue;
        seen.add(track.id);
        cleaned.push(normalizeTrack(track));
    }
    return cleaned;
}

function createMixtapeDraftStore() {
    const store = writable<MixtapeDraft>(loadDraftFromStorage());

    if (isBrowser) {
        store.subscribe((value) => {
            persistDraft(value);
        });
    }

    const { subscribe, set, update } = store;

    return {
        subscribe,
        setTitle(title: string) {
            update((draft) => touchDraft({ ...draft, title }));
        },
        setDescription(description: string) {
            update((draft) => touchDraft({ ...draft, description }));
        },
        addTrack(track: MixtapeTrack) {
            update((draft) => {
                if (draft.tracks.some((existing) => existing.id === track.id)) {
                    return draft;
                }

                const next: MixtapeDraft = {
                    ...draft,
                    tracks: [...draft.tracks, normalizeTrack(track)],
                };

                return touchDraft(next);
            });
        },
        insertTrack(track: MixtapeTrack, index: number) {
            update((draft) => {
                if (draft.tracks.some((existing) => existing.id === track.id)) {
                    return draft;
                }

                const normalized = normalizeTrack(track);
                const clampedIndex = Math.max(0, Math.min(index, draft.tracks.length));
                const updatedTracks = [...draft.tracks];
                updatedTracks.splice(clampedIndex, 0, normalized);

                return touchDraft({
                    ...draft,
                    tracks: updatedTracks,
                });
            });
        },
        removeTrack(id: string) {
            update((draft) => {
                if (!draft.tracks.some((track) => track.id === id)) return draft;
                const next: MixtapeDraft = {
                    ...draft,
                    tracks: draft.tracks.filter((track) => track.id !== id),
                };
                return touchDraft(next);
            });
        },
        moveTrack(fromIndex: number, toIndex: number) {
            update((draft) => {
                const tracks = [...draft.tracks];
                if (
                    fromIndex < 0 ||
                    fromIndex >= tracks.length ||
                    toIndex < 0 ||
                    toIndex >= tracks.length ||
                    fromIndex === toIndex
                ) {
                    return draft;
                }

                const [item] = tracks.splice(fromIndex, 1);
                tracks.splice(toIndex, 0, item);

                return touchDraft({ ...draft, tracks });
            });
        },
        reset({ keepDraftId = false }: { keepDraftId?: boolean } = {}) {
            const currentId = keepDraftId ? get(store).draftId : createDraftId();
            set(emptyDraft({ draftId: currentId }));
        },
        clear() {
            set(emptyDraft());
            if (isBrowser) {
                window.localStorage.removeItem(STORAGE_KEY);
            }
        },
        load(draft: MixtapeDraft) {
            set(touchDraft(draft));
        },
        touch() {
            update((draft) => touchDraft(draft));
        },
        setTracks(tracks: MixtapeTrack[]) {
            update((draft) => {
                const next: MixtapeDraft = {
                    ...draft,
                    tracks: dedupeTracks(tracks),
                };
                return touchDraft(next);
            });
        },
        getSnapshot(): MixtapeDraft {
            return get(store);
        },
    };
}

export const mixtapeDraft = createMixtapeDraftStore();

export const mixtapeDraftHasContent = derived(mixtapeDraft, ($draft) => {
    return Boolean($draft.title || $draft.description || $draft.tracks.length > 0);
});

function loadModeState(): MixtapeModeState {
    if (!isBrowser) return { active: false };

    try {
        const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
        if (!raw) return { active: false };

        const parsed = JSON.parse(raw) as Partial<MixtapeModeState> | null;
        if (!parsed || typeof parsed !== "object") return { active: false };

        return {
            active: Boolean(parsed.active),
        };
    } catch (error) {
        console.warn("Failed to read mixtape mode from storage", error);
        return { active: false };
    }
}

function persistModeState(state: MixtapeModeState) {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn("Failed to persist mixtape mode", error);
    }
}

const modeStore = writable<MixtapeModeState>(loadModeState());

if (isBrowser) {
    modeStore.subscribe((value) => {
        persistModeState(value);
    });
}

export const mixtapeMode = {
    subscribe: modeStore.subscribe,
};

export function enterMixtapeMode() {
    modeStore.set({ active: true });
}

export function exitMixtapeMode() {
    modeStore.set({ active: false });
}

export function toggleMixtapeMode() {
    const current = get(modeStore);
    modeStore.set({ active: !current.active });
}

export const mixtapeTrackIds = derived(mixtapeDraft, ($draft) => new Set($draft.tracks.map((track) => track.id)) as Set<string>);
