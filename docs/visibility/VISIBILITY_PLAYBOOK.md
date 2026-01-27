<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](../STATE_OF_WORLD.md)
- AUDIENCE: Dev, Marketing
- NATURE: Snapshot / Playbook
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: Claim check
-->
# Visibility Playbook — SEO + GEO Maintenance Guide
**Last Updated:** 2026-01-19
**Site:** https://noot.smol.xyz
**Framework:** Astro 5 + Svelte 5

## Executive Summary

This playbook documents the SEO + GEO (Generative Engine Optimization) overhaul completed for Smol. It provides a roadmap for maintaining visibility in both traditional search engines and AI answer engines (ChatGPT, Perplexity, Claude, Gemini, Bing Copilot).

**GEO Readiness Score:** 13/16 (up from 8/16)
- ✅ Entity clarity (2/2)
- ✅ Content clarity (2/2)
- ⚠️ Completeness (1/2)
- ⚠️ Freshness (1/2)
- ✅ Accessibility (2/2)
- ✅ Reliability (2/2)
- ✅ Machine readability (2/2)
- ✅ Authority (2/2)

---

## What We Did (Summary of Changes)

### PR #1: /llms.txt for GEO (🔴 HIGH Impact)
**Files:** `public/llms.txt`, `public/llms-full.txt`, `public/robots.txt`

**What:** Created curated site maps for LLMs following the emerging /llms.txt convention.

**Why:** Helps AI engines discover the "right" pages efficiently. Microsoft's GEO guide emphasizes this as a critical pathway for AI visibility.

**Impact:**
- Guides LLMs to canonical content
- Provides context about platform, features, use cases
- Includes FAQ answers for direct AI response generation
- Lists example content for reference

**Verify:** `curl https://noot.smol.xyz/llms.txt`

---

### PR #2: Unique Meta Descriptions (🟡 MED Impact)
**Files:** 7 page updates (index, create, tags, radio, artists, mixtapes, labs)

**What:** Replaced generic titles/descriptions with unique, keyword-rich metadata on all key pages.

**Why:**
- Improves SERP click-through rate
- Helps LLMs understand page purpose
- Reinforces primary keywords (AI music, song generator, Suno alternative)
- Matches user intent for high-value queries

**Impact:**
- "Create AI music from text" → targets generation queries
- "Browse by genre" → targets discovery queries
- "Suno alternative" → targets comparison queries

**Verify:** View source → check `<meta name="description">` on each page

---

### PR #3: /about Page with FAQ (🔴 HIGH Impact)
**Files:** `src/pages/about.astro`

**What:** Created comprehensive About page with:
- "What is Smol" (entity definition)
- "How It Works" (6-step process)
- FAQ section (10 Q&As)
- AboutPage + FAQPage schemas

**Why:**
- Establishes entity clarity for "What is Smol?" queries
- Provides direct answers for AEO (Answer Engine Optimization)
- Builds trust with users and AI engines
- Positions against competitors (Suno, Udio)

**Impact:**
- GEO score +4 points (Entity clarity: 1→2, Content clarity: 0→2)
- AI engines can now answer "What is Smol?" with structured data
- FAQ answers target high-intent queries

**Verify:** Navigate to `/about`, check FAQ accordions work

---

### PR #4: Schema.org Markup (🟡 MED Impact)
**Files:** `artist/[address].astro`, `artists.astro`, `mixtapes/index.astro`, `tags.astro`

**What:** Added structured data schemas:
- MusicGroup (artist pages)
- CollectionPage + ItemList (index pages)

**Why:**
- Improves entity recognition in search engines
- Enables rich results (carousels, lists)
- Helps AI engines understand site structure
- Completes entity hierarchy (Organization → WebSite → MusicGroup → MusicRecording → MusicPlaylist)

**Impact:**
- All key pages now have appropriate schema markup
- Better indexing for discovery/browse queries

