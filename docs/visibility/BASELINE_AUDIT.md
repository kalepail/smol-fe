<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](../STATE_OF_WORLD.md)
- AUDIENCE: Dev, Marketing
- NATURE: Baseline
- LAST_HARDENED: 2026-02-19
- VERIFICATION_METHOD: [Claim check]
-->
# SEO + GEO Baseline Audit
**Site:** https://noot.smol.xyz
**Framework:** Astro 5.14.1 (SSR) + Svelte 5
**Deployment:** Cloudflare Pages
**Audit Date:** 2026-01-19

## Executive Summary

**Smol** is an AI music generation platform where users create songs from text prompts, mint them as NFTs on Stellar blockchain, and organize them into mixtapes. The site has a **solid SEO foundation** with SSR, schema.org markup, and proper canonicals, but has **significant GEO gaps** (no /llms.txt, no FAQ content, missing freshness signals, no AI referrer tracking).

**GEO Readiness Score: 8/16** (see detailed scoring below)

---

## 1. Tech Stack Discovery

### Framework & Build
- **Astro 5.14.1** with `output: 'server'` (full SSR)
- **Svelte 5** for UI components (client:only, client:load)
- **Cloudflare adapter** (@astrojs/cloudflare)
- **Tailwind CSS 4** via Vite plugin
- **@astrojs/sitemap** integration enabled
- **Site URL:** `https://noot.smol.xyz` (astro.config.mjs:13)

### Route Inventory
**Total Pages:** 25 .astro files + 7 API routes

**Key Public Routes:**
- `/` — Home feed (latest songs)
- `/[id]` — Song detail pages (dynamic, SSR with MusicRecording schema)
- `/create` — Song generation interface
- `/artist/[address]` — Artist profile pages (dynamic, SSR)
- `/mixtapes` — Mixtape index
- `/mixtapes/[id]` — Mixtape detail pages
- `/tags` — Browse by genre tags
- `/radio` — AI Radio feature
- `/labs/*` — Experimental features (smol-hero, quiz, roulette, etc.)
- `/account` — User account (noindex via robots.txt)
- `/settings` — Settings (noindex via robots.txt)

**API Routes (properly disallowed in robots.txt):**
- `/api/ai/commentary`
- `/api/artist/badges/[address]`
- `/api/audio/[id]`
- `/api/radio/ai`
- `/api/swap/quote`

### Rendering Strategy
✅ **Server-rendered:** /, /[id], /artist/[address], /mixtapes pages fetch data server-side for SEO
✅ **Dynamic meta tags:** Song and artist pages populate title, description, og:image, og:audio from API
⚠️ **Client-only components:** Some content loads client-side (SmolResults, ArtistResults) — search engines see minimal SSR content beyond meta tags

---

## 2. Current SEO Infrastructure

### ✅ Strengths

#### Crawl & Index Hygiene
- **robots.txt:** Well-configured, disallows `/api/`, `/auth/`, `/account/`, `/settings/`, `/create/`, `/admin/`, and tracking params (`utm_*`, `ref=`)
- **Sitemap:** Configured via @astrojs/sitemap, references `https://noot.smol.xyz/sitemap-index.xml`
- **Canonical URLs:** Implemented via `buildCanonical()` (src/lib/seo.ts:11-25), strips tracking params
- **Robots meta:** Dynamic via `robotsMetaForUrl()` (src/lib/seo.ts:27-34), noindex pages with non-whitelisted query params

#### Metadata & Social
- **Unique titles:** Page-specific titles on song/artist pages (e.g., song title, artist address)
- **Descriptions:** Dynamic on song pages (`{prompt} | Made with Smol AI Music Generator`)
- **OpenGraph:** og:title, og:description, og:type (music.song), og:image, og:audio, og:site_name
- **Twitter Cards:** `player` card for songs with audio, `summary_large_image` otherwise
- **Keywords meta:** Present in Layout.astro:110 ("AI music generator, AI songs, create music with AI, onchain music, crypto music, text to song, AI mixtape, Suno AI alternative, Udio alternative, make AI music")
- **PWA manifest:** /manifest.json with app name, icons, theme colors

