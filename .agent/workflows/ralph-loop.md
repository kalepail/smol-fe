# /ralph-loop — Verified Completion Workflow
Ralph Loop = enforce completion via verification, not confidence.

## Inputs (must be explicit)
1) Repro steps (including env: local / preview / prod)
2) Success criteria (pass/fail statements)
3) Validators (commands or checklist)

## Setup
Create/ensure:
- .agent/_reports/ exists
- A minimal “validator set” exists:
  - build command
  - tests command OR manual checklist

## Loop cycle (repeat)
1) ATTEMPT
   - Make the smallest change that could fix the failure.
2) VERIFY (external, objective)
   - Run validators (build/tests/checklist).
   - Re-run repro steps.
3) RECORD
   - Append iteration log to .agent/_reports/RALPH_PROGRESS.md:
     - iteration number
     - failure observed
     - hypothesis
     - change made
     - verification results
4) REFLECT (short)
   - If fixed: stop (only if success criteria fully met)
   - If not fixed: update hypothesis and continue

## Exit criteria
Stop only when:
- all success criteria are met
- validators pass
- rollback plan noted (if risky)

## If stuck
- Switch to /triage and produce:
  - 3 competing hypotheses
  - top 2 experiments (minimal diffs)
  - what evidence would falsify each
