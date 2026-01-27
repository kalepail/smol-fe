# Ralph Loop Rule (Completion > Vibes)
This workspace uses a Ralph-style loop for any non-trivial task:

**LOOP = Attempt → Verify → Record → Reflect → Attempt again** until success criteria passes.
Ralph is not “try harder.” It’s **external verification gates** that prevent early exits.

## When Ralph Loop is REQUIRED
- Anything touching: auth / passkeys / tx submission / relayers / money movement
- “Works locally but fails in preview/prod”
- Bugfixes with intermittent behavior
- Large ambiguity / unknown root cause

## The ONLY acceptable stop condition
You may stop *only* when the task’s **Success Criteria** are satisfied by validators:
- build passes
- tests pass (or explicit manual checklist passes)
- repro no longer reproduces on target env (preview/prod if relevant)
- regressions checklist is clean

## Hard stop safety rails (anti-chaos)
- Max iterations: 8 (default)
- Max wall time: 90 minutes per loop session
- If iteration 3 repeats the same failure: stop and switch to **Triage workflow**.
- No secrets in artifacts. Never paste tokens/Auth Tokens in logs.

## Mandatory artifacts each iteration
Write/update:
- .agent/_reports/RALPH_PROGRESS.md (what failed, what changed, what verified)
- .agent/_reports/RALPH_DIFFSTAT.txt (git diff --stat)
- If tx/auth: .agent/_reports/RALPH_RISK.md (redacted risks + checks)