#### Structured Data (Schema.org)
**Global schemas (all pages):**
- ✅ **Organization** (Layout.astro:48-60): name, url, logo, sameAs (Twitter, GitHub)
- ✅ **WebSite** (Layout.astro:61-72): SearchAction (target: `/search?q={search_term_string}`)
- ✅ **WebApplication** (Layout.astro:73-83): applicationCategory, operatingSystem, description

**Page-specific schemas:**
- ✅ **MusicRecording** (song pages, [id].astro:58-79): name, url, description, datePublished, image, audio, genre, inLanguage, isAccessibleForFree, producer
- ✅ **BreadcrumbList** (song pages, [id].astro:80-88): Home → Songs → [Song Title]

#### Performance & Rendering
- ✅ SSR on all routes (Cloudflare Pages)
- ✅ Cloudflare CDN for global distribution
- ✅ Image optimization (API serves images at `/api/image/{id}.png?scale=16`)
- ⚠️ Client-only Svelte components may delay content visibility for crawlers

---

### ❌ Critical Gaps (High Impact)

#### 1. GEO: Missing /llms.txt
**Impact:** 🔴 **HIGH** — LLMs cannot discover the "right" pages efficiently
**What's missing:** No `/llms.txt` or `/llms-full.txt` to guide AI crawlers to canonical content
**Fix:** Create `/public/llms.txt` with prioritized list of key pages (/, /create, /tags, /radio, example songs, artist pages, mixtapes)

#### 2. AEO: No FAQ / Q&A Content
**Impact:** 🔴 **HIGH** — AI engines can't extract direct answers
**What's missing:** No "What is Smol?", "How does it work?", "Pricing/limits", "How to get started" sections
**Fix:** Add FAQ section to homepage or dedicated /about page with clear Q&A blocks

#### 3. Entity Clarity: No About / How It Works Page
**Impact:** 🔴 **HIGH** — Weak brand entity signals for "What is Smol?" queries
**What's missing:** No comprehensive "About" page explaining product, team, mission, differentiators
**Fix:** Create /about page with Organization schema, AboutPage type, clear descriptions

#### 4. Freshness Signals: No "Last Updated" Dates
**Impact:** 🟡 **MEDIUM** — AI engines can't assess content freshness
**What's missing:** No visible or schema-based `dateModified` on dynamic content (songs, mixtapes)
**Fix:** Add `dateModified` to MusicRecording schema, display "Created on [date]" on song pages

#### 5. GEO: No RSS/Atom Feed
**Impact:** 🟡 **MEDIUM** — One of the "three data pathways" (feeds) is missing
**What's missing:** No /feed.xml or /rss.xml for new songs, mixtapes, or blog updates
**Fix:** Create RSS feed for latest public songs (limit to 50 most recent)

#### 6. GEO: No AI Referrer Tracking
**Impact:** 🟡 **MEDIUM** — Can't measure visibility in AI engines
**What's missing:** No analytics tagging for chatgpt.com, perplexity.ai, bing.com referrers
**Fix:** Add referrer tracking in analytics (src/lib/analytics.ts)

#### 7. Content Architecture: No Hub/Spoke Topic Clusters
**Impact:** 🟡 **MEDIUM** — Weak internal semantic linking
**What's missing:** No pillar pages for "AI Music", "NFT Music", "How to Create AI Music", "Stellar Blockchain Music"
**Fix:** Create topic cluster pages with internal links to related content

#### 8. Comparison Content: No "Smol vs Suno" or Alternatives Pages
**Impact:** 🟡 **MEDIUM** — Missing high-intent comparison queries
**What's missing:** No pages targeting "Smol vs Suno", "Smol vs Udio", "Best AI music generator"
**Fix:** Create /alternatives page and comparison pages

---

