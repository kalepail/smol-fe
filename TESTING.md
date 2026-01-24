# Testing Guide

## Prerequisites
- Node.js 18+
- pnpm (`pnpm install`)

## Unit/Regression Tests
```bash
pnpm test
```

## Typecheck
```bash
pnpm run check
```

## Build
```bash
pnpm run build
```

## E2E (Playwright)
### Install browsers
```bash
pnpm exec playwright install
```

### Run E2E tests (headless)
```bash
pnpm run test:e2e
```

### Run E2E tests (headed, for debugging)
```bash
pnpm run test:e2e -- --headed
```

### Notes
- The Playwright config starts the dev server on `http://localhost:4321`.
- The E2E suite uses a public sample song ID for the detail-page schema check.
