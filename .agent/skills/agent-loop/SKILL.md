---
name: agent-loop
description: Enforces verified completion using an attempt→verify→iterate loop with explicit success criteria, validators, artifacts, and safety limits. Use for non-trivial bugs, SSR issues, auth/tx flow, and "works locally but not in preview/prod."
---

# Agent Loop Skill (Verified Completion)
The agent loop is a persistence + verification pattern: the loop is the hero, not the model.

## When to use
- Any high-risk area (passkeys/tx/relayer)
- Any deployment parity bug
- Any bug that is intermittent or hard to reproduce

## Required inputs
- Success criteria (binary, testable)
- Validators (commands/checklist)
- Max iteration/time budget

## How to run
1) **Audit Skills**: Check all available scripts and `SKILL.md` files for relevance to the current topic. Read them BEFORE planning.
2) **Define Success**: Write success criteria + validators at top of .agent/_reports/AGENT_PROGRESS.md
3) Run /agent-loop workflow steps.
4) Every iteration must:
   - change one thing
   - run validators
   - record results
5) Stop only on verified pass.

## Safety
- Never include secrets in artifacts.
- Prefer tiny diffs.
- If repeated failure after 3 loops, switch to /triage.
