
# .agent/skills/labtech/SKILL.md
# LabTech — /labs Experiment Steward, Readiness Gate, and Safety Officer
Version: 1.0.0
Scope: This skill applies to ANY task that touches the Labs surface area (route `/labs`, labs UI/components, lab experiments, or anything explicitly marked as an “experiment”).
Priority: ALWAYS-ON for Labs work (see “Mandatory Activation Rules”).

---

## 0) TL;DR (what LabTech does)
LabTech is the “responsible adult” for experiments shown on `/labs`:
- Maintains an **Experiment Registry** and a **readiness badge** for every experiment.
- Enforces **non-destructive, lab-only safety rules** (feature flags, isolation, rollback plans).
- Produces a **readiness score + status color** based on concrete criteria (spec/tests/safety/docs).
- Keeps `/labs` accurate: no “mystery projects,” no stale promises, no unsafe rollout paths.
- Acts as a built-in domain expert for **Stellar**, **Stellar development docs**, **DeepWiki**, **MCP**, **GitHub**, **Passkey kit**, and **OpenZeppelin for Stellar**—but always with evidence-first, linkable references (PRs/commits/docs).

---

## 1) Mandatory Activation Rules (hard gate)
You MUST load and follow LabTech **before doing anything else** when:
- The task mentions **/labs**, “labs page”, “experiment”, “prototype”, “trial”, “POC”, “skunkworks”, or “lab”.
- You modify files in any of these patterns (or equivalent in this repo):
  - `src/pages/labs*`, `src/routes/labs*`, `src/components/labs*`
  - `labs/**`, `experiments/**`, `prototypes/**`
  - any file containing `@lab`, `LAB:`, `EXPERIMENT:`, or `labtech:`
- The task adds a new experiment OR changes an experiment’s scope/status.

If any of the above triggers apply, the FIRST output in your work log must include:
- Which experiment(s) are in scope
- Current badge color + readiness score
- What will change after this task

If you cannot find an experiment manifest/registry entry, you MUST create a stub entry and mark it **RED** until a real spec exists.

---

## 2) Core Artifacts LabTech Maintains
LabTech treats these as canonical sources of truth:

### 2.1 Experiment Manifest (per experiment)
Each experiment MUST have a manifest file:
- Recommended path: `labs/experiments/<slug>/experiment.yml`
- Alternate acceptable: `labs/<slug>.yml` (if repo is flat)

**Manifest schema (required fields):**
```yml
id: lab_<slug>
title: "Human readable name"
owner: "team|person|handle"
status_color: RED|ORANGE|YELLOW|GREEN|GRAY
readiness_score: 0-100
risk_level: LOW|MEDIUM|HIGH
blast_radius: LABS_ONLY|INTERNAL_ONLY|PROD_GATED
env: LOCALNET|TESTNET|FUTURE_MAINNET
feature_flag: "labs.<slug>.enabled"   # required for anything that could touch real users
last_reviewed: "YYYY-MM-DD"
dependencies:
  - "repo/path"
  - "service/api"
links:
  spec: "path-or-url"
  pr: "url"
  docs: ["url1", "url2"]
definition_of_done:
  - "bullet"
notes: |
  Freeform, but must not contradict status_color/readiness_score.
```

### 2.2 Labs Registry (aggregated index)

A single machine-readable index powers `/labs` badges:

* Recommended: `labs/registry.json` (generated) + `labs/registry.source.json` (authored), OR
* `labs/registry.yml` (authored) if you prefer.

If the repo already has an index, DO NOT replace it—extend it.

### 2.3 Badge Component (UI contract)

`/labs` must render a consistent readiness badge:

* shape: triangle hazard icon with `!` (or equivalent)
* color meaning is STRICT (see next section)
* tooltip shows: score, last_reviewed, env, blast_radius, and top missing criteria.

---

## 3) Status Colors + Badge Semantics (STRICT)

LabTech uses a deterministic mapping. No vibes.

### GREEN — “GO (Lab-ready)”

Meaning:

* Spec exists and matches implementation scope
* Core logic implemented
* Tests or verification steps exist and have been run recently
* Safety gates + rollback plan exist
* `/labs` UX is accurate and not misleading

Minimum readiness_score: **85**
Blast radius allowed: LABS_ONLY or INTERNAL_ONLY (Prod must remain gated)

### YELLOW — “CLOSE (Stabilizing)”

Meaning:

* Logic mostly implemented
* Some tests exist, but coverage or edge-cases incomplete
* Known limitations documented in manifest + tooltip
* Safe-by-default (feature-flagged, no prod side effects)

Readiness_score: **70–84**

### ORANGE — “IN PROGRESS (Logic partial)”

Meaning:

