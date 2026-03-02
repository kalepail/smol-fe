---
name: mini-player-overlay
description: Standard pattern for grid item overlays with playback controls (Nintendo bounce, unified states).
---

# Mini Player Overlay (Grid View)

This pattern enables a consistent "Nintendo-style" bounce animation and unified playback control overlay for grid items (Artist page, Homescreen GlobalPlayer).

## Core Components

1.  **Main Container**: The card wrapper.
2.  **Visual Container**: The `aspect-square` div holding the image.
3.  **Unified Overlay**: The overlay containing controls, placed *outside* any clipping masks.

## 1. Main Container Logic

The card container handles the "Nintendo Bounce" on hover.

```svelte
<div
    class="flex flex-col gap-2 group text-left w-full relative min-w-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105"
    role="button"
    ...
>
```

**Key Classes:**
-   `transition-transform duration-300`
-   `ease-[cubic-bezier(0.34,1.56,0.64,1)]`: The specific "pop" curve.
-   `hover:scale-105`: The bounce scale.
-   `group`: Enables `group-hover` for the overlay.

## 2. Visual Container Structure

To prevent clipping of the overlay elements (buttons extending slightly or shadows), the Overlay must be a **sibling** of the Content Mask/Image, not a child.

```svelte
<!-- 1. Visual Aspect Container -->
<div class="aspect-square rounded-xl relative overflow-hidden z-10 ...">

    <!-- 2. Content Mask (Clipped Image) -->
    <div class="absolute inset-0 bg-slate-800 overflow-hidden ...">
        <img ... />
        <MiniVisualizer ... />
    </div>

    <!-- 3. Unified Overlay (Sibling - NOT Clipped by Mask) -->
    <div class="absolute inset-0 ... z-50 ...">
        ...
    </div>

</div>
```

## 3. Unified Overlay Implementation

Use a single overlay block for both Active (Playing) and Passive (Hover) states. Control visibility via `opacity-0 group-hover:opacity-100`.

**Container:**
```svelte
<div class="absolute inset-0 flex items-center justify-center gap-2 z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none bg-black/20 backdrop-blur-[2px]">
```
-   `pointer-events-none`: Allows clicks to pass through to the main card selection if not hitting a button.
-   `z-50`: Ensures it sits above visualizers/images.

**Controls:**
-   **Center Cluster**: Prev / Play(Pause) / Next.
-   **Corner Actions**: Artist (TL), Radio (TR), Like (BL), Details (BR).
-   **Buttons**: Must have `pointer-events-auto` and `e.stopPropagation()` to prevent triggering the card selection.

## Example usage

Refer to `ArtistResults.svelte` (Artist Grid) and `GlobalPlayer.svelte` (Home Grid) for live implementations.
