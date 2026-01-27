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

## Code Patterns

**Interpolation:**
```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: "clamp",
});
```

**Springs:**
```tsx
const { fps } = useVideoConfig();
const scale = spring({
  frame,
  fps,
  config: { damping: 200 },
});
```

**Sequencing:**
Use `<Sequence>` to time events:
```tsx
<Sequence from={0} durationInFrames={60}>
  <Intro />
</Sequence>
<Sequence from={60}>
  <MainContent />
</Sequence>
```
