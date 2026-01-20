# AEO/GEO v2 Playbook

**Version:** 2.0 (Jan 2026)
**Goal:** Maintain top-tier machine readability and authority status.

## 1. The "Frequency" Engine
To keep AI search engines (like Perplexity, SearchGPT) interested, we must broadcast "Freshness".

*   **Primary Signal:** `/rss.xml`
    *   **Automation:** Auto-generated via `src/pages/rss.xml.ts` pulling from live API.
    *   **Check:** Verify weekly that `/rss.xml` contains the latest community songs.
*   **Deep Indexing:** `/sitemap-songs.xml`
    *   **Automation:** `src/pages/sitemap-songs.xml.ts` fetches top 5000 songs.
    *   **Note:** Submitted to `robots.txt` automatically.
*   **Agentic Spec:** `/openapi.yaml`
    *   **Purpose:** Helps Coding Agents (like cursor/windsurf) understand valid data endpoints.
*   **Secondary Signal:** `/llms.txt`
    *   **Action:** Manual update required only when *major features* launch.
    *   **Check:** Ensure links in `public/llms.txt` are 200 OK.

## 2. Content Standards (The "Complete" Check)
Every new page MUST pass the **Entity Test**:

1.  **Identity:** Does the page clearly state *who* owns it? (Organization Schema)
2.  **Product:** If selling something, is there `Product` schema? prices? images?
3.  **Action:** Can a bot understand what to *do* here? (Listen, Create, Buy)

**Copy/Paste Templates:**
*   **Organization:** Imported from `src/utils/seo-schema.ts`.
*   **Product:** Reference `src/pages/store.astro`.

## 3. Maintenance Cadence

### Monthly
- [ ] **Run Extraction Test**: Paste your homepage HTML into an LLM context window. Ask: "Who runs this site?" and "What is the latest song?". If it fails, check Schema.
- [ ] **Validate Feeds**: `curl https://noot.smol.xyz/rss.xml` -> ensure it's not empty.

### Quarterly
- [ ] **Authority Audit**: Check search console for "Organization" rich results errors.
- [ ] **Competitor Scan**: specific searches for "Smol vs [Competitor]" to see if we own the narrative.

## 4. Deployment Checklist
Before major releases:
1.  **Sitemap:** Does the build generate it? (`npm run build` -> check `dist/sitemap-index.xml`)
2.  **Robots:** Is `/api` still blocked? Are new landing pages allowed?
3.  **Verify Schema:** Use validator.schema.org on a deployment preview URL.

## 5. Troubleshooting
*   **"Domain not authorized" in Turnstile/Auth:** Check Cloudflare settings.
*   **"Empty RSS":** Check `smols.ts` API fetch logic. Fallback to snapshot if API is down.
*   **"Missing Image":** Ensure OGP `og:image` is an absolute URL (https://...), not relative.
