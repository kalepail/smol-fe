# smol-fe Audit Notes

**Date:** 2026-01-23

## Phase 0 — Baseline + Safety

### Environment
- Node: v22.21.1
- pnpm: 10.18.1
- Lockfile: `pnpm-lock.yaml`

### Baseline commands
- `ppnpm install` (already up to date; build scripts ignored warning logged)
- `ppnpm check` (fails with existing type errors; see output in terminal log)
- `pnpm test` (pass)
- `ppnpm build` (pass with chunk-size warnings)

---

## Phase 1 — Repo Map (Quick Index)

**Top-level overview**
- `src/` — app code (Astro pages + Svelte components + stores + hooks + utils)
- `docs/` — architecture, audits, and playbooks
- `scripts/` — snapshot and audit tooling
- `ext/` — linked Soroban SDKs (`smol-sdk`, `comet-sdk`)
- `public/` — static assets, llms files, robots
- `.agent/` — agent rules, skills, and Ralph artifacts

**Runtime hotspots**
- Audio: `src/stores/audio.svelte.ts`, `src/components/audio/BarAudioPlayer.svelte`
- Navigation: `astro:transitions`, `history.pushState` in `useSmolGeneration.ts`
- Data fetching: `src/services/api/*`, `src/components/smol/SmolResults.svelte`
- Auth & tx: `src/utils/passkey-kit.ts`, `src/hooks/useAuthentication.ts`

---

## Phase 1 — Documentation Review (All .md/.txt)

### Root files
- `README.md`
  - ✅ Good: thorough feature + stack overview.
  - ⚠️ Missing: local auth workaround for passkeys, env var notes mention `.env` example that isn’t present.
  - ✅ Improve: link to `DEVELOPER_SETUP.md` and `START_HERE.md` near “Getting Started.”
- `DEVELOPER_SETUP.md`
  - ✅ Good: clear localhost passkey workaround, port specifics.
  - ⚠️ Missing: mention `ppnpm check` + `pnpm test` baseline steps.
  - ✅ Improve: add “dev server uses 4322 here vs 4321 in START_HERE” note to avoid confusion.
- `START_HERE.md`
  - ✅ Good: step-by-step local testing checklist.
  - ⚠️ Missing: mention passkey cookie workaround for localhost (see DEVELOPER_SETUP).
  - ✅ Improve: add note about default port in this repo vs fork.
- `DEBUGGING_GUIDE.md`
  - ✅ Good: clear logging recipes and categories.
  - ⚠️ Missing: link to `PASSKEY_WALLET_TRANSACTION_AUDIT.md` for deeper flows.
  - ✅ Improve: add “common issues in production vs localhost” section.
- `LOCAL_TESTING_CHECKLIST.md`
  - ✅ Good: comprehensive flow validation.
  - ⚠️ Missing: cross-link to Cast debugging and audio continuity tests.
  - ✅ Improve: add “Audio continuity across navigation” steps.
- `BACKEND_HANDOFF.md`
  - ✅ Good: explicit backend validation checklist.
  - ⚠️ Missing: mention the new “finalizing” retry behavior on detail pages.
  - ✅ Improve: add link to `docs/REPRO_MATRIX.md` for the 404 lag risk.
- `INTEGRATION_REFERENCE.md`
  - ✅ Good: concise API + environment references.
  - ⚠️ Missing: mention RSS endpoint usage and llms.txt location.
  - ✅ Improve: add a note on required response headers for audio range requests (Cast).
- `NOTES.md`
  - ✅ Good: passkey relayer deltas and usage map.
  - ⚠️ Missing: update the “Phase Checklist” to include current build/test state.
  - ✅ Improve: clarify whether Legacy Relayer is fully removed from runtime.
- `CAST_DEBUG.md`
  - ✅ Good: step-by-step Cast diagnostics.
  - ⚠️ Missing: direct link to `src/pages/api/audio/[id].ts` for headers.
  - ✅ Improve: add known-good curl commands for range/HEAD checks.
- `OPTIMIZATIONS.md`
  - ✅ Good: detailed error/transaction hardening summary.
  - ⚠️ Missing: update any implementation references if paths changed.
  - ✅ Improve: mark “adopt executeTransaction wrapper” as a recommended next PR.
- `PASSKEY_WALLET_TRANSACTION_AUDIT.md`
  - ✅ Good: deep audit coverage with checklists.
  - ⚠️ Missing: explicit mention of current svelte-check failures (for context).
  - ✅ Improve: add “Known current blockers” section.
- `CHANGELOG.md`
  - ✅ Good: detailed historical updates.
  - ⚠️ Missing: entries for recent audits/SEO changes.
  - ✅ Improve: add a “Docs/Audit” section per release.
