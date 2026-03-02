---
name: builder
description: Enforces architectural stability, scalability, and "unbreakable" build standards, while also providing surgical repair protocols for when things break.
---

# Builder Skill — Architecture, Hardening & Repair

## 1. TL;DR
The **Builder** skill is the master protocol for both **Constructing** robust systems and **Repairing** broken ones. It combines architectural foresight with surgical repair precision.
- **Build**: Blueprints, Interfaces, Error Boundaries.
- **Repair**: Diagnostics, Triage, Surgical Fixes.

## 2. Activation Triggers
Activate this skill when:
- 🏗️ **Building**: Creating new features, refactoring, or scaling.
- 🔧 **Repairing**: Fixing persistent lint errors, tool failures, or runtime crashes.
- 🛡️ **Hardening**: Implementing "unbreakable" standards (types, guards, boundaries).

## 3. The Protocol: Construction Loop (New Work)

### Step 1: Blueprint (Planning)
Don't lay bricks without a plan.
- **Interfaces First**: Define strict TypeScript interfaces before writing logic. No `any`.
- **Component Hierarchy**: Plan the tree. Where does state live? (Prefer local over global).
- **Error Strategy**: How will this component fail safely? (Error Boundaries, standard fallbacks).

### Step 2: Foundation (Core Logic)
Write the core with defensive coding.
- **Strict Typing**: Treat `any` as a structural weakness. Sand it down.
- **Input Sanitization**: Validate all props and user inputs. Assume they are corrosive.
- **Guard Rails**: Use early returns and guards (`if (!data) return null`) to prevent runtime crashes.

### Step 3: Reinforcement (Hardening)
Make it unbreakable.
- **Error Boundaries**: Wrap major sections in `<ErrorBoundary>`. The app should never white-screen.
- **Graceful Degradation**: If an image fails, show a placeholder. If API fails, show a retry button.
- **Safe State**: Ensure state updates can't happen on unmounted components (loose wires).

### Step 4: Inspection (Scaling & Monitoring)
Verify it can handle the load.
- **Bundle Size**: Watch `pnpm build`. Keep payloads light.
- **Render Cycles**: Use DevTools to spot unnecessary re-renders. Use `memo` or signals where appropriate.
- **Memory Leaks**: Ensure all listeners and intervals are cleared in `onDestroy`.

## 4. The Protocol: Repair Loop (Fixing Breakage)

### Step 1: Diagnostics (Gather Information)
Before touching any code, check the diagnostics.
- **Run Checks**: `pnpm check`, `pnpm build`, or `pnpm lint`.
- **Read Logs**: Capture the *exact* error message, filename, and line number.
- **Isolate**: Determine if the error is local (one file) or systemic.

### Step 2: Inspection (Verify State)
Never assume the code state. Tool failures often mean your mental model is out of sync with disk.
- **Read the File (`view_file`)**: Read the specific lines mentioned in the error, plus 10-20 lines of context.
- **Compare**: Does the code on disk match what the error implies?

### Step 3: Trouble Codes (Identify Root Cause)
Classify the issue:
- ⚠️ **Laceration (Syntax Error)**: Missing bracket, semicolon, or invalid character.
- ⚠️ **Infection (Type Error)**: Passing `string` to `number`, missing interface props.
- ⚠️ **Rejection (Content Mismatch)**: You tried to replace code that changed or doesn't exist.
- ⚠️ **Phantom Pain (Logic/Runtime)**: Logic looks correct but behaves wrong (e.g., hidden elements).

### Step 4: Repair (Surgical Intervention)
Apply the fix with extreme prejudice for accuracy.
- **Precision**: Use `replace_file_content` or `multi_replace_file_content`.
- **Context**: When fixing "Content Not Found", use the *exact string* you just read in Step 2.
- **Safety**: Do not delete large blocks unless necessary. Prefer targeted edits.

### Step 5: Test Drive (Verification)
Confirm the repair holds.
- **Re-run Diagnostics**: Run the check command again.
- **Visual Check**: If fixing UI, verify the element is visible/functional.
- **Regression Check**: Ensure no new errors appeared.

## 5. Building Codes (Standards)

### 5.1 The "No-White-Screen" Rule
Every major view (Grid, Player, Sidebar) must be isolated. If the Player crashes, the Grid should still work.
- **Use**: Svelte `<ErrorBoundary>` pattern or safe containment.

### 5.2 The "Any" Prohibition
`any` is banned in new code.
- **Instead of `any`**: Use `unknown` with type guards, or `Partial<T>`.

### 5.3 The "Skeleton" Rule
Async content must show a Skeleton loader, not a blank space, while loading.
- **UX**: Prevents layout shifts (CLS) and indicates liveness.

### 5.4 Specialized Repairs (Protocol)
- **Target Content Not Found**: STOP. `view_file`. Copy-paste exact content. Retry.
- **Ghost Elements**: Remove `opacity`/`hidden`. Add `z-50` & red border. Check parents.
- **Type Errors**: Read interface -> Check usage -> Cast/Guard safely.

## 6. Builder's Creed
> "I build for the future and repair with precision. I replace 'it works' with 'it cannot fail', and I leave every file stronger than I found it."
