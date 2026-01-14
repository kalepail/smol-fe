---
name: ralph-loop
description: Enforces verified completion using a Ralph-style attempt→verify→iterate loop with explicit success criteria, validators, artifacts, and safety limits. Use for non-trivial bugs, SSR issues, auth/tx flow, and “works locally but not in preview/prod.”
---

# Ralph Loop Skill (Verified Completion)
Ralph Loop is a persistence + verification pattern: the loop is the hero, not the model.

## When to use
- Any high-risk area (passkeys/tx/relayer)
- Any deployment parity bug
- Any bug that is intermittent or hard to reproduce

## Required inputs
- Success criteria (binary, testable)
- Validators (commands/checklist)
- Max iteration/time budget

## How to run
1) Write success criteria + validators at top of .agent/_reports/RALPH_PROGRESS.md
2) Run /ralph-loop workflow steps.
3) Every iteration must:
   - change one thing
   - run validators
   - record results
4) Stop only on verified pass.

## Safety
- Never include secrets in artifacts.
- Prefer tiny diffs.
- If repeated failure after 3 loops, switch to /triage.
