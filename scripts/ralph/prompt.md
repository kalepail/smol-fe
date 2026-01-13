ANTI-GRAVITY PROMPT — DEPLOY “RALPH WIGGUM” SAFELY FOR SMOL LABS (SMOL.xyz)

MISSION
Create a new, fully sandboxed area of the SMOL frontend called **SMOL Labs** that can host small experimental “mini-features / games” that MUST use SMOL MP3 playback + SMOL song metadata, while guaranteeing the main site cannot be altered, destabilized, or behavior-changed.

THIS IS A SAFETY-CRITICAL TASK.
Ralph is allowed to iterate for a long time, so we need hard guardrails + tripwires that prevent scope creep and prevent touching core SMOL behavior.

NON-NEGOTIABLE SAFETY CONTRACT (READ CAREFULLY)
1) SMOL Labs is a “container.” ALL experiments must live ONLY inside the Labs sandbox paths listed below.
2) Ralph MUST NOT modify anything about core site behavior:
   - no touching the main player, audio store, tipping flow, wallet/login flow, existing pages, existing styles, existing radio, existing stores, existing services
   - no changes to core routing beyond adding the new /labs route files
3) Allowed operations on SMOL data:
   - READ ONLY. Fetch/consume MP3 + metadata; no writes, no auth changes, no contract calls, no user state mutation.
4) No new dependencies. No package.json changes. No lockfile changes.
5) No environment variable changes. No secrets. No new external integrations.
6) One story per iteration. Small diffs. If a story needs more than ~300 LOC net new code, split into another story.
7) Any time a change would touch disallowed files: STOP, REVERT, and write a progress.txt entry explaining why it was blocked.

