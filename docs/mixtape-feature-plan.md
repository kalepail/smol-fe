# Mixtape Feature Planning

## Goals
- Let users collect multiple Smols into a mixtape that can be assembled anywhere in the app (home, created, liked, etc.).
- Provide an immersive "Mixtape Mode" experience with a persistent builder that floats above all views.
- Support draft persistence (local storage) and a publish flow that will later integrate with backend APIs.
- Introduce dedicated surfaces for browsing and viewing mixtapes.

## Key User Flows
1. **Enter Mixtape Mode**
   - New `+ Mixtape` button in the global header toggles the interface into Mixtape Mode.
   - Header highlights active mode; existing `+ Create` flow remains available outside of Mixtape Mode.
2. **Assemble Mixtape**
   - Floating sticky footer modal ("Mixtape Builder") appears across the app.
   - Users drag or tap Smols to add them to the builder list; duplicates blocked.
   - Builder allows reordering, removal, title & description editing.
3. **Persist Draft**
   - Builder autosaves to local storage (ordered Smol IDs, title, description, mixtape temp ID).
   - Exiting Mixtape Mode prompts to keep draft or discard it.
4. **Publish / Save**
   - `Save Draft` keeps data locally (and later via API when available).
   - `Publish` validates input, calls publish stub, clears draft, generates shareable Mixtape ID.
5. **Browse Mixtapes**
   - New `pages/mixtapes/index` lists mixtapes with large cards (thumbnail grid, title, truncated description, `Play All`).
6. **View Mixtape Detail**
   - `pages/mixtapes/[id]` shows full mixtape info, Smol list, `Play All`, stubbed `Purchase` CTA.

## Information Architecture
- **Routes**
  - `/` (existing) surfaces Mixtape Mode overlay when active.
  - `/mixtapes` new index page.
  - `/mixtapes/[id]` new detail page.
- **Shared UI**
  - Global header gains Mixtape toggle indicator.
  - Footer modal overlays use portal to avoid layout constraints.

## State & Data Model
- `MixtapeDraft` shape:
  ```ts
  type MixtapeDraft = {
    draftId: string;          // uuid generated on first entry
    title: string;
    description: string;
    smolIds: string[];        // ordered selection
    updatedAt: string;
  };
  ```
- Stores:
  - `mixtapeModeStore`: holds mode status, current draft reference.
  - `mixtapeDraftStore`: writable store with above shape, syncs to local storage.
  - Expose derived helpers for derived counts, validation state, etc.
- Local storage key: `smol-mixtape-draft-${draftId}`; holds serialized `MixtapeDraft`.
- Publishing returns `MixtapePublished` stub containing `mixtapeId` for routing.

## Component Plan
- **HeaderMixtapeToggle** (existing header update)
  - Adds `+ Mixtape` button.
  - Shows active-state pill when Mixtape Mode engaged.
- **MixtapeBuilderOverlay.svelte**
  - Portal-based sticky footer (positioned fixed; responsive adjustments for mobile vs desktop).
  - Sections: header (title, close), track list (reorderable), metadata inputs, actions area (`Save Draft`, `Publish`).
  - Drag-and-drop: reuse existing drag utilities if available; otherwise integrate with `@dnd-kit` equivalent already in project or implement pointer-based sorting.
- **MixtapeTrackListItem.svelte**
  - Displays Smol thumbnail, title, creator.
  - Handles reorder handle + remove button.
- **MixtapeDropTarget** (optional enhancement)
  - Visual affordance around Smol cards to suggest add-on drag.
- **MixtapeCardsGrid.svelte** (for `/mixtapes`)
  - Card layout featuring up to 4 smol thumbnails, meta content, CTA buttons.
- **MixtapeDetailView.svelte** (for `/mixtapes/[id]`)
  - Hero section with cover mosaic, title, description, creator data.
  - Smol list reuses existing `SmolList` component if available; otherwise create variant.
  - Actions: `Play All`, `Purchase` (disabled/stub), share copy.

## UX & Interaction Notes
- Mixtape Mode blocks other creation flows; attempt to start conflicting flows prompts confirmation.
- Builder overlay must be accessible: focus trap, ESC to exit, keyboard reordering fallback.
- Provide inline `n Smols selected` counter, warn if builder empty on publish.
- Title/description have character limits with live counts.
- Drag-add flow: add drop target highlight to all Smol cards; clicking the `+` icon also adds.
- Reordering uses keyboard accessible controls: up/down buttons.
- Mobile: overlay becomes full-height sheet with collapsible sections.

## Persistence & Draft Lifecycle
- Autosave on every change with debounce to limit writes.
- On Mixtape Mode entry, check for latest draft; offer to resume or start new.
- When publishing succeeds, clear local storage for that draft ID and exit Mixtape Mode.
- Cancel Mixtape Mode prompts to discard draft (removes local storage) or keep for later.

## API Integration Stubs
- Add `publishMixtape` stub in `utils/api/mixtapes.ts` returning mocked response with `mixtapeId` (UUID).
- Add `loadMixtapeDrafts` helper to read from local storage (for potential multi-draft support later).
- Detail view fetches placeholder data via stubbed loader; shape matches future backend contract.

## View Mixtape Surface
- `/mixtapes` uses static sample data until backend ready; integrate `loadMixtapes` stub.
- Each card links to `/mixtapes/[id]`.
- `Play All` triggers existing audio queue with playlist of Smol IDs.
- Detail page adds `Buy Mixtape` button that currently shows a toast "Coming soon".

## Technical Considerations
- Evaluate existing store patterns (`src/store`) to stay consistent.
- Confirm availability of drag utilities; introduce new dependency only if necessary.
- Ensure overlay does not interfere with existing page scroll; use body scroll lock when builder expanded on mobile.
- Provide tests: component unit tests for draft store and builder interactions (if testing infra available).
- Theming: follow Tailwind tokens defined in `src/styles`.

## Open Questions / Needs Review
- Should users manage multiple drafts simultaneously or just one active draft?
- Do we limit mixtape length (max Smols) or duration? Need product direction.
- Should `Play All` respect current queue or replace it? Clarify with audio team.
- Does published mixtape belong to creator profile page? (Assumed yes; to confirm.)
- Need final iconography for `+ Mixtape` and overlay visuals.