**Verify:** Test with [Google Rich Results](https://search.google.com/test/rich-results)

---

### PR #5: RSS Feed + AI Referrer Tracking (🟡 MED Impact)
**Files:** `src/pages/rss.xml.ts`, `src/lib/analytics.ts`, `src/layouts/Layout.astro`, `public/robots.txt`

**What:**
1. Created /rss.xml feed for latest content
2. Added AI referrer tracking (ChatGPT, Perplexity, Claude, Gemini, etc.)
3. Stores AI visits in localStorage for benchmarking

**Why:**
- Completes the "three data pathways" (feeds, crawled, offsite)
- Enables visibility measurement (track AI citations over time)
- Provides real-time content freshness signals
- Zero-dependency analytics for GEO ROI

**Impact:**
- GEO score +1 point (Machine readability now 2/2)
- Can now measure success: "Did ChatGPT recommend us this week?"
- RSS enables syndication to AI training datasets

**Verify:**
- RSS: `curl https://noot.smol.xyz/rss.xml`
- AI tracking: Check `localStorage.getItem('smol_ai_visits')` after AI referral

---

## How to Maintain Visibility

### 1. Keep Content Fresh (Monthly)

**Why:** Freshness signals are critical for both SEO and GEO. Stale content loses ranking and AI citation priority.

**Tasks:**
- [ ] Update /about page FAQ if features change
- [ ] Update /llms.txt with new pages or features
- [ ] Add "Last updated: [date]" to /about page
- [ ] Review meta descriptions for accuracy

**Automation Opportunity:**
- Add `dateModified` to schema.org markup automatically on deploy
- Generate /llms.txt dynamically from route config

---

### 2. Monitor AI Visibility (Weekly)

**Why:** You can't improve what you don't measure. Track AI referrals to validate GEO ROI.

**Tasks:**
- [ ] Check `localStorage.getItem('smol_ai_visits')` for AI referrals
- [ ] Manually test queries in ChatGPT, Perplexity, Claude:
  - "What is Smol?"
  - "How to create AI music"
  - "Smol vs Suno"
  - "Best AI music generator"
- [ ] Log results in tracking sheet (see template below)

**AI Visibility Benchmark Template:**

| Date | Query | AI Engine | Cited? | Position | Sentiment |
|------|-------|-----------|--------|----------|-----------|
| 2026-01-19 | "What is Smol?" | ChatGPT | ✅ Yes | #1 | Positive |
| 2026-01-19 | "Smol vs Suno" | Perplexity | ❌ No | N/A | N/A |
| 2026-01-26 | "AI music generator" | Claude | ✅ Yes | #3 | Neutral |

---

### 3. Expand Content (Quarterly)

**Why:** More high-quality content = more entry points = more visibility.

**Priority Content to Create:**

#### A. How-to Guides (HowTo Schema)
- "How to create your first AI song"
- "How to mint music as NFT"
- "How to create a mixtape"
- "How to trade song tokens"

#### B. Comparison Pages
- "Smol vs Suno: Which AI music generator is better?"
- "Smol vs Udio comparison"
- "Best AI music generators in 2026"
- "Stellar vs Ethereum for music NFTs"

#### C. Use Case Pages
- "AI music for content creators"
- "Background music for videos"
- "Royalty-free AI music for podcasts"
- "AI music for game developers"

#### D. Topic Cluster (Hub + Spokes)
Create a hub page: "/ai-music" with spokes:
- What is AI music?
- History of AI music generation
- AI music copyright & licensing
- AI music genres and styles
- AI music vs human-created music

**Template:** See "Content Templates" section below.

---

### 4. Technical SEO Hygiene (Quarterly)

**Why:** Prevent SEO regressions from breaking visibility.

**Tasks:**
- [ ] Run Lighthouse audit (LCP, CLS, INP)
- [ ] Check robots.txt is correct
- [ ] Verify sitemap is updating (check `/sitemap-index.xml`)
- [ ] Test canonical tags on all pages
- [ ] Ensure no broken internal links
- [ ] Validate schema.org markup ([validator.schema.org](https://validator.schema.org))

**Tools:**
- [Google Search Console](https://search.google.com/search-console)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse)
- [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) (free tier)

---

### 5. Offsite Signals (Ongoing)

**Why:** Consistent brand presence across platforms builds authority.

**Tasks:**
- [ ] Keep sameAs links updated in Organization schema
- [ ] Maintain consistent profiles:
  - ✅ GitHub: https://github.com/smol-ai
  - ✅ Twitter: https://twitter.com/smolxyz
  - Consider: Product Hunt, Hacker News, Reddit
- [ ] Share milestones (user count, songs created, etc.)
- [ ] Respond to mentions on social media
- [ ] Encourage user-generated content (testimonials, case studies)

**Note:** Don't fake authority (no fake reviews, no link schemes). Authenticity matters for AI engines.

---

## Content Templates

### Template 1: FAQ Block

Use this for any page where users have common questions.

```html
<section class="faq">
  <h2>Frequently Asked Questions</h2>

  <details>
    <summary>Question goes here?</summary>
    <p>Answer goes here. Be direct and concise (1-3 sentences). Link to relevant pages for more detail.</p>
  </details>

  <details>
    <summary>Another question?</summary>
    <p>Another answer.</p>
  </details>
</section>
```

**Schema.org:**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Question text?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Answer text."
      }
    }
  ]
}
```

**Best Practices:**
- Start with "What", "How", "When", "Why", "Can I"
- Keep questions <15 words
- Keep answers <100 words (except where detail is critical)
- Link to deeper content for "Learn more"

---

### Template 2: Comparison Page

Use this for "X vs Y" queries.

**Structure:**
```markdown
# Smol vs [Competitor] — Which AI Music Generator is Better?