- `TESTING_SUMMARY.md`
  - ✅ Good: explains debug/verification tooling.
  - ⚠️ Missing: Playwright/E2E instructions.
  - ✅ Improve: link to new `TESTING.md`.
- `STATEDIAGRAM.md`
  - ✅ Good: overall state machine sketches.
  - ⚠️ Missing: update from “fixed missing smolIds property” note to current state.
  - ✅ Improve: add recent “finalizing/polling” detail page behavior.
- `SMOL_ECOSYSTEM_CACHE.md`
  - ✅ Good: system-wide reference snapshot.
  - ⚠️ Missing: mention relayer migration to Kale Farm (if applicable).
  - ✅ Improve: add “last verified on” update cadence.
- `SMOL_LABS/RESEARCH_XLM_C_ADDRESSES.md`
  - ✅ Good: clear XLM/SAC handling notes.
  - ⚠️ Missing: note which contracts are currently used in production.
  - ✅ Improve: add small “last verified” timestamp.
- `song_runtimes.md`
  - ✅ Good: runtime info for songs.
  - ⚠️ Missing: note how it is generated/updated.
  - ✅ Improve: add update command or script reference.

### Root log/text files
- `usernames.txt`
  - ✅ Good: empty placeholder.
  - ⚠️ Missing: context (what it’s used for).
  - ✅ Improve: add a comment header or remove if unused.
- `current-check.txt`, `check_output.txt`, `check_output_2.txt`, `check_log.txt`, `svelte-check-output.txt`, `verification-check.txt`
  - ✅ Good: snapshots of historical typecheck output.
  - ⚠️ Missing: timestamp + command context in filenames.
  - ✅ Improve: store in `artifacts/` or add date prefix.
- `build_log.txt`, `build_log_2.txt`
  - ✅ Good: build logs with warnings.
  - ⚠️ Missing: build parameters (node version, environment).
  - ✅ Improve: include a header block in log.
- `log.txt`, `log_check.txt`, `output.txt`, `publish_report.txt`
  - ✅ Good: useful diagnostics and API samples.
  - ⚠️ Missing: context for when/why generated.
  - ✅ Improve: add a short header or move under `artifacts/`.
- `tldts-results.txt`, `tldts-results-prod.txt`
  - ✅ Good: domain parsing references.
  - ⚠️ Missing: mention the script used.
  - ✅ Improve: add a note or store next to the script.

### Docs folder
- `docs/REPO_MAP.md`
  - ✅ Good: solid map and hotspots.
  - ⚠️ Missing: current warnings about typecheck errors.
  - ✅ Improve: include link to `AUDIO_AND_PLAYER_STATE.md`.
- `docs/ROUTES_AND_PAGES.md`
  - ✅ Good: highlights create flow and routing gap.
  - ⚠️ Missing: note current polling in `SmolResults` for 404.
  - ✅ Improve: update with latest behavior.
- `docs/CORE_PRODUCT_AUDIT.md`
  - ✅ Good: valuable playback findings + PR plan.
  - ⚠️ Missing: indicate which PRs are already implemented.
  - ✅ Improve: add “status” tags per proposed PR.
- `docs/STATEDIAGRAM.md`
  - ✅ Good: clear overview of core flows.
  - ⚠️ Missing: detail about the client-router persistence for audio.
  - ✅ Improve: add reference to `Layout.astro` usage.
- `docs/AUDIO_AND_PLAYER_STATE.md`
  - ✅ Good: direct pointers to audio store + player.
  - ⚠️ Missing: current buffering/play intent fields noted.
  - ✅ Improve: update fields list.
- `docs/DATA_FLOW.md`
  - ✅ Good: outlines snapshot + live hydration.
  - ⚠️ Missing: retry/polling behavior described in SmolResults.
  - ✅ Improve: mention `fetchSmols` fallback.
- `docs/HYPOTHESES_AND_FIX_PLAN.md`
  - ✅ Good: concise fix plan for 404 lag.
  - ⚠️ Missing: current polling code addition status.
  - ✅ Improve: mark as “implemented.”
- `docs/DIFF_SURFACE_MAP.md`
  - ✅ Good: references navigation + detail fetching.
  - ⚠️ Missing: update to include new polling behavior.
  - ✅ Improve: add map for `rss.xml.ts` and SEO schemas.
- `docs/REPRO_MATRIX.md`
  - ✅ Good: clear steps for repro of create → detail bug.
  - ⚠️ Missing: current mitigation status.
  - ✅ Improve: add “current behavior” row.
- `docs/passkey-relayer-runbook.md`, `docs/passkey-relayer-mainnet.md`
  - ✅ Good: operational detail and failure mode matrix.
  - ⚠️ Missing: align with current relayer endpoint (Kale Farm vs OZ).
  - ✅ Improve: update “Divergences” to match current code path.
