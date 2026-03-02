---
name: astro
description: Comprehensive guide for developing with the Astro web framework, including component architecture, routing, and deployment.
---

# Astro Framework Skill

Use this skill when developing, refactoring, or architecting applications using Astro.

## Core Concepts

### 1. Component Architecture
- **Astro Components (`.astro`)**: Zero-client-side JS by default. Components are processed at build time.
- **Island Architecture**: Hydrate interactive UI (Svelte, React, Vue) only when needed using `client:load`, `client:visible`, etc.
- **Content Collections**: Type-safe Markdown/MDX management via `src/content/config.ts`.

### 2. Routing & Pages
- **File-based Routing**: Any file in `src/pages/` becomes a route.
- **Dynamic Routes**: Use `[id].astro` and export `getStaticPaths()` for SSG, or use SSR mode.
- **Middleware**: Use `src/middleware.ts` for auth, logging, and request/response manipulation.

## CLI & Workflow
- `npx astro dev`: Start local development server.
- `npx astro build`: Build production site.
- `npx astro check`: Run type-checking and diagnostics.
- `npx astro add <integration>`: Add official or community integrations (e.g., `svelte`, `tailwind`).
- `npx astro sync`: Generate TypeScript types for content collections and configurations.

## Best Practices
- **Prefer SSG**: Build for performance whenever possible.
- **Optimize Assets**: Use `<Image />` component for automatic optimization.
- **Styling**: Prefer Tailwind or scoped CSS within `.astro` components.
- **SSR Optimization**: For Cloudflare/Edge deployments, keep dependencies lean to minimize bundle size.

## Project Structure
```
src/
├── components/   # Reusable UI components
├── layouts/      # Base HTML templates
├── pages/        # Route files (required)
├── content/      # Markdown/Data collections
└── middleware.ts # Auth/Request logic
```