## Quick Comparison Table
| Feature | Smol | [Competitor] |
|---------|------|--------------|
| NFT Minting | ✅ Yes (Stellar) | ❌ No |
| Price | Free (+ network fees) | $10/month |
| Ownership | Full onchain ownership | Limited |
| Auth | Passwordless (PasskeyKit) | Email/password |

## When to Choose Smol
- You want true ownership via NFTs
- You value blockchain integration
- You prefer passwordless auth

## When to Choose [Competitor]
- You don't need blockchain features
- You prefer subscription pricing
- You prioritize [specific feature]

## Bottom Line
[Honest recommendation based on use case]
```

**Schema.org:** Use `AboutPage` or `Article` schema.

**Best Practices:**
- Be honest and fair (don't bash competitors)
- Lead with table (easy to scan)
- Acknowledge when competitor is better
- Use data/examples, not marketing fluff

---

### Template 3: How-to Guide

Use this for instructional content.

**Structure:**
```markdown
# How to [Do Something] on Smol

## What You'll Need
- Account (sign up with PasskeyKit)
- [Any other prerequisites]

## Step-by-Step Instructions

### Step 1: [Action]
[Clear instruction with screenshot/example]

### Step 2: [Action]
[Clear instruction]

### Step 3: [Action]
[Clear instruction]

## Tips & Troubleshooting
- **Tip:** [Helpful advice]
- **Common issue:** [Problem and solution]

## Next Steps
- [Link to related guide]
- [Link to related feature]
```

**Schema.org:**
```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to create your first AI song",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Sign up",
      "text": "Create an account using PasskeyKit (biometric auth)."
    },
    {
      "@type": "HowToStep",
      "name": "Write a prompt",
      "text": "Describe the song you want in text."
    }
  ]
}
```

**Best Practices:**
- Use numbered steps (not bullets)
- Keep steps <50 words each
- Include visuals where helpful
- End with "Next Steps" to reduce bounce rate

---

## Release Checklist (Use This on Every Deploy)

Before pushing to production, verify:

### Content Freshness
- [ ] Are meta descriptions still accurate?
- [ ] Is /llms.txt up to date with new pages?
- [ ] Are FAQ answers still correct?
- [ ] Do comparison pages reflect current features?

### Technical SEO
- [ ] Does `pnpm build` succeed?
- [ ] Are canonical tags correct?
- [ ] Is sitemap generating correctly?
- [ ] Are all internal links working?
- [ ] Is RSS feed valid XML?

### Schema Validation
- [ ] Run [Schema Markup Validator](https://validator.schema.org)
- [ ] Test one page from each type (song, artist, mixtape, about)
- [ ] Check for warnings/errors

### Performance
- [ ] Run Lighthouse (target: LCP <2.5s, CLS <0.1)
- [ ] Check bundle size hasn't exploded
- [ ] Verify critical CSS isn't render-blocking

### Post-Deploy Verification
- [ ] Visit 5 key pages: /, /about, /create, /[song-id], /artist/[address]
- [ ] Check meta tags in View Source
- [ ] Test one FAQ accordion
- [ ] Verify RSS feed: `curl https://noot.smol.xyz/rss.xml`
- [ ] Check AI referrer tracking in console

