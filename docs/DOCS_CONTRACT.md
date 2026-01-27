# Documentation Contract

This document defines the invariants and rules for all documentation in the Smol Frontend repository. Adherence ensures that both humans and AI agents can navigate, verify, and extend the project with zero ambiguity.

## 📐 Structural Invariants
1. **SSOT Alignment**: No doc may restate a fact defined in [STATE_OF_WORLD.md](STATE_OF_WORLD.md) without linking to it. Facts include ports, versions, endpoints, and chunk sizes.
2. **Bi-directional Navigation**: Every doc in `docs/` must be listed in [INDEX.md](INDEX.md).
3. **Anchor Stability**: Headings used as targets for external links must be stable.
4. **Link Health**: All relative links must resolve. Dead links are a build failure (`pnpm docs:test`).

## 🗣️ Canonical Vocabulary
Use these terms exclusively to prevent drifting concepts:
| Term | Definition |
| :--- | :--- |
| **Passkey Wallet** | The WebAuthn-secured smart account contract on Soroban. |
| **Relayer** | The proxy service (OpenZeppelin or KaleFarm) that submits signed XDRs. |
| **Snapshot** | The pre-built `GalacticSnapshot.json` used for static/hybrid hydration. |
| **Live API** | Fresh data fetched from `api.smol.xyz`. |
| **Create Flow** | The sequence of AI track generation -> detail fetch -> eventual consistency. |
| **Labs** | Experimental developer surfaces (Dev Preview) with non-production constraints. |

## 🧪 Claim Standards
Every technical claim must be verifiable:
1. **Verified Command**: A command that has been run and confirmed via `pnpm docs:test`.
2. **Code Truth**: A statement proven by a symbol or path existing in the current branch.
3. **Known Uncertainty**: Explicitly marked as `Nature: Spec / Research` or `[UNVERIFIED]`.

## 🔄 Flow & State Diagrams
- Processes (Auth, TX, Routing) MUST link to a Mermaid diagram in `docs/STATEDIAGRAM.md` or `docs/diagrams/`.
- Diagram state names must use the **Canonical Vocabulary**.

## 📜 Metadata Block
Every "Hardened" doc must begin with:
```markdown
<!--
CONTRACT:
- SSOT: [STATE_OF_WORLD.md | Subordinate]
- AUDIENCE: [Dev | User | Agent]
- NATURE: [Current | Historical | Spec | Research]
- LAST_HARDENED: YYYY-MM-DD
- VERIFICATION_METHOD: [Link check | Claim check | State trace]
-->
```

