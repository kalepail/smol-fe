
# Ralph Agent Instructions (Swapper Audit Harness)

You are an autonomous coding agent working on the swapper-audit harness.

## Your Task
1. Read the PRD at `scripts/ralph/prd.json`
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the highest priority user story where `passes: false`
5. Implement that single user story (minimal diff, no refactor churn)
6. Run quality checks: `pnpm run typecheck` and `pnpm test`
7. Update nearby `AGENTS.md` files only if you learned reusable patterns
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update PRD to set `passes: true` for the completed story
10. Append your progress to `scripts/ralph/progress.txt` (never replace)

## Progress Report Format
APPEND to progress.txt (never replace):

[Date/Time] - [Story ID]

Thread: https://ampcode.com/threads/$AMP_CURRENT_THREAD_ID
	•	What was implemented
	•	Files changed
	•	Learnings for future iterations:
	•	Patterns discovered
	•	Gotchas encountered

⸻


## Stop Condition
After completing a user story, if ALL stories have `passes: true`, reply with:
<promise>COMPLETE</promise>