---

## Advanced: Next-Level GEO Optimizations

### 1. Dynamic /llms.txt Generation
**Why:** Keep /llms.txt always up-to-date automatically.

**Implementation:**
```ts
// src/pages/llms.txt.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  // Fetch latest songs, artists, mixtapes from API
  // Generate /llms.txt dynamically
  // Include creation dates for freshness
  return new Response(content, {
    headers: { 'Content-Type': 'text/plain' }
  });
};
```

---

### 2. Structured Data on Every Song
**Why:** Complete entity graph for rich results.

**Enhancement:** Add `dateCreated`, `dateModified`, `creator` to MusicRecording schema.

```json
{
  "@type": "MusicRecording",
  "dateCreated": "2026-01-19",
  "dateModified": "2026-01-19",
  "creator": {
    "@type": "Person",
    "name": "Artist Name"
  }
}
```

---

### 3. AI Visibility Dashboard
**Why:** Visualize GEO performance over time.

**Implementation:**
- Read `localStorage.getItem('smol_ai_visits')`
- Display chart: AI visits by source over time
- Show top pages recommended by AI engines
- Track citation sentiment (positive/neutral/negative)

---

### 4. Content Recommendation Engine
**Why:** Suggest related pages to reduce bounce rate and improve internal linking.

**Implementation:**
- Add "Related Content" section to song/artist pages
- Use tags to suggest similar songs
- Link FAQ answers to relevant pages
- Build topic clusters with hub/spoke internal links

---

### 5. Real-Time RSS Updates
**Why:** AI crawlers prioritize fresh content.

**Implementation:**
- Connect /rss.xml to live API endpoint
- Include last 50 public songs
- Add `<pubDate>` based on song creation timestamp
- Update RSS on every new song publish

---

## Measuring Success

### Traditional SEO Metrics
Track in Google Search Console:
- **Impressions:** How often Smol appears in search results
- **Clicks:** How often users click through
- **CTR:** Click-through rate (target: >3% for branded, >1% for non-branded)
- **Position:** Average ranking (target: <10 for key queries)

**Key Queries to Track:**
- "AI music generator"
- "create AI music"
- "Suno alternative"
- "mint music NFT"
- "text to song"

---

### GEO Metrics (AI Visibility)
Track manually (monthly):

1. **Citation Count:** How many times did AI engines cite Smol?
2. **Citation Quality:** What position? What sentiment?
3. **Coverage:** Which queries trigger citations?
4. **Source Mix:** ChatGPT vs Perplexity vs Claude vs Gemini

**Example Monthly Report:**

| Month | Total Citations | ChatGPT | Perplexity | Claude | Gemini |
|-------|----------------|---------|------------|--------|--------|
| Jan 2026 | 12 | 5 | 4 | 2 | 1 |
| Feb 2026 | 18 | 7 | 6 | 3 | 2 |
| Mar 2026 | 25 | 10 | 8 | 5 | 2 |

**Success Indicator:** Month-over-month growth in citations.

---

### User Metrics (Proxy for Quality)
Track in analytics:
- **Bounce Rate:** <60% is good
- **Time on Page:** >2min for content pages
- **Pages per Session:** >2 is good
- **Conversion Rate:** Free → Account creation

---

## Troubleshooting

