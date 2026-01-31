---
name: remotion
description: Instructions for creating programmatic videos using Remotion in this project.
---

# Remotion Skill

This skill outlines how to create, preview, and render videos using Remotion.
**NOTE:** Since `smol-fe` is a Svelte project and Remotion is React-based, we use a **standalone** Remotion project located in `remotion-studio/`.

## Directory Structure

All Remotion-related code resides in the `remotion-studio` subdirectory.

```
remotion-studio/
├── src/
│   ├── index.ts          # Entry point
│   ├── Root.tsx          # Registry of Compositions
│   └── compositions/     # Individual video components
└── package.json
```

## Setup (If not already set up)

Initialize the studio:
```bash
npx create-video@latest remotion-studio
```
(Select "Hello World" or "Blank" template)

## Workflow

1.  **Work Directory**: Always `cd remotion-studio` before running Remotion commands.
2.  **Start Studio**: `npm start` (Runs on noot.smol.xyz)
3.  **Render**: `npx remotion render Root <CompositionID> out.mp4`

## Prompting Guide for Animations (The "Claude Code" Way)

When asking the agent to create animations, use this structured approach:

**1. Scene Setup & Dimensions**
*   "Create a composition 1080x1920 (Vertical) or 1920x1080 (Landscape)."
*   "Use a dark theme background."

**2. Component Description (Structured)**
*   **Terminal**: "Mac-style window, 3 buttons, blinking cursor, monospaced font."
*   **Browser**: "Address bar at top, shadow, rounded corners."
*   **Phone**: "Bezel, notch, screen content inside."

**3. Animation Specifications (Be Specific)**
*   **Entrance**: "Slide from bottom (spring damping: 12), fade in opacity 0->1."
*   **Idle**: "Rotate Y axis slightly (Sine wave, +/- 5 deg)."
*   **Action**: "Type text 'Hello World' one char every 3 frames."
*   **Exit**: "Zoom out and fly screen right."

**4. 3D & Depth**
*   "Use `z-transform` for depth."
*   "Rotate X 15deg to give perspective."

## Code Patterns & Best Practices

### Animation Rules
- **Frame-Driven**: Always derive values from `useCurrentFrame()` and `useVideoConfig()`.
- **NO SIDE EFFECTS**: Do not use CSS animations, `setTimeout`, or `requestAnimationFrame`.
- **Interpolation**: Use `interpolate()` with `extrapolateRight: "clamp"` to prevent values from exceeding bounds.
- **Springs**: Use `spring()` for natural motion. Map the 0-1 output to properties using `interpolate()`.

### Layout & Sequencing
- **Sequences**: Use `<Sequence>` with `from` and `durationInFrames`.
- **Series**: Use `<Series>` for consecutive segments. Use `<Series.Step>` or negative `offset` for overlaps.
- **Transitions**: Use `<TransitionSeries>` from `@remotion/transitions` for fullscreen scene changes.
- **Asset Loading**: Always use `staticFile('path/to/asset')` for files in the `public/` folder.

## Essential Code Snippets

**Interpolation:**
```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: "clamp",
});
```

**Advanced Springs:**
```tsx
const { fps } = useVideoConfig();
const frame = useCurrentFrame();
const scale = spring({
  frame,
  fps,
  config: { damping: 12, stiffness: 100, mass: 1 },
  durationInFrames: 30, // Stretch/compress the spring
});
const mappedScale = interpolate(scale, [0, 1], [0.8, 1]);
```

**Sequencing & Series:**
```tsx
<Series>
  <Series.Step durationInFrames={30}>
    <Intro />
  </Series.Step>
  <Series.Step durationInFrames={60}>
    <MainContent />
  </Series.Step>
</Series>
```

**Asset Management:**
```tsx
import { staticFile, Audio, Video, Img } from "remotion";

const MyComponent = () => (
  <>
    <Audio src={staticFile("bg-music.mp3")} />
    <Video src={staticFile("overlay.mp4")} />
    <Img src={staticFile("logo.png")} />
  </>
);
```
