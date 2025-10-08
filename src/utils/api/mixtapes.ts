import type { MixtapeDraft, SmolDetailResponse, SongData } from "../../types/domain";

export type MixtapeSummary = {
    id: string;
    title: string;
    description: string;
    trackCount: number;
    coverUrls: (string | null)[];
    updatedAt: string;
};

export type MixtapeDetail = MixtapeSummary & {
    tracks: MixtapeDraft["tracks"];
};

type ApiMixtape = {
    Id: string;
    Title: string;
    Desc: string;
    Smols: string[];
    Address: string;
    Created_At: string;
};

const API_URL = import.meta.env.PUBLIC_API_URL!;

export async function publishMixtape(draft: MixtapeDraft): Promise<MixtapeDetail> {
    const response = await fetch(`${API_URL}/mixtapes`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
            title: draft.title || "Untitled Mixtape",
            desc: draft.description,
            smols: draft.tracks.map((track) => track.id),
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to publish mixtape: ${response.statusText}`);
    }

    const data: { id: string } = await response.json();

    return {
        id: data.id,
        title: draft.title || "Untitled Mixtape",
        description: draft.description,
        trackCount: draft.tracks.length,
        coverUrls: draft.tracks.slice(0, 4).map((track) => track.coverUrl ?? null),
        updatedAt: new Date().toISOString(),
        tracks: draft.tracks,
    };
}

export async function listMixtapes(): Promise<MixtapeSummary[]> {
    const response = await fetch(`${API_URL}/mixtapes`, {
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch mixtapes: ${response.statusText}`);
    }

    const data: ApiMixtape[] = await response.json();

    // Map mixtapes and populate cover URLs from first 4 tracks
    const mixtapes = await Promise.all(
        data.map(async (mixtape) => {
            const coverUrls: (string | null)[] = [];

            // Fetch cover images for first 4 tracks
            for (let i = 0; i < Math.min(4, mixtape.Smols.length); i++) {
                const smolId = mixtape.Smols[i];
                if (smolId) {
                    coverUrls.push(`${API_URL}/image/${smolId}.png`);
                } else {
                    coverUrls.push(null);
                }
            }

            // Fill remaining slots with null
            while (coverUrls.length < 4) {
                coverUrls.push(null);
            }

            return {
                id: mixtape.Id,
                title: mixtape.Title,
                description: mixtape.Desc,
                trackCount: mixtape.Smols.length,
                coverUrls,
                updatedAt: mixtape.Created_At,
            };
        })
    );

    return mixtapes;
}

export async function getMixtapeDetail(id: string): Promise<MixtapeDetail | null> {
    const response = await fetch(`${API_URL}/mixtapes/${id}`, {
        credentials: "include",
    });

    if (!response.ok) {
        if (response.status === 404) {
            return null;
        }
        throw new Error(`Failed to fetch mixtape detail: ${response.statusText}`);
    }

    const data: ApiMixtape = await response.json();

    return {
        id: data.Id,
        title: data.Title,
        description: data.Desc,
        trackCount: data.Smols.length,
        coverUrls: [null, null, null, null], // Will be populated when we fetch smol details
        updatedAt: data.Created_At,
        tracks: data.Smols.map((smolId) => ({
            id: smolId,
            title: "Loading...", // Will be populated when we fetch smol details
            coverUrl: null,
            creator: null,
        })),
    };
}

export type SmolTrackData = {
    id: string;
    title: string | null;
    creator: string | null;
    coverUrl: string | null;
    audioUrl: string | null;
    lyrics: {
        title?: string;
        style?: string[];
    } | null;
};

export async function getSmolTrackData(smolId: string): Promise<SmolTrackData> {
    const response = await fetch(`${API_URL}/${smolId}`);

    if (!response.ok) {
        return {
            id: smolId,
            title: "Failed to load",
            creator: null,
            coverUrl: null,
            audioUrl: null,
            lyrics: null,
        };
    }

    const data: SmolDetailResponse = await response.json();
    const d1 = data?.d1;
    const kv_do = data?.kv_do;

    const bestSong = d1?.Song_1;
    const songs: SongData[] = kv_do?.songs || [];
    const bestSongData = songs.find((s) => s.music_id === bestSong);

    return {
        id: smolId,
        title: kv_do?.lyrics?.title ?? kv_do?.description ?? d1?.Title ?? null,
        creator: d1?.Address ?? null,
        coverUrl: `${API_URL}/image/${smolId}.png` as string,
        audioUrl: (bestSongData && bestSongData.status < 4
            ? bestSongData.audio
            : bestSongData?.music_id
                ? `${API_URL}/song/${bestSongData.music_id}.mp3`
                : null) ?? null,
        lyrics: kv_do?.lyrics ? {
            title: kv_do.lyrics.title,
            style: kv_do.lyrics.style,
        } : null,
    };
}