### ⚠️ Medium Priority Gaps

#### 9. Schemas: Missing ItemList for Collection Pages
**Impact:** 🟡 **MEDIUM**
**What's missing:** No ItemList schema on `/mixtapes`, `/tags`, artist discography pages
**Fix:** Add ItemList + ListItem schemas to collection pages

#### 10. Schemas: Missing schemas for Artist, Mixtape pages
**Impact:** 🟡 **MEDIUM**
**What's missing:** Artist pages have no MusicGroup/Person schema, mixtape pages have no MusicPlaylist schema
**Fix:** Add Person/MusicGroup schema to artist pages, MusicPlaylist to mixtape pages

#### 11. Metadata: Thin descriptions on some pages
**Impact:** 🟡 **MEDIUM**
**What's missing:** Pages like `/create`, `/mixtapes`, `/tags` use generic default description
**Example:** `/create` just says "Smol – Create" with no description
**Fix:** Add unique, keyword-rich descriptions to all pages

#### 12. Performance: No preload for critical assets
**Impact:** 🟡 **MEDIUM**
**What's missing:** No `<link rel="preload">` for critical fonts, CSS, or images
**Fix:** Add preload tags for above-the-fold assets

#### 13. Content: No Use-Case / Tutorial Pages
**Impact:** 🟡 **MEDIUM**
**What's missing:** No "How to create a song", "How to mint an NFT", "How to create a mixtape" guides
**Fix:** Create HowTo schema pages for key workflows

---

### ✅ Low Priority / Nice-to-Have

#### 14. hreflang tags (if multi-language support planned)
**Impact:** 🟢 **LOW**
**Status:** Not applicable (English-only site)

#### 15. Trailing slash consistency
**Impact:** 🟢 **LOW**
**Status:** Canonicals handle this, but could enforce via middleware

#### 16. Structured data for reviews/ratings
**Impact:** 🟢 **LOW**
**Status:** No user reviews visible on site (skip unless real reviews exist)

---

## 3. GEO Readiness Checklist

Score each 0–2 (0 = missing, 1 = partial, 2 = complete). **Total: 8/16**

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Entity clarity** | 1/2 | Organization schema present, but no About page |
| **Content clarity** | 0/2 | No FAQ, no Q&A blocks, no direct answers |
| **Completeness** | 1/2 | MusicRecording has key fields, but missing dates, artist schemas |
| **Freshness** | 0/2 | No dateModified, no last-updated signals |
| **Accessibility** | 1/2 | SSR present but client-only components delay content |
| **Reliability** | 2/2 | Core flows work (play, create, mint), no broken UX |
| **Machine readability** | 1/2 | Sitemap + schema present, but no /llms.txt, no RSS |
| **Authority** | 2/2 | Real product, functional NFT minting, deep docs in repo |

**Total: 8/16 (50%)**

---

## 4. Performance Baseline

### Key Metrics (estimated, requires Lighthouse audit)
- **LCP:** Likely 2-3s (client-only Svelte components delay paint)
- **CLS:** Likely good (fixed layouts)
- **INP:** Likely good (Svelte 5 reactive model)
- **Bundle size:** Unknown (requires build analysis)
- **Render-blocking:** Tailwind CSS loaded via Vite, likely optimized

### Performance Quick Wins
1. Add `<link rel="preload">` for critical fonts
2. Ensure above-the-fold content is SSR (not client:only)
3. Add `loading="lazy"` to below-the-fold images
4. Consider extracting critical CSS for LCP

---

## 5. Indexability Matrix