### Problem: Pages not indexing
**Symptoms:** Google Search Console shows "Discovered - not indexed"

**Solutions:**
1. Check robots.txt isn't blocking
2. Verify canonical tags point to correct URL
3. Ensure sitemap includes the page
4. Add internal links from high-authority pages
5. Request indexing in Search Console

---

### Problem: AI engines not citing Smol
**Symptoms:** Zero AI referrals in localStorage

**Solutions:**
1. Verify /llms.txt is accessible
2. Check FAQ answers are clear and direct
3. Add more "answer-ready" content (Q&A blocks)
4. Ensure About page clearly defines "What is Smol"
5. Wait (AI engines update slower than search engines)

---

### Problem: Low CTR in search results
**Symptoms:** Impressions high, clicks low

**Solutions:**
1. Improve meta descriptions (more compelling)
2. Add year to title tags ("Best AI Music Generator 2026")
3. Target long-tail keywords (less competition)
4. Test different descriptions via A/B (requires backend)

---

### Problem: Slow page load times
**Symptoms:** Lighthouse LCP >2.5s

**Solutions:**
1. Preload critical assets (`<link rel="preload">`)
2. Optimize images (WebP, lazy loading)
3. Reduce JavaScript bundle size
4. Use Cloudflare CDN caching effectively
5. Extract critical CSS for above-the-fold content

---

## Resources & Tools

### SEO Tools
- [Google Search Console](https://search.google.com/search-console) — Free
- [Lighthouse](https://developer.chrome.com/docs/lighthouse) — Free
- [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) — Free tier
- [Schema Validator](https://validator.schema.org) — Free

### GEO Resources
- [Microsoft AEO/GEO Guide](https://searchengineland.com/microsoft-generative-engine-optimization-guide-445550) — Original GEO framework
- [/llms.txt Convention](https://github.com/josh-may/llms.txt) — Emerging standard

### Analytics
- [Plausible](https://plausible.io) — Privacy-friendly analytics (optional)
- localStorage tracking (current implementation) — Free

### Testing
- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Meta Tags Tester](https://metatags.io)
- [Feed Validator](https://validator.w3.org/feed/)

---

## Quick Reference: GEO Readiness Checklist

Use this before each major release:

- [ ] **Entity clarity:** Organization schema + About page
- [ ] **Content clarity:** FAQ sections + direct answers
- [ ] **Completeness:** All schema fields populated
- [ ] **Freshness:** Last-updated dates + RSS feed
- [ ] **Accessibility:** Content in initial HTML (SSR)
- [ ] **Reliability:** Core user flows work (no broken UX)
- [ ] **Machine readability:** Sitemap + RSS + /llms.txt
- [ ] **Authority:** Real proof (metrics, case studies, testimonials)

**Target:** 14+/16 for strong GEO readiness.

---

## Changelog

**2026-01-19 — Initial Release**
- Created comprehensive visibility playbook
- Documented 5 PRs (llms.txt, descriptions, /about, schemas, RSS/tracking)
- Added content templates (FAQ, comparison, how-to)
- Added release checklist
- Added troubleshooting guide
- **GEO Readiness:** 13/16

---

## Next Steps

### Short-term (This Quarter)
1. ✅ Deploy all PR changes to production
2. Monitor AI visibility (check localStorage weekly)
3. Create 2-3 comparison pages ("Smol vs Suno", "Best AI music generators")
4. Add "How to create AI music" guide with HowTo schema

### Medium-term (Next Quarter)
1. Build AI Visibility Dashboard (visualize localStorage data)
2. Add `dateModified` to all MusicRecording schemas
3. Create topic cluster hub ("/ai-music")
4. Generate /llms.txt dynamically from API

### Long-term (This Year)
1. Reach 14+/16 GEO Readiness Score
2. Track 50+ AI citations per month
3. Rank #1 for "AI music generator" in ChatGPT recommendations
4. Build case studies showing user success stories

---

**End of Visibility Playbook**

For questions or updates, see:
- GitHub: https://github.com/smol-ai
- Twitter: https://twitter.com/smolxyz
