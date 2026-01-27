---
name: github-workflow
description: GitHub PR, issue, and comment management for smol-fe. Use when creating PRs, reviewing code, or managing issues.
---

# GitHub Workflow for smol-fe

## Repository Structure

| Repository | Owner | Role |
|------------|-------|------|
| `tacticalnoot/smol-fe` | Jeff (tacticalnoot) | **Development fork** - where work happens |
| `kalepail/smol-fe` | Tyler (kalepail) | **Upstream** - where PRs get merged |

## Creating Pull Requests

**Default PR flow:**
- **From:** `tacticalnoot/smol-fe` branch `main`
- **To:** `kalepail/smol-fe` branch `noot`

### PR Creation Command

```typescript
mcp_github_create_pull_request({
  owner: "kalepail",
  repo: "smol-fe",
  title: "[descriptive title]",
  head: "tacticalnoot:main",  // Always from tacticalnoot's main
  base: "noot",                // Always to kalepail's noot branch
  body: "[PR description with changes list]"
})
```

### PR Title Conventions

- `fix: [description]` - Bug fixes
- `feat: [description]` - New features
- `refactor: [description]` - Code improvements
- `docs: [description]` - Documentation updates
- `chore: [description]` - Maintenance tasks

### PR Body Template

```markdown
## Summary
[Brief description of changes]

## Changes
- [Change 1]
- [Change 2]

## Testing
- [ ] `pnpm check` passes
- [ ] Manual testing completed

## Related Issues
Closes #[issue number] (if applicable)
```

## Checking PR Status

```typescript
// List open PRs from tacticalnoot
mcp_github_list_pull_requests({
  owner: "kalepail",
  repo: "smol-fe",
  state: "open",
  head: "tacticalnoot:main"
})

// Get specific PR details
mcp_github_get_pull_request({
  owner: "kalepail",
  repo: "smol-fe",
  pull_number: [PR_NUMBER]
})

// Check PR status/checks
mcp_github_get_pull_request_status({
  owner: "kalepail",
  repo: "smol-fe",
  pull_number: [PR_NUMBER]
})
```

## Creating Issues

```typescript
mcp_github_create_issue({
  owner: "kalepail",  // Issues go to upstream
  repo: "smol-fe",
  title: "[issue title]",
  body: "[issue description]",
  labels: ["bug"] // or ["enhancement", "documentation", etc.]
})
```

## Adding Comments

```typescript
// Comment on an issue
mcp_github_add_issue_comment({
  owner: "kalepail",
  repo: "smol-fe",
  issue_number: [NUMBER],
  body: "[comment text]"
})

// Review a PR
mcp_github_create_pull_request_review({
  owner: "kalepail",
  repo: "smol-fe",
  pull_number: [NUMBER],
  body: "[review comment]",
  event: "COMMENT"  // or "APPROVE" or "REQUEST_CHANGES"
})
```

## "Make the Next PR" Workflow

When user says "make the next PR" or similar, follow this decision tree:

### Step 1: Check for existing open PRs

```typescript
mcp_github_list_pull_requests({
  owner: "kalepail",
  repo: "smol-fe",
  state: "open",
  head: "tacticalnoot:main",
  base: "noot"
})
```

### Step 2: Decide action based on result

| Condition | Action |
|-----------|--------|
| **Open PR exists** | Add comment summarizing new changes, update PR body if needed |
| **No open PR** | Create new PR with all changes since last merged PR |

### Step 3a: If open PR exists - Add comment

```typescript
mcp_github_add_issue_comment({
  owner: "kalepail",
  repo: "smol-fe",
  issue_number: [EXISTING_PR_NUMBER],
  body: "## Additional Changes\n\n- [new change 1]\n- [new change 2]\n\nReady for review."
})
```

### Step 3b: If no open PR - Create new one

```typescript
mcp_github_create_pull_request({
  owner: "kalepail",
  repo: "smol-fe",
  title: "[type]: [description]",
  head: "tacticalnoot:main",
  base: "noot",
  body: "[summary of all changes since last merge]"
})
```

### Generating PR content

To summarize changes, check recent commits:
```typescript
mcp_github_list_commits({
  owner: "tacticalnoot",
  repo: "smol-fe",
  sha: "main",
  perPage: 10
})
```

## Common Workflows

### After completing a feature/fix:

1. Verify build: `pnpm check`
2. Create PR to upstream:
   ```typescript
   mcp_github_create_pull_request({
     owner: "kalepail",
     repo: "smol-fe",
     title: "fix: C-address swap transaction builder",
     head: "tacticalnoot:main",
     base: "noot",
     body: "## Summary\nFixes C-address swap by using correct aggregator contract and distribution format.\n\n## Changes\n- Updated aggregator contract to CAYP3UW...\n- Added bytes field to distribution struct\n- Excluded SDEX from default protocols"
   })
   ```

### Syncing with upstream:

If kalepail/smol-fe:noot has changes you need:
```bash
git remote add upstream https://github.com/kalepail/smol-fe.git
git fetch upstream
git merge upstream/noot
```

## Key Contacts

- **Tyler (kalepail)** - Upstream maintainer, passkey-kit author
- **Jeff (tacticalnoot)** - Fork owner, primary developer
