---
name: project-standards
description: Frontend and styling conventions for Smol FE. Use when writing new components or pages to ensure consistency.
---

# Project Standards Skill

Follow these conventions when developing for Smol FE.

## 1. Typography 🔡
- **Pixel Font**: Use `font-pixel` for all text in the Labs and Arcade sections.
- **Headers**: `text-4xl` or `text-8xl` for main titles.
- **Colors**:
  - Primary Text: `#9ae600` (Terminal Green)
  - Accent: `#ff424c` (Labs Red)
  - Warning: `#FDDA24` (Biohazard Yellow)

## 2. API & Data Fetching 📡
- **RPC Calls**: ALWAYS use `src/utils/rpc.ts`. Do NOT use `PUBLIC_RPC_URL` directly.
- **Large Data**: Use client-side fetching (`onMount`) for heavy JSON snapshots.
  - Pattern: `let data = [];` -> `onMount(async () => { data = await fetch(...); });`
  - Avoid `Astro.props` for large datasets to prevent build-time OOMs.

## 3. Component Structure 🧩
- **Svelte**: Preferred for interactive components (games, tools).
- **Astro**: Preferred for static pages and layouts.
- **Imports**: Use standard imports. Avoid custom element hydration unless absolutely necessary.

## 4. Troubleshooting 🔧
- **"client:only" Error**: Ensure the component name matches the import.
- **Build Hangs**: Check if large data files are being loaded in the frontmatter of `.astro` files. Move to client-side fetch.