HARD SCOPE ALLOWLIST (FILES RALPH MAY MODIFY)
ONLY these paths may be changed in commits:
- src/pages/labs/**           (ALL Labs pages)
- src/components/labs/**      (Labs-only UI/components)
- src/lib/labs/**             (Labs-only utilities, API wrappers, helpers)
- src/styles/labs/**          (Labs-only styles if needed; do NOT touch global styles)
- public/labs/**              (Labs-only static assets)
- scripts/ralph/**            (Ralph control files ONLY: prd.json, progress.txt, prompt.md, ralph.sh)
- .github/workflows/labs-scope-guard.yml   (a single workflow to enforce allowlist; optional but strongly recommended)

Everything else is READ-ONLY. If you need something that would require editing outside this allowlist, create a new PRD story titled “ESCALATION: requires human decision” and mark it as fails=false, then STOP.

TRIPWIRE ENFORCEMENT (DO THIS FIRST)
Implement at least ONE automated scope guard before Ralph starts building experiments:
A) Add a CI workflow `.github/workflows/labs-scope-guard.yml` that fails if any file outside the allowlist is modified.
   - It should run on pull_request and push.
   - It should compute changed files vs base branch and fail if any path is outside allowlist.
B) Also add a local guard command Ralph must run before every commit:
   - `git diff --name-only --cached` and `git diff --name-only`
   - If any file outside allowlist appears, revert those changes.

IMPORTANT: CI scope guard is the only “hard wall” that protects us from a 25-hour run going feral. Prefer CI.

RUNTIME SAFETY (LABS MUST NOT BREAK MAIN SITE)
- The Labs page must not import or initialize global audioState or global userState stores.
- Any component that touches `window`, `AudioContext`, `localStorage`, or DOM APIs MUST be mounted as client-only to avoid SSR traps.
  - In Astro: use `client:only="svelte"` for Labs interactive components.
- Labs playback must use a dedicated, local `<audio>` element and local state. No shared store. No persisted global playback.

PRODUCT REQUIREMENTS (SMOL LABS)
- Route: `/labs`
- UI: clean grid layout of experiment cards
  - each card: Title, 1-sentence description, “Alpha / Prototype” badge, CTA button (Open)
  - add a subtle “This is experimental” disclaimer at top
- Each experiment page uses SMOL MP3 + metadata:
  - e.g., play a snippet, show tags, show waveform, quiz tags, similarity game, etc.
- Labs must be fully safe even if shipped:
  - no writes, no auth required, no tipping, no wallet actions
  - no personal data collection
- Labs must be resilient:
  - handle API failures gracefully (fallback UI)
  - never crash hydration / SSR

BOOTSTRAP PLAN (HIGH-LEVEL)
Phase 0 (Guardrails)
1) Add scope guard workflow (and/or a scripts/ralph “scope check” step described in prompt rules).
2) Create Labs skeleton pages + components within allowlist paths.

Phase 1 (Core Labs container)
3) `/labs` landing page with grid
4) `/labs/[slug]` experiment pages (or `/labs/experiments/<slug>`)
5) A small Labs-only data fetch helper that can:
   - load a list of SMOL IDs from existing in-repo snapshot (if present) OR
   - fetch from existing API endpoints already used by the codebase (READ-ONLY)
   - fetch a single SMOL detail to get MP3 URL + metadata (READ-ONLY)

Phase 2 (Experiments: build 3 small ones)
6) Experiment 1: “Tag Roulette”
   - user selects 1–3 tags from metadata pool
   - app picks random matching SMOL, plays 10–20s snippet, reveals tags + title after play
7) Experiment 2: “Blind Tag Quiz”
   - play snippet
   - show 6 tag options (1 correct tag from track + 5 decoys)
   - score + next
8) Experiment 3: “Waveform Memory / Match”
   - show 3 waveform thumbnails (or simplified waveform renders if available)
   - play one snippet and ask user to match the waveform/track
   - uses waveform metadata if available

QUALITY BAR / ACCEPTANCE TESTS (FOR EVERY STORY)
- Must pass typecheck + lint + tests (use whatever commands this repo already has; do not add new tooling).
- Must load in browser without console errors.
- Must not affect any existing routes or the global player.
- Must not introduce any new network calls outside READ-ONLY SMOL APIs already used.
- Must not add any dependencies.

RALPH INTEGRATION (CONTROL FILES)
Create `scripts/ralph/` with:
- `scripts/ralph/prd.json`
- `scripts/ralph/progress.txt`
- `scripts/ralph/prompt.md`
- `scripts/ralph/ralph.sh` (copied from snarktank/ralph)

Even if you’re not using Amp specifically, KEEP the structure because it’s Ralph’s “memory.” The loop MUST behave like:
- read prd.json + progress.txt
- pick highest priority story with passes=false
- implement ONLY that story
- run checks
- scope-guard check (must be clean)
- commit with message `feat: [STORY_ID] - [TITLE]`
- set passes=true
- append progress.txt with learnings + files changed
- repeat

BRANCH & MERGE SAFETY
- Work only on a dedicated branch (example: `labs/ralph-sandbox`).
- Never push directly to production/main without human review.
- No auto-merge. No auto-deploy changes outside Labs.

=== APPEND THIS NEXT SECTION TO THE END OF THE EXISTING ANTI-GRAVITY / RALPH PROMPT ===

===========================================================
K) NEW PHASE AFTER LABS BASELINE: “XLM → C-ADDRESS” VIA SOROSWAP + SAC
===========================================================

CONTEXT / INTENT
After SMOL Labs baseline is DONE (LABS-000 through LABS-006 all pass), the next objective is:

Build a **Soroswap-powered swapper** (Labs-only) that enables the local **C address** (the artist’s address in SMOL metadata) to “handle” **native XLM** FIRST.
- We will add USDC later. DO NOT implement USDC in this phase.
- The key unknown to resolve: if the artist “C address” can hold KALE, can it hold XLM (native) and/or other assets?
- Start with Soroswap + Stellar development docs; read docs thoroughly before coding.

ABSOLUTE CONTAINMENT STILL APPLIES
- This MUST remain entirely contained to SMOL Labs (same allowlist as before).
- Ralph MUST NOT change any core site behavior.
- Any transaction logic must be Labs-only and invoked only by explicit user action in the Labs swapper UI.
- NO new dependencies, NO package.json/lockfile changes, NO env var changes.

IMPORTANT UPDATE: “READ-ONLY” EXCEPTION (LABS TRANSACTIONS ONLY)
Previously Labs was read-only. For this phase, transactions are allowed ONLY inside a single Labs experiment:
- “Soroswap Swapper (XLM-only)”
Every transaction must:
- be user-initiated (button click)
- be simulated first (Soroban RPC simulate)
- display a clear confirmation screen (asset in/out, min out, destination, network)
- require an explicit “I understand this is experimental” checkbox per session
- never auto-submit, never background-submit, never loop-submit

GLOBAL RULE: REUSE TIP-MODAL TRANSACTION FLOW (ALLOWED)
You MAY reuse the same transaction build/simulate/sign/send flow that the existing tip modal uses, PROVIDED:
- you do NOT modify the tip modal code
- you do NOT change shared stores or global wallet behavior
- you either (a) import existing stable helpers without side effects, OR (b) copy the minimal logic into `src/lib/labs/tx/**`
Prefer copying minimal logic into Labs to avoid accidental coupling.

===========================================================
L) REQUIRED RESEARCH FIRST (WRITE IT DOWN IN-REPO)
===========================================================
Before implementing anything, create a Labs-only research note:

- `SMOL_LABS/RESEARCH_XLM_C_ADDRESSES.md`

It must answer (with citations/links, in plain English):
1) What a “C address” represents in Stellar smart contracts (contract Address) and what it can hold.
2) How native XLM can be held/managed by a contract address (hint: SAC behavior and contract data balances).
3) How Soroswap identifies assets (SAC address vs CODE:ISSUER) and how XLM is represented.
4) Which Soroswap contract(s) we will call (Router vs Aggregator) and why.
5) How we will avoid needing Soroswap API keys (simulate on-chain locally instead of relying on the API).

If anything is uncertain after reading docs, STOP and add an “ESCALATION” story in PRD and do not proceed.

DOCS YOU MUST READ (MINIMUM)
- Stellar Docs: Stellar Asset Contract (SAC) + token interface docs
- Soroswap Docs: Router contract interface + deployed addresses + “Using Soroswap with TypeScript”
- OPTIONAL: Soroswap API docs ONLY IF we already have an API key (do not assume)

===========================================================
M) IMPLEMENTATION STRATEGY (SAFE + CONTAINED)
===========================================================

We want “XLM working first” in the most conservative way.

Phase 1 (Foundation): XLM SAC transfer to a C address (NO SWAP YET)
- Build a Labs experiment that can do:
  - Select a SMOL (track) → read its “artist address” (C address) from metadata
  - Let the user enter an XLM amount
  - Execute a SAC transfer of native XLM from the user’s account Address → to the artist contract Address
- This directly tests the core claim: “Can a contract address hold native XLM via SAC semantics?”
- Must simulate first; show results; then request wallet signature; then submit.

Phase 2 (Soroswap Swapper): Swap XLM → (something) and deliver to artist C address
- Only after Phase 1 works reliably, add a second tab inside the same experiment:
  - “Swap XLM using Soroswap Router (XLM-only input)”
- For now, you may target a single output token (choose the existing KALE token if it is already configured in the repo),
  BUT DO NOT add USDC.
- Use the Router contract call (e.g., swap_exact_assets_for_assets) to swap XLM to the output token.
- After swap, optionally transfer the output token to the artist C address (still in Labs-only flow).

CRITICAL SAFETY: avoid relying on Soroswap API keys
- Do not require Soroswap API unless an API key already exists in repo config (do not add it).
- Prefer:
  - Build the Router invoke transaction locally
  - Simulate via Soroban RPC to estimate output
  - Set `min_out` as (simulated_out * (1 - slippage_bps)) with a conservative default like 100 bps
  - Show user the numbers and let them confirm

NETWORK + ADDRESSES
- Soroswap Router address MUST be loaded in a deterministic and auditable way:
  - Prefer using Soroswap “Deployed Addresses” doc / JSON in Soroswap core repo (read-only fetch OK)
  - Cache it in Labs session
  - If fetch fails, fallback to a hardcoded mapping inside Labs (documented in comments)
- Never “guess” contract addresses.

===========================================================
N) UPDATE RALPH PRD (APPEND THESE STORIES AFTER LABS-006)
===========================================================

Add the following stories to `scripts/ralph/prd.json` (keep one-story-per-iteration rule):

{
  "id": "LABS-100",
  "title": "Research: Can artist C-address hold native XLM? (SAC + Soroswap docs) — write SMOL_LABS/RESEARCH_XLM_C_ADDRESSES.md",
  "priority": 100,
  "passes": false,
  "acceptance": [
    "Research note exists and is clear",
    "Explains SAC handling of native XLM and contract balances",
    "Explains Soroswap asset identifiers (SAC vs CODE:ISSUER)",
    "Lists exact contract(s) we will call and why",
    "States whether we can avoid Soroswap API key dependency (preferred: yes via simulation)"
  ]
},
{
  "id": "LABS-101",
  "title": "Implement Labs experiment shell: Soroswap Swapper (XLM-only) with explicit risk UI + kill-switch",
  "priority": 101,
  "passes": false,
  "acceptance": [
    "New experiment card appears in /labs grid",
    "Experiment has an explicit EXPERIMENTAL / RISK banner",
    "Transaction submit controls are disabled until user checks an 'I understand' checkbox",
    "No imports that mutate global audio/user stores; no changes outside allowlist"
  ]
},
{
  "id": "LABS-102",
  "title": "Phase 1: XLM-to-Artist C-address transfer via Stellar Asset Contract (simulate → sign → send)",
  "priority": 102,
  "passes": false,
  "acceptance": [
    "User can select a SMOL and the experiment reads its artist C-address",
    "User can input XLM amount",
    "Flow simulates first and shows a confirmation summary",
    "Flow signs/sends using the same safe transaction pipeline pattern as tip modal (without editing tip modal)",
    "Handles failure states gracefully (insufficient funds, user reject, simulation fail, RPC timeout)"
  ]
},
{
  "id": "LABS-103",
  "title": "Phase 2: Soroswap Router swap (XLM input only), using simulation-derived min_out (NO USDC)",
  "priority": 103,
  "passes": false,
  "acceptance": [
    "Uses Soroswap Router contract address deterministically (docs/JSON + fallback)",
    "Builds Router call tx and simulates to estimate output",
    "Applies conservative slippage to compute min_out",
    "Signs/sends only after explicit user confirmation",
    "Does not require Soroswap API keys",
    "NO USDC support implemented"
  ]
},
{
  "id": "LABS-104",
  "title": "Optional: Post-swap delivery — transfer output token to artist C-address (Labs-only, explicit confirm)",
  "priority": 104,
  "passes": false,
  "acceptance": [
    "After swap completes, user may click an explicit 'Send to Artist' button",
    "Transfer is simulated then signed then sent",
    "Destination is the artist C-address",
    "No global side effects"
  ]
},
{
  "id": "LABS-105",
  "title": "Hardening: edge cases, UX safety, and regression checks to ensure main SMOL unaffected",
  "priority": 105,
  "passes": false,
  "acceptance": [
    "No impact to global player, tip modal, login, or routing",
    "No console errors on non-Labs routes",
    "Scope guard still blocks any out-of-sandbox edits",
    "Clear error messages and safe defaults"
  ]
}

===========================================================
O) ADDITIONAL LABS SAFETY TRIPWIRES (TRANSACTION-SPECIFIC)
===========================================================

Add these rules to `SMOL_LABS/POLICY.md` and `scripts/ralph/prompt.md`:

- Transactions are only permitted inside the single experiment “Soroswap Swapper (XLM-only)”.
- Default state of the experiment must be NON-TRANSACTING until user opts in via checkbox per session.
- Must always simulate before sign/send.
- Must show:
  - Network (mainnet/testnet/etc)
  - From address
  - Destination (artist C address)
  - Asset in/out and amounts
  - Slippage/min_out (if swap)
- Must include a “Stop Audio / Stop Everything” style “Cancel” button and a “Reset” button.
- No USDC logic. No stablecoins. No multi-asset selectors yet.

===========================================================
P) STILL NON-NEGOTIABLE: ALLOWLIST ENFORCEMENT
===========================================================

The same allowlist applies. No changes outside it.
If any transaction work requires changing global code outside allowlist:
- Create PRD story: “ESCALATION: requires core changes (human decision)”
- Mark it passes=false
- STOP.

END OF APPEND.
