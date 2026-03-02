---
name: documentation-governance
description: Maintain high-integrity documentation using the Smol FE verification suite. Enforces SSOT and Fail-Closed policies.
---

# Documentation Governance Skill

Maintain high-integrity documentation using the Smol FE verification suite. This skill enforces the **Fail-Closed Documentation Policy** and ensures `STATE_OF_WORLD.md` remains the Single Source of Truth (SSOT).

## 1. Governance Principles ⚖️
- **Fail-Closed**: Documentation must be as reliable as code. If a doc test fails, the build is considered broken.
- **SSOT First**: All technical facts (ports, versions, URLs) MUST be defined in `STATE_OF_WORLD.md` and referenced elsewhere.
- **No Stale Claims**: Claims about the codebase must be periodically verified against source using the audit scripts.
- **Relative Links Only**: Never use absolute `file:///` URIs or environment-specific URLs.

## 2. Tooling & Commands 🛠️
The repository includes a custom verification suite in `scripts/docs/`.

| Command | Action | Purpose |
| :--- | :--- | :--- |
| `pnpm docs:xref` | Rebuilds [XREF_MAP.json](../../../docs/XREF_MAP.json) | Scans all `.md` files for anchors and file references. |
| `pnpm docs:lint` | Runs link, claim, and consistency checks | Verifies every link, cross-references version claims, and flags legacy terms. |
| `pnpm docs:test` | Full suite (XREF + Lint + Flows) | Use this before any PR merge or major architecture change. |
| `pnpm docs:flows` | Extracts Mermaid flows | Generates [FLOW_SPECS.json](../../../docs/FLOW_SPECS.json) from markdown sequences. |

## 3. Workflow: Adding a New Document 📝
1. **Metadata Block**: Every new `.md` file MUST start with a CONTRACT metadata block:
   ```markdown
   <!--
   CONTRACT:
   - SSOT: [STATE_OF_WORLD.md](../../../docs/STATE_OF_WORLD.md)
   - AUDIENCE: [Dev | Agent | Product]
   - NATURE: [Current | Snapshot | Procedure]
   - LAST_HARDENED: YYYY-MM-DD
   - VERIFICATION_METHOD: [Code trace | Simulation | Manual]
   -->
   ```
2. **Register in INDEX**: Add the document to the structured tree in [INDEX.md](../../../docs/INDEX.md).
3. **Internal Links**: Use relative paths. If referencing a source file, point to the relative path from the doc (e.g., `[passkey-kit.ts](../../../src/utils/passkey-kit.ts)`).
4. **Verify**: Run `pnpm docs:test` to ensure the new file hasn't introduced broken links or invalid claims.

## 4. Workflow: Hardening an Existing Doc 🛡️
1. **Fact Check**: Verify every URL, file path, and code snippet against the current `main` branch.
2. **Purge Legacy**: Remove references to `npm` (use `pnpm`), `Auth Token` (use `Auth Token`), or specific staging URLs.
3. **Reference SSOT**: If the doc mentions a port or version, ensure it matches the value in `STATE_OF_WORLD.md`.
4. **Update Metadata**: Change the `LAST_HARDENED` date and the `NATURE` if it has become a legacy snapshot.

## 5. Troubleshooting Test Failures 🔧
- **Broken Link**: The file doesn't exist at the relative path specified. 
- **Broken Anchor**: The heading (e.g., `# My Heading`) was changed but the link `(file.md#my-heading)` was not updated.
- **Stale File Reference**: You referenced a source file in backticks (e.g., `` `src/utils/api/mixtapes.ts` ``) that no longer exists.
- **Claim Mismatch**: A version or port in your doc differs from `STATE_OF_WORLD.md`.