| Page Type | Example | Indexable? | Canonical? | Meta? | Schema? | Internal Links? |
|-----------|---------|------------|------------|-------|---------|-----------------|
| Home | `/` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Org, WebSite, WebApp | ⚠️ Limited |
| Song Detail | `/491bb94b-...` | ✅ Yes | ✅ Yes | ✅ Yes | ✅ MusicRecording, Breadcrumbs | ⚠️ Limited |
| Artist Profile | `/artist/GCXYZ...` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |
| Mixtape Index | `/mixtapes` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |
| Mixtape Detail | `/mixtapes/[id]` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |
| Create | `/create` | ❌ Disallowed (robots.txt) | ✅ Yes | ⚠️ Generic | ✅ WebApp | N/A |
| Tags | `/tags` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |
| Radio | `/radio` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |
| Labs | `/labs/smol-hero` | ✅ Yes | ✅ Yes | ⚠️ Generic | ❌ No schema | ⚠️ Limited |

**Key Issues:**
- ❌ **Generic descriptions** on most pages except song detail
- ❌ **Missing schemas** on artist, mixtape, tags, radio pages
- ⚠️ **Weak internal linking** between content (no hub/spoke structure)

---

## 6. Prioritized Backlog (Top 20 Issues by Impact × Effort)

### 🔥 **Tier 1: Critical Quick Wins (Do First)**

| # | Issue | Impact | Effort | Priority | Phase |
|---|-------|--------|--------|----------|-------|
| 1 | **Create /llms.txt** | 🔴 HIGH | 🟢 LOW | **P0** | Phase 4 (GEO) |
| 2 | **Add FAQ section to homepage or /about** | 🔴 HIGH | 🟡 MED | **P0** | Phase 3 (AEO) |
| 3 | **Create /about page with AboutPage schema** | 🔴 HIGH | 🟡 MED | **P0** | Phase 2 (Entity) |
| 4 | **Add unique descriptions to all pages** | 🟡 MED | 🟢 LOW | **P1** | Phase 1 (Meta) |
| 5 | **Add RSS feed for latest songs** | 🟡 MED | 🟡 MED | **P1** | Phase 4 (GEO) |

### 🚀 **Tier 2: High-Value Improvements**

| # | Issue | Impact | Effort | Priority | Phase |
|---|-------|--------|--------|----------|-------|
| 6 | **Add MusicPlaylist schema to mixtape pages** | 🟡 MED | 🟢 LOW | **P1** | Phase 2 (Schema) |
| 7 | **Add Person/MusicGroup schema to artist pages** | 🟡 MED | 🟢 LOW | **P1** | Phase 2 (Schema) |
| 8 | **Add ItemList schema to collection pages** | 🟡 MED | 🟢 LOW | **P1** | Phase 2 (Schema) |
| 9 | **Add dateModified to song schemas** | 🟡 MED | 🟢 LOW | **P1** | Phase 2 (Freshness) |
| 10 | **Add AI referrer tracking** | 🟡 MED | 🟢 LOW | **P1** | Phase 5 (Analytics) |

### 📈 **Tier 3: Content & Architecture**

| # | Issue | Impact | Effort | Priority | Phase |
|---|-------|--------|--------|----------|-------|
| 11 | **Create /how-it-works page with HowTo schema** | 🟡 MED | 🟡 MED | **P2** | Phase 3 (AEO) |
| 12 | **Create /alternatives comparison page** | 🟡 MED | 🟡 MED | **P2** | Phase 3 (AEO) |
| 13 | **Build topic clusters (AI Music hub page)** | 🟡 MED | 🔴 HIGH | **P2** | Phase 3 (AEO) |
| 14 | **Add "How to" guides for key workflows** | 🟡 MED | 🔴 HIGH | **P2** | Phase 3 (AEO) |
| 15 | **Improve internal linking (hub/spoke)** | 🟡 MED | 🟡 MED | **P2** | Phase 3 (AEO) |

### ⚡ **Tier 4: Performance & Polish**