- `docs/labs-swapper-kale-forest-spec.md`
  - ✅ Good: detailed spec with acceptance criteria.
  - ⚠️ Missing: current implementation status.
  - ✅ Improve: add checklist with current progress.
- `docs/prompts/smol_drift_architect.md`
  - ✅ Good: detailed design prompt.
  - ⚠️ Missing: references to current implementation file.
  - ✅ Improve: add a TODO / status note.

### Visibility docs
- `docs/visibility/VISIBILITY_PLAYBOOK.md`
  - ✅ Good: full GEO/SEO guide.
  - ⚠️ Missing: references to test automation for RSS and llms.
  - ✅ Improve: add validation command examples.
- `docs/visibility/V2_PLAYBOOK.md`
  - ✅ Good: maintenance cadence and checklist.
  - ⚠️ Missing: connect to CI or scripts.
  - ✅ Improve: add “local commands” section.
- `docs/visibility/BASELINE_AUDIT.md`
  - ✅ Good: baseline audit and backlog.
  - ⚠️ Missing: status of implemented items (RSS/llms now present).
  - ✅ Improve: mark done items.
- `docs/visibility/V2_BACKLOG.md`
  - ✅ Good: actionable PR list.
  - ⚠️ Missing: status or owner per PR.
  - ✅ Improve: mark implemented items.
- `docs/visibility/V2_AUDIT.md`
  - ✅ Good: identifies RSS, schema gaps.
  - ⚠️ Missing: track current partial fixes.
  - ✅ Improve: add “current vs expected.”

### scripts + .agent
- `scripts/ralph/prompt.md`
  - ✅ Good: clear Ralph loop workflow.
  - ⚠️ Missing: align with AGENTS “After every task” rule.
  - ✅ Improve: reference `AGENTS.md` in prerequisites.
- `scripts/ralph/progress.txt`
  - ✅ Good: useful historical log.
  - ⚠️ Missing: this audit entry.
  - ✅ Improve: append new entry after changes.
- `scripts/matrix-report.txt`
  - ✅ Good: records tag graph audit.
  - ⚠️ Missing: script reference.
  - ✅ Improve: add source command in file header.
- `.agent/rules/00_core.md`
  - ✅ Good: guardrails for small diffs.
  - ⚠️ Missing: explicit exception for audit docs.
  - ✅ Improve: add “doc-only audits may exceed file count.”
- `.agent/rules/60_ralph_loop.md`
  - ✅ Good: strong verification gate.
  - ⚠️ Missing: explicit examples for auth/tx changes.
  - ✅ Improve: add example validator list.
- `.agent/rules/90_security.md`
  - ✅ Good: domain allowlist.
  - ⚠️ Missing: mention which URLs are expected in tests.
  - ✅ Improve: add Playwright test URLs.
- `.agent/workflows/ralph-loop.md`
  - ✅ Good: step-by-step loop guidance.
  - ⚠️ Missing: template for “triage” output.
  - ✅ Improve: include example triage format.
- `.agent/_reports/RALPH_PROGRESS.md`, `.agent/_reports/RALPH_DIFFSTAT.txt`, `.agent/_reports/RALPH_RISK.md`
  - ✅ Good: preserves previous Ralph iterations.
  - ⚠️ Missing: update for current task if Ralph loop is triggered.
  - ✅ Improve: add a date marker for the next run.
- `.agent/skills/*/SKILL.md` and `.agent/skills/blockchain-transactions/aquarius-research.md`
  - ✅ Good: solid procedural guidance.
  - ⚠️ Missing: some skills could reference repo-specific scripts.
  - ✅ Improve: add links to `docs/REPO_MAP.md` where appropriate.

### artifacts/
- `artifacts/audit/**/error.txt`, `artifacts/audit/**/xbull.auth-model.md`
  - ✅ Good: captures provider-specific errors and conclusions.
  - ⚠️ Missing: brief context in filenames (provider/time).
  - ✅ Improve: include `provider` or `step` in filename.

### public/ + dist/
- `public/llms.txt`, `public/llms-full.txt`, `public/robots.txt`
  - ✅ Good: LLM/SEO crawl surfaces documented.
  - ⚠️ Missing: about page is marked “coming soon.”
  - ✅ Improve: update when /about is live.
- `dist/llms.txt`, `dist/llms-full.txt`, `dist/robots.txt`
  - ✅ Good: build outputs mirror public assets.
  - ⚠️ Missing: these should likely be build artifacts, not tracked.
  - ✅ Improve: consider ignoring `dist/` in git.

---

## Phase 2 — Soundness Audit (Static + Runtime)

### 1) Audio lifecycle
- `audioState` adds buffering + playIntent gates, but still relies on multiple playback triggers.
- MediaSession handlers appear in multiple modules (BarAudioPlayer + hooks), risking conflicting handlers.
- Audio context teardown is done on iOS, but there is no explicit listener cleanup on some effects.

