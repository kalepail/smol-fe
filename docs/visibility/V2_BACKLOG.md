# AEO/GEO v2 Backlog

**Strategy:** execute minimal, high-impact PRs to move from "Checking the box" to "Grade A Identity".

## PR-01: Activate Freshness Engine (RSS)
**Theme:** Feeds & Freshness
**Problem:** `rss.xml.ts` is currently a skeleton returning 0 items.
**Changes:**
- Update `src/pages/rss.xml.ts` to fetch actual "Recent Songs" from `api.smol.xyz/rss` (or similar endpoint) OR reading the `public/data/GalacticSnapshot.json` if available server-side.
- *Note:* If API fetch fails during build, fallback to Snapshot data.
**Acceptance:**
- Visiting `/rss.xml` returns valid XML with >10 recent items.
- Items have `pubDate`, `link`, `title` (Song Name), `description` (Prompt).

## PR-02: Definitive Entity Identity (Schema)
**Theme:** Knowledge Graph & Credibility
**Problem:** Organization schema is fragmented and ID-only.
**Changes:**
- Create `src/utils/seo-schema.ts` export for `SMOL_ORGANIZATION`.
- Include: `name`, `url`, `logo`, `sameAs` (Twitter, GitHub, Docs), `foundingDate`.
- Inject this into `Layout.astro` (global WebSite context) and `about.astro`.
**Acceptance:**
- Google Rich Results Test shows valid `Organization` with all fields.

## PR-03: Store Product Data
**Theme:** Commercial Intent / AEO
**Problem:** Store items (Kale Badge, Premium) are purely visual.
**Changes:**
- Add `Product` JSON-LD to `src/pages/store.astro`.
- Define products: "Premium Profile Header", "Golden Kale Badge", "Vibe Matrix".
- Properties: `name`, `description`, `price` (in KALE/XLM text or `priceSpecification`), `image`.
**Acceptance:**
- Schema validator detects 3+ Product entities.

## PR-04: LLMs.txt & Sitemap Polish
**Theme:** Machine Readability
**Problem:** `llms.txt` has stale links.
**Changes:**
- Manually update `public/llms.txt` with:
    - Correct "Recent Examples" (grab 2-3 new fresh IDs).
    - Clearer "Last Updated" date.
    - Explicit link to `/rss.xml`.
**Acceptance:**
- `llms.txt` links are 200 OK and content is fresh.

## PR-05: Song Schema Actions
**Theme:** Rich Results
**Problem:** Song pages describe the song but don't say you can "Play" or "Buy" it.
**Changes:**
- Update `src/pages/[id].astro` schema.
- Add `potentialAction`: `ListenAction`.
- Add `offers`: `Offer` (Mint Price: ~0.01 XLM).
**Acceptance:**
- Schema validator shows Action and Offer.

## PR-06: Measurement v2 (Bonus)
**Theme:** Analytics
**Changes:** Updated `Layout.astro` to track `searchgpt.com`, `deepseek.com` referrers.

## PR-07/08: Navigation Hierarchy (Bonus)
**Theme:** Structure
**Changes:** Added `BreadcrumbList` to `artists.astro` and `tags.astro`.

## PR-09: Accessible Content (Bonus)
**Theme:** Crawlability
## PR-10: Deep Sitemap (Round 3)
**Theme:** Indexing
**Changes:** Create `src/pages/sitemap-songs.xml.ts` to dynamically list top 5000 songs from snapshot. Add to `robots.txt`.

## PR-11: Smol Hero Game Schema (Round 3)
**Theme:** Rich Results
**Changes:** Add `SoftwareApplication` / `VideoGame` schema to `src/pages/labs/smol-hero.astro`.

## PR-12: Mixtape Collection Schema (Round 3)
**Theme:** Structure
**Changes:** Add `CollectionPage` with `hasPart` to `src/pages/mixtapes/[id].astro`.

## PR-13: Web Vitals Polish (Round 3)
**Theme:** Performance
## PR-14: Artist Entity Upgrade (Round 4)
**Theme:** Entity Graph
**Changes:** Upgrade `artist/[address].astro` to `ProfilePage` with `mainEntity` as `Person`.

## PR-15: Visualizer Video Schema (Round 4)
**Theme:** Video Search
**Changes:** Add `VideoObject` to `[id].astro` to claim the visualizer as video content.

## PR-16: Agentic API Spec (Round 4)
**Theme:** Agentic SEO
**Changes:** Create `public/openapi.yaml` to document read-only endpoints for AI agents.
