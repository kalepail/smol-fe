---
name: workspace-hygiene
description: Non-destructive cleaning and safe optimizations. Use for maintenance passes, build health checks, and small safe improvements without feature work.
---

# SKILL: Workspace Hygiene (Non-Destructive Cleaning + Safe Optimizations)

## Purpose
Keep the repo **clean, fast, and reliable** without breaking behavior. This skill performs **non-destructive hygiene** (lint/type/test/build sanity, drift detection, dead/unused checks, small safe cleanups) and proposes **low-risk optimizations** (performance, bundle, caching, config hygiene) with a strict safety posture.

## When to Use
Use this skill when:
- The workspace feels "messy" (warnings accumulating, inconsistent tooling, slow builds).
- You want to **verify everything still works** after changes.
- You want **safe improvements** without feature work.
- CI or deploy previews are flaky and you want to reduce drift.
- You want a "maintenance pass" that won't rewrite the whole repo.

## Non-Destructive Rules (Hard Guardrails)
**Do not do any of the following unless explicitly requested:**
- No mass reformatting / style churn (avoid huge diffs).
- No dependency major upgrades, no sweeping `pnpm update`, no lockfile regen unless required for a *specific* fix.
- No deleting user data, migrations, secrets changes, infra rewires, or config nukes.
- No "refactor for cleanliness" without a measurable reason.
- No API behavior changes unless the fix is *directly* about a bug.
- No changes that can't be reversed in one commit.

**Always keep changes:**
- Small, focused, reversible.
- One theme per PR/commit (e.g., "fix lint error in X" OR "remove unused import set").
- Verified by a repeatable command (lint/type/test/build).

## Operating Mode
This skill follows a strict loop:
1) **Snapshot →** 2) **Inspect →** 3) **Propose (ranked) →** 4) **Execute (tiny) →** 5) **Verify →** 6) **Report**

### Success Criteria
- Workspace passes core health checks (or failures are clearly explained + bounded).
- Any changes are minimal-diff and demonstrably safe.
- Optimizations are justified with evidence (before/after metrics when possible).

---

## Phase 0 — Safety Snapshot (Must Do First)
Run and record:
- `git status`
- `git diff`
- `git rev-parse --short HEAD`
- `node -v` and package manager version (e.g., `pnpm -v`)
- Identify repo root + primary scripts (`cat package.json`)

Create a hygiene branch (example):
- `git checkout -b hygiene/YYYY-MM-DD-short-slug`

**If the repo has a "state" file (e.g., STATE_OF_WORLD.md / changelog), append a short entry**:
- date, branch, intent, what will be checked.

---

## Phase 1 — Health Checks (Read-Only First)
### 1. Install / Dependency Drift (Prefer Frozen)
- Prefer a frozen install if supported:
  - pnpm: `ppnpm install --frozen-lockfile` (or `--prefer-frozen-lockfile` if strict mode causes noise)
- If install changes lockfile unexpectedly:
  - STOP and explain why. Do not commit lockfile changes unless required.

### 2. Core Script Matrix (Run What Exists)
Detect scripts and run the minimal set that proves health:
- Lint: `pnpm lint` (or equivalent)
- Format check (not rewrite): `pnpm format:check` / `prettier --check .`
- Typecheck: `pnpm typecheck` / `tsc -p … --noEmit`
- Unit tests: `pnpm test`
- Build: `pnpm build`

**Rule:** If a command doesn't exist, don't invent it. List what's available and run what you can.

### 3. Quick Runtime Smoke (Non-Browser)
When possible, do a headless smoke:
- Start build in production mode and ensure it exits cleanly.
- If SSR exists, run minimal server build/render command if provided.

---

## Phase 2 — Hygiene Inspection (Find Problems Without Changing Anything)
Use lightweight, evidence-first checks:

### A) Code Hygiene
- Unused imports/vars (via lint).
- Duplicate utilities (search for repeated helpers).
- Dead files / unused exports (optional tooling like `ts-prune` / `knip` if already in repo).
- "TODO/FIXME" hotspots:
  - `rg -n "TODO|FIXME|HACK|XXX" .`

### B) Config Hygiene
- Conflicting tool configs (eslint/prettier/tsconfig).
- Multiple tsconfigs with drift.
- Environment variable sprawl (unused vars).
- Build config warnings.

### C) Performance / Bundle (Only if Tooling Exists)
- Bundle analyzer if present.
- Identify heavy deps (quick scan):
  - `pnpm why <dep>` (target obvious heavies)
- Check for accidental server-only packages in client bundles (SSR hybrid repos).

### D) CI/Deploy Parity (If Repo Provides)
- If there's a CI script, run the same script locally.
- If Cloud/deploy config exists, check for mismatched node versions, build commands, env var expectations.

---

## Phase 3 — Ranked Recommendations (Before Touching Code)
Produce a **Hygiene & Optimization Backlog** with each item:
- **Impact:** low/med/high
- **Risk:** low/med/high
- **Effort:** S/M/L
- **Evidence:** exact error log / file path / warning / perf measurement
- **Proposed fix:** the smallest viable change
- **Verification:** exact command(s) that prove it works

**Default selection rule:** pick **1–2 items max** with **low risk** and **high certainty**.

Examples of good "tiny wins":
- Fix a single lint error blocking CI.
- Remove an unused import set in one module.
- Tighten a `tsconfig` include/exclude that causes slow typecheck.
- Add a missing `.npmrc`/tool setting to reduce install churn (only if clearly needed).
- Replace an expensive runtime pattern with a cheaper equivalent *in a small isolated place*.

---

## Phase 4 — Execute (Tiny, Reversible Changes Only)
### Change Budget
- Aim for < 50 lines changed per commit unless unavoidable.
- Avoid repo-wide formatting. If formatting is required, scope it to the touched file(s).

### Commit Discipline
Each commit message must be explicit:
- `hygiene: fix <specific issue>`
- `hygiene: remove unused <x>`
- `perf: reduce <y> in <z> (no behavior change)`

### "No Surprises" Checks
Before commit:
- `git diff` review for churn (look for whitespace-only).
- Ensure no accidental lockfile churn unless required.

---

## Phase 5 — Verification (Must Pass)
After changes, rerun the exact commands affected:
- Lint / Typecheck / Test / Build as relevant.
- If the optimization is performance-related, capture before/after:
  - build time, bundle size output, or a specific warning count reduction.

---

## Phase 6 — Hygiene Report (Required Output)
Write a short report (in PR description or HYGIENE_REPORT.md) with:

### 1) Snapshot
- Branch, base SHA, tool versions.

### 2) Findings
- What was failing or risky (with logs/snippets).

### 3) Changes Made
- Bullet list of commits + what they do.

### 4) Verification
- Commands run + results.

### 5) Optimization Notes
- Any measurable improvement (times, sizes, warning count).
- Next 3 recommended items (ranked) that were *not* done.

---

## Optional Add-Ons (Only If Already Supported)
- If a "depcheck/knip/ts-prune" tool is present, run it in **report-only** mode first.
- If formatting tools exist, prefer **check mode** (`--check`) not rewrite (`--write`).

---

## "If Something Breaks" Policy
If any hygiene step introduces failures:
- Immediately revert the minimal commit(s) causing it.
- Record the failure + root cause hypothesis.
- Propose an alternative lower-risk fix.

---

## Quick Command Template (Adapt to Repo)
(Only run what exists in package.json)
```bash
ppnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

## Notes for Agents
- Be conservative. This is a **maintenance** skill, not a feature engine.
- Prefer **evidence and minimal diffs** over "pretty code".
- Never destroy data. Never do broad changes. Always verify.