### 2) Routing/navigation
- `useSmolGeneration` uses `history.pushState` (bypasses Astro router).
- SSR for `/[id]` is single-shot; client handles polling, but SSR still renders 404 data if API lag.

### 3) Data fetching/caching
- `fetchSmols` relies on API + snapshot; current fallback is good but no request abort or retry.
- Some fetch flows (SmolResults) lack AbortController; on navigation this may race.

### 4) State management (runes)
- Audio store is centralized and used widely; good encapsulation.
- Some derived states (SmolResults) rely on optional kv_do fields that may be missing.

### 5) Performance
- Build warning: large chunks (>500KB) in build output.
- Potential inefficiency in polling loops for generation (SmolResults) without backoff.

### 6) Error handling/observability
- Debug logging system exists but not wired everywhere (good doc coverage, inconsistent usage).
- Some API errors return generic messages without user-friendly remediation.

### 7) Security basics
- WebAuthn RP ID logic appears sane; documented in multiple places.
- No obvious unsafe HTML usage found in audited files.

### 8) DX & CI
- `ppnpm check` fails with existing type errors; that blocks CI and hides new issues.
- Many log files tracked in root; could be relocated to artifacts for clarity.

---

## Risk Register (Prioritized)

| Issue | Severity | Likelihood | User Impact | Root Cause Hypothesis | Safe Fix Options | Test Plan |
|---|---|---:|---|---|---|---|
| MediaSession handler collisions | P2 | Medium | Lock-screen controls may behave inconsistently | Multiple modules set handlers without centralized control | Centralize MediaSession setup in one component/hook | Manual: use OS media controls on iOS/Android; verify play/pause/next | 
| `/[id]` SSR 404 on fresh load | P1 | Medium | New song links show error on refresh | Read-replica lag; SSR single-shot fetch | Add retry/backoff or “finalizing” SSR fallback | Manual: create + refresh immediately, confirm recovery |
| Audio play race on rapid switching | P2 | Medium | iOS glitch/rejected play calls | Multiple play triggers across effects | Gate `play()` to a single intent, or debounce | Manual: spam play/next; check console |
| No abort on fetch during nav | P3 | Medium | stale data races / wasted requests | fetch without AbortController | Add AbortController in SmolResults + cleanup | Manual: navigate rapidly and observe network |
| Typecheck failures (pre-existing) | P1 | High | CI noise, developer confusion | Divergent SDK typings + missing fields | Fix incremental type errors, align SDK versions | `ppnpm check` |
| Large build chunks | P3 | Medium | slow initial load | heavy bundles | code-split large components, dynamic import | `ppnpm build` chunk report |

---

## Phase 3 — E2E Test Plan + Execution

### Automated (Playwright)
- **Landing → Radio**: verify navigation and header render.
- **Song detail schema**: validate JSON-LD includes `datePublished` for MusicRecording.

### Manual (Recommended for high-value flows)
- Landing → browse songs → play → next/prev (audio continuity)
- Search/list interactions (tag filters)
- Detail page load after create (fresh link + 404 recovery)
- Create flow: prompt → progress → detail page
- Mobile viewport smoke (Android-ish)
- Hard refresh on deep link
- Offline/slow network: verify error UI vs infinite spinner

**Execution status**
- Automated Playwright tests added; execution failed locally due to missing system library (`libatk-1.0.so.0`).
- Manual flows should be run once a local API is available.

---

## Phase 4 — Implemented Low-Risk Fix

### Fix: Song schema `datePublished` field
- **Symptom:** MusicRecording schema referenced an undefined variable (`created`), yielding missing `datePublished`.
- **Fix:** Use `createdDate` value computed from API data.
- **Risk:** Low (schema-only change).

### Fix: Duplicate import in `rss.xml.ts`
- **Symptom:** duplicate `APIRoute` import.
- **Fix:** remove the extra import (no behavior change).

---

## Proposed PR Plan (Small, Safe, Ordered)
1. **P0**: Bring `ppnpm check` to green by addressing top type errors (one file at a time).
2. **P1**: Centralize MediaSession handlers (single owner) to avoid conflicting controls.
3. **P1**: Add AbortController to SmolResults fetch + cleanup on navigation.
4. **P2**: Enhance `/[id]` SSR fallback for fresh 404s (short retry/backoff).
5. **P2**: Code-split large components to reduce initial bundle size.

---

## Repro Steps (for the schema fix)
1. Open `https://noot.smol.xyz/<song-id>`.
2. Inspect `script[type="application/ld+json"]` for `MusicRecording`.
3. Confirm `datePublished` is present and non-empty.

## Verification Steps
- Playwright: `ppnpm test:e2e`
