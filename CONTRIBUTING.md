# Contributing to Smol Frontend

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to `tacticalnoot/smol-fe`. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1.  **Fork the repo** and clone it locally.
2.  **Install dependencies**: `pnpm install` (We strictly use `pnpm`).
3.  **Start development**: `pnpm dev` (Runs on port `4321`).
4.  **Read the docs**: Check `docs/INDEX.md` for architecture and setup guides.

## How Can I Contribute?

### Reporting Bugs

-   **Check existing issues** to see if the bug has already been reported.
-   **Use the Bug Report template** when opening a new issue.
-   Include clear steps to reproduce, logs, and screenshots if possible.

### Suggesting Enhancements

-   **Use the Feature Request template**.
-   explain *why* you want the feature and how it benefits the ecosystem.

### Pull Requests

1.  **Branching**:
    -   Use `feature/my-feature` for new features.
    -   Use `fix/my-bug-fix` for bug fixes.
    -   Use `docs/example-doc-update` (example) for documentation only.
2.  **Standards**:
    -   **Tech Stack**: Svelte 5 (Runes), Astro 5, Tailwind CSS 4.
    -   **Linting**: Run `pnpm check` before committing.
    -   **Formatting**: Code should be clean and readable.
3.  **Documentation**:
    -   If you add a new feature, update the relevant docs in `docs/`.
    -   If you add a new doc file, **you MUST update `docs/INDEX.md`**.
4.  **Testing**:
    -   Run `pnpm test` (if applicable) and manually verify your changes.
    -   Use `docs/LOCAL_TESTING_CHECKLIST.md` for sanity checks.

## Style Guide

-   **Svelte**: Use **Runes** (`$state`, `$derived`, `$effect`) for all reactive state. Avoid legacy stores where possible.
-   **CSS**: Use **Tailwind CSS 4**. Avoid custom CSS unless necessary for complex animations.
-   **Types**: Use [TypeScript](https://www.typescriptlang.org/) for everything. No implicit `any`.

## AI Agents

If you are an AI agent working on this repo, please read `docs/AGENTS.md` **immediately**. It contains critical Prime Directives and safety contraints.