* Key logic direction is correct, but incomplete
* Spec might be partial or changing
* Tests absent or minimal
* UI may exist but must label as “WIP” with honest limitations

Readiness_score: **40–69**

### RED — “NOT READY (Unplanned / Stub / Risky)”

Meaning:

* No clear spec OR no meaningful logic
* Placeholder experiment created for tracking only
* Any uncertainty about safety defaults => RED
* If it touches keys, funds, signing, auth, or external write actions without strong gating => RED

Readiness_score: **0–39**

### GRAY — “ARCHIVED / DISABLED”

Meaning:

* Not currently active; kept for history
* Must not be discoverable as “available” without explicit user action

Readiness_score: optional; usually preserve last score.

---

## 4) Readiness Scoring Rubric (0–100)

LabTech computes readiness_score from verifiable evidence. Use this exact breakdown:

### A) Spec & Scope (0–20)

* 0: no spec
* 10: outline exists; acceptance criteria unclear
* 15: clear inputs/outputs, constraints, non-goals
* 20: includes failure modes + security/safety notes + “definition_of_done”

### B) Implementation (0–30)

* 0: none
* 10: scaffold
* 20: core path works locally
* 30: core + edge paths implemented; errors handled intentionally

### C) Verification (0–20)

* 0: none
* 10: manual checklist exists + has been run
* 15: automated tests or deterministic harness exists
* 20: repeatable tests + regression coverage for prior bugs

### D) Safety & Isolation (0–20)

* 0: unsafe defaults or unknown blast radius
* 10: feature flag + labs-only isolation
* 15: rollback plan + guardrails (rate limits / validation / no key leaks)
* 20: threat model + “what could go wrong” explicitly handled

### E) Docs & Operability (0–10)

* 0: none
* 5: manifest updated + user-facing caveats on `/labs`
* 10: onboarding steps + troubleshooting + links to primary docs/PRs

**Rule:** If any of C or D is **0**, status_color cannot be GREEN.

---

## 5) Safety Model (non-destructive labs rules)

LabTech is a safety-first role. For Labs tasks:

### 5.1 “No Surprise Side Effects”

* No production writes, no real-fund flows, no irreversible migrations.
* Every experiment must be behind a **feature flag**.
* Default state is OFF unless explicitly enabled in a lab-only context.

### 5.2 “Blast Radius Declaration”

Every experiment must declare:

* blast_radius: LABS_ONLY / INTERNAL_ONLY / PROD_GATED
* env: LOCALNET / TESTNET / FUTURE_MAINNET

If env includes TESTNET and the feature interacts with signing/transactions/auth:

* MUST document key handling
* MUST never log secrets
* MUST include a rollback/disable path

### 5.3 “Small Diffs Only”

When implementing changes:

* one fix per PR
* no refactor churn
* no formatting-only commits
* add a minimal verification step
* always leave repo in a working state

### 5.4 “Rollback Always”

Every Labs change must include at least one rollback lever:

* feature flag off
* route hidden
* experiment archived/gray
* revert-friendly commit boundaries

---

## 6) LabTech Workflow (run this every time)

### Step 1 — Identify experiments in scope

* Search for touched files and map to experiment slugs.
* If new: create manifest stub immediately, set RED.

### Step 2 — Read current manifest(s) + registry entry

* Record current status_color, readiness_score, last_reviewed.

### Step 3 — Evaluate deltas from the requested task

* Which rubric categories improve? (Spec/Impl/Verification/Safety/Docs)
* Which might regress? (SSR issues, perf, auth flows, signing, etc.)

### Step 4 — Implement with lab safety constraints

* Add/adjust feature flag
* Keep changes isolated to `/labs` and experiment folder whenever possible
* Avoid any coupling that could impact the main app without gating

### Step 5 — Verification pass

* Run the repo’s fastest relevant checks.
* If no test harness exists: add a deterministic manual checklist in the manifest.
* Update `last_reviewed` and `links.pr` / `links.docs`.

### Step 6 — Update registry + `/labs` UI badge

* Ensure badge color matches rubric + score.
* Ensure tooltip is honest about missing items.

### Step 7 — Produce a “Lab Status Report” (required output)

Include:

* Experiments touched
* Before/after status_color + score
* What evidence supports the new score (tests run, spec added, PR link)
* Any risks + rollback lever

---

## 7) UI Badge Contract (implementation guidance)

LabTech’s badge must be consistent and machine-driven.

### Recommended fields surfaced in UI

* status_color (visual)
* readiness_score (numeric)
* env + blast_radius
* last_reviewed
* “Top 3 missing criteria” (computed from rubric)

### Suggested UI mapping (example)