| # | Issue | Impact | Effort | Priority | Phase |
|---|-------|--------|--------|----------|-------|
| 16 | **Add preload for critical assets** | 🟡 MED | 🟢 LOW | **P2** | Phase 1 (Perf) |
| 17 | **Ensure above-fold content is SSR** | 🟡 MED | 🟡 MED | **P2** | Phase 1 (Perf) |
| 18 | **Add loading="lazy" to images** | 🟢 LOW | 🟢 LOW | **P3** | Phase 1 (Perf) |
| 19 | **Create Status/Reliability page** | 🟢 LOW | 🟡 MED | **P3** | Phase 4 (GEO) |
| 20 | **Document offsite signals (OFFSITE_SIGNALS.md)** | 🟢 LOW | 🟢 LOW | **P3** | Phase 4 (GEO) |

---

## 7. Recommended PR Sequence

### **Phase 1: Technical SEO Foundation (PRs #1-3)**
- **PR #1:** Crawlability + Index Hygiene (validate sitemap, fix any redirect chains, ensure canonical consistency)
- **PR #2:** Metadata + Social/Share Basics (unique descriptions for all pages, improve OG/Twitter cards)
- **PR #3:** Performance + Rendering (preload critical assets, optimize LCP, ensure SSR for key content)

### **Phase 2: Structured Data + Entity Clarity (PRs #4-6)**
- **PR #4:** Organization/Brand Entity Layer (create /about page, enhance Organization schema with contactPoint)
- **PR #5:** Page-type Schemas (MusicPlaylist for mixtapes, Person/MusicGroup for artists, ItemList for collections)
- **PR #6:** Completeness + Freshness (add dateModified, display creation dates, ensure all schema fields populated)

### **Phase 3: AEO - Answer Engine Optimization (PRs #7-9)**
- **PR #7:** Q&A Blocks (FAQ section on homepage, "What is Smol?", "How does it work?", "Pricing/limits")
- **PR #8:** Topic Clusters + Internal Links (create /how-it-works, /use-cases, improve semantic linking)
- **PR #9:** Comparison / Alternatives (create /alternatives, "Smol vs Suno", "Best AI music generator" pages)

### **Phase 4: GEO - Generative Engine Optimization (PRs #10-12)**
- **PR #10:** /llms.txt + /llms-full.txt (curated list of canonical pages for LLMs)
- **PR #11:** Reliability Pass (verify all flows work, add /status page if needed)
- **PR #12:** Feeds + Offsite Signals (RSS feed for latest songs, OFFSITE_SIGNALS.md checklist, update sameAs links)

### **Phase 5: Measurement + Iteration (PR #13)**
- **PR #13:** Analytics + Benchmarking (AI referrer tracking, create AI Visibility Benchmark sheet, Citations logging)

### **Phase 6: Documentation**
- **Final Deliverable:** VISIBILITY_PLAYBOOK.md (what we did, how to maintain, content templates, release checklist)

---

## 8. Next Steps

1. ✅ **Phase 0 Complete:** Discovery + Baseline Audit (this document)
2. ⏭️ **Begin Phase 1:** Start with PR #1 (Crawlability + Index Hygiene)
3. 📋 **Review backlog with team:** Prioritize based on business goals (traffic vs. conversions vs. AI visibility)
4. 🚀 **Execute PR-by-PR:** Small, reviewable changes with clear verification steps

---

## Appendix: Key File Locations

### SEO Infrastructure
- **Layout:** `src/layouts/Layout.astro` (global meta, schema, OG tags)
- **SEO utils:** `src/lib/seo.ts` (canonical, robots meta, JSON-LD helper)
- **robots.txt:** `public/robots.txt`
- **Sitemap config:** `astro.config.mjs` (line 15, `sitemap()` integration)
- **Manifest:** `public/manifest.json`

### Key Pages
- **Home:** `src/pages/index.astro`
- **Song Detail:** `src/pages/[id].astro` (MusicRecording schema)
- **Artist Profile:** `src/pages/artist/[address].astro` (needs schema)
- **Mixtape Index:** `src/pages/mixtapes/index.astro` (needs schema)
- **Mixtape Detail:** `src/pages/mixtapes/[id].astro` (needs schema)
- **Create:** `src/pages/create.astro` (disallowed in robots.txt)

---

**End of Baseline Audit**
