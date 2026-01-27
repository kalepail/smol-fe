<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md](STATE_OF_WORLD.md)
- AUDIENCE: Dev
- NATURE: Current
- LAST_HARDENED: 2026-01-27
- VERIFICATION_METHOD: [Link check | Claim check]
-->
# Testing Guide

This guide details the verification gates required for any PR. All tests must pass before merging.

## 🧪 Prerequisite Health
- **Node.js**: `22.21.1`
- **pnpm**: `10.18.1`

## 🕹️ Core Test Suite

### 1. Unit & Regression
```bash
pnpm test
```

### 2. Type Checking (Svelte Runes)
```bash
pnpm check
```

### 3. Build Verification
```bash
pnpm build
```

## 📖 Documentation Verification
This project follows a strict "Fail-Closed" documentation policy.
```bash
pnpm docs:test
```
*Validates: Relative links, Cross-references (XREF), and Metadata contracts.*

## 🎭 E2E (Playwright)

### Install Browser Engines
```bash
pnpm exec playwright install
```

### Run E2E (Headless)
```bash
pnpm test:e2e
```

### Run E2E (Headed/Debug)
```bash
pnpm test:e2e -- --headed
```

---
`TESTING` · [INDEX](INDEX.md) · [STATE OF WORLD](STATE_OF_WORLD.md)