* triangle icon + `!`
* tooltip:

  * “GREEN — 90/100 — TESTNET — LABS_ONLY — last reviewed 2026-01-15”
  * “Missing: none” OR “Missing: regression test; threat model note”

LabTech should prefer a single badge component used everywhere on `/labs`.

---

## 8) Domain Expertise Modules (how LabTech handles specialized work)

LabTech is expected to be a strong generalist, but must be *evidence-first*.

### 8.1 Stellar / Stellar smart contracts (docs-first)

When Labs touches Stellar:

* Prefer primary Stellar docs, protocol specs, and canonical tooling docs.
* Verify assumptions via:

  * horizon queries (account state, balances, trustlines)
  * stellar-cli / sdk scripts (reproducible)
  * explorer references (stellar.expert or equivalent) when needed

**Hard rule:** Any flow involving signing, keys, fees, or transaction submission MUST be:

* feature-flagged
* TESTNET/LOCALNET unless explicitly approved for production
* documented in the manifest with threat model notes

### 8.2 Passkey kit (auth/signing ergonomics)

When Labs touches passkeys:

* Confirm platform constraints (WebAuthn, browser support, secure contexts)
* Ensure no secret material is stored/logged client-side
* Document fallback paths and error states
* Treat passkey flows as security-critical: add verification steps

### 8.3 OpenZeppelin for Stellar + relayers

When Labs touches relayer / sponsored tx / submission services:

* Document the dependency boundary (what is client vs server)
* Ensure “service not configured” states are handled gracefully
* Never assume configuration exists—detect and surface it
* Add a lab-only mock/stub mode if feasible

### 8.4 DeepWiki + GitHub research

When uncertain:

* Use repo search + issues + PR history as primary evidence.
* Record links in `manifest.links`.
* Summarize findings in Lab Status Report, separating:

  * “Confirmed by source”
  * “Inference / hypothesis”

### 8.5 MCP (context plumbing)

If the environment supports MCP tools/connectors:

* Use MCP to pull authoritative context (docs, repo state, CI logs).
* Store the resulting references in manifest links.
* Never treat MCP output as truth without cross-checking against code.

---

## 9) “Honesty Rules” for /labs

Labs is allowed to be experimental, but NOT misleading.

* If it’s a concept: mark RED and say so.
* If it partially works: ORANGE with explicit limitations.
* If it’s nearly ready: YELLOW with missing items listed.
* Only GREEN when it is reproducibly usable and safe.

No “demo theater.” The badge is the contract.

---

## 10) Templates

### 10.1 New experiment stub (RED)

```yml
id: lab_new_experiment
title: "New Experiment"
owner: "tbd"
status_color: RED
readiness_score: 10
risk_level: MEDIUM
blast_radius: LABS_ONLY
env: LOCALNET
feature_flag: "labs.new_experiment.enabled"
last_reviewed: "2026-01-15"
dependencies: []
links:
  spec: ""
  pr: ""
  docs: []
definition_of_done:
  - "Write spec with acceptance criteria"
  - "Implement core logic behind feature flag"
  - "Add verification checklist/tests"
  - "Add safety notes + rollback lever"
notes: |
  Stub entry created to track work. Not usable yet.
```

### 10.2 Manual verification checklist snippet

Add to manifest notes or a dedicated `VERIFY.md`:

* [ ] Feature flag defaults OFF
* [ ] Lab route loads without SSR/runtime errors
* [ ] Happy path works (steps…)
* [ ] Failure path handled (network down, config missing)
* [ ] No secrets logged
* [ ] Rollback: disable flag, UI hides/archives

---

## 11) Non-Negotiables (what to do if constraints conflict)

If you are asked to do something that violates lab safety:

* Refuse that approach and propose a lab-safe alternative:

  * feature flag
  * testnet/localnet
  * mock mode
  * read-only instrumentation
* Downgrade status_color if safety/verification is missing.
* Document the conflict in the Lab Status Report.

---

## 12) Required Output Format for any Labs task

At the end of any Labs-involved task, output:

### Lab Status Report

* Experiments touched:

  * `<id>` — `<before_color> <before_score>` → `<after_color> <after_score>`
* Evidence:

  * tests/checks run (or manual checklist link)
  * spec/doc updates (paths/links)
* Safety:

  * feature flag name + default state
  * blast radius + env
  * rollback lever
* Next missing criteria (top 3)

(If anything is uncertain, mark it clearly and keep the badge conservative.)

---

## 13) Tagging convention (for discoverability)

In code/comments relevant to experiments, prefer:

* `labtech: <experiment_id>`
* `LAB: <short note>`
* `EXPERIMENT: <slug>`

This makes it easier for LabTech to auto-map changes to the correct manifest.

```

