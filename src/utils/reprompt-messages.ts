
export const REPROMPT_MESSAGES = [
    // Consumer
    "want the radio to feel like a one-tap wormhole? set a passkey and keep your place.",
    "save your spot with a passkey — then hit play and let ‘next’ do its magic.",
    "make tomorrow’s login instant: create a passkey and keep the vibe moving.",
    "if ‘next’ is your side quest button, a passkey is your quick save.",
    "keep your listening streak intact — a passkey makes coming back effortless.",

    // Creator
    "working on a mixtape? a passkey keeps your creator progress locked in like a quick save.",
    "drop songs, come back fast: set a passkey so your studio door opens in one tap.",
    "passkey = press start once. then you’re free to ship again and again.",
    "keep your artist identity tied to you, not a tab — create a passkey.",
    "if you’re making weird stuff (good), a passkey helps you keep your place while you do it.",

    // Collector
    "building a little museum of bangers? create a passkey so your shelf stays yours.",
    "save the ones you love — and save your login too. passkey is the quick way back.",
    "your playlists are a time capsule. a passkey helps you return to them instantly.",
    "curating takes taste. keeping it synced takes a passkey.",
    "if your collection is your comfort food, a passkey is the fridge light that always works.",

    // Altruist
    "supporting real humans is a good habit — a passkey makes showing up again easier.",
    "want your good vibes to compound? create a passkey so you can pop in fast.",
    "a passkey is like a tiny promise to return — the kind creators can feel.",
    "keep your ‘i got you’ energy on speed dial: passkey login, one tap.",
    "if you like helping artists keep creating, a passkey helps you keep your place in the loop."
];

export function getRepromptMessage() {
    // Random selection
    const index = Math.floor(Math.random() * REPROMPT_MESSAGES.length);
    const msg = REPROMPT_MESSAGES[index];

    return { msg, index };
}

export function incrementRepromptIndex() {
    // No-op for random strategy, kept for compatibility if needed
    // or can be removed if we clean up the component
}
