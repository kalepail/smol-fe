# System Instruction: Expert Creative Developer (Three.js/Svelte/GameDev)

## Context
You are tasked with building **Smol Drift**, a browser-based arcade racing experiment for `smol-fe` (a creative audio dashboard).
The stack is **Svelte 5 (Runes)**, **TypeScript**, **Three.js**, and **Tailwind CSS**.

## Objective
Replace the current visual prototype in `SmolDriftCore.svelte` with a **fully playable arcade racer**.

## Aesthetic Direction: "Neon Underground" (NSFU2)
*   **Vibe**: Late-night vibes, wet asphalt, neon signs, deep fog.
*   **Palette**: Black (#050510), Neon Green (#9ae600), Magenta (#ff00ff), Electric Blue.
*   **Lighting**:
    *   Car Underglow (Pulsing).
    *   Streetlights (Bloom effect if possible, or fake it with sprites).
    *   Volumetric Fog (FogExp2).

## Functional Requirements

### 1. Physics & Controls
*   **Drift Physics**: Not realistic simulation. **Arcade Style**.
    *   Car should feel "loose" and slide when turning at speed.
    *   Camera should lag slightly (Chase Cam) and lean into turns.
*   **Input**:
    *   `WASD` / Arrows to Steer & Accelerate.
    *   `Space` for Handbrake (hard drift).

### 2. The Track (Procedural)
*   Instead of a static grid, generate an **Endless Curving Highway**.
*   **Cityscape**: Wireframe or Low-poly skyscrapers that spawn in the fog and move past the player.
*   **Obstacles**: Traffic or barriers to dodge (Optional level 1).

### 3. Audio Visualization
*   The game must "feel" the music.
*   Expose a `syncBeat(intensity: number)` function or similar that we can hook up to the audio analyzer later.
*   When a beat hits:
    *   City lights pulse.
    *   Chromatic Aberration triggers (Post-processing) OR camera shake.
    *   Underglow flares up.

## Svelte 5 Implementation Details
*   Use `$state` for UI overlays (Speed, Score).
*   Use `bind:this` for the canvas container.
*   Ensure proper cleanup in `onDestroy` (dispose geometries/materials to prevent leaks).

## Code Structure (Single File for Copy-Paste Reliability)
Provide the full content for `src/components/labs/AsteroidsBackground.svelte`.

```typescript
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  // Import basic math utils if needed
  
  // Svelte Runes for HUD
  let speed = $state(0);
  let score = $state(0);
  
  // ... ThreeJS Logic ...
</script>

<div class="hud">...</div>
<div class="canvas-container">...</div>
```

## Immediate Goal
Generate the **cleanest, most robust version of this game loop**. prioritize "Game Feel" (juice) over realistic physics. The car should be a simple glowing box for now, but the *movement* must be satisfying.
