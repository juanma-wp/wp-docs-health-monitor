# docs — Map of Content

Curated index of everything under `docs/`. For project-level context start at the root [README.md](../README.md) and [PLAN.md](../PLAN.md).

## Reading order for orientation

1. [PRD.md](./PRD.md) — what this tool is for and the user stories that justify it.
2. [ARCHITECTURE.md](./ARCHITECTURE.md) — how the system is built and why.
3. [GLOSSARY.md](./GLOSSARY.md) — domain vocabulary used in code, prompts, and reviews.

After that, jump to whichever section below matches your task.

## Foundations — the *why*

- **[PRD.md](./PRD.md)** — problem statement, user stories, implementation decisions, scope boundaries.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — stack, adapter pattern, locked contracts, validator design, results storage, risks.
- **[GLOSSARY.md](./GLOSSARY.md)** — load-bearing terms (`Doc`, `CodeTiers`, `Issue`, `RunResults`, `Claim Type`, …). Edit inline as terms sharpen.

## Operational reference — the *how* — `reference/`

- **[reference/checks.md](./reference/checks.md)** — every drift type the validator runs (`type-signature`, `default-value`, `deprecated-api`, `broken-example`, `nonexistent-name`, `required-optional-mismatch`), with severity and real examples.
- **[reference/mapping-guidelines.md](./reference/mapping-guidelines.md)** — building entries in `mappings/`: source authority order, tier assignment, schema-as-contract guidance.
- **[reference/PER-DOC-PIPELINE.md](./reference/PER-DOC-PIPELINE.md)** — the per-doc loop: what runs for each doc, per-doc independence, the shared prompt cache, cost shape, and why `p-limit(3)`.

## Active plans — the *what's next* — `plans/`

> Each plan carries its own status-snapshot date in its header. Treat anything older than ~2 weeks as suspect — re-check against `out/data/runs/<latest>` and the latest commits before acting on it.

- **[plans/next-steps.md](./plans/next-steps.md)** — *snapshot 2026-05-03.* Current working priority list. Start a session here.
- **[plans/second-site-experiment.md](./plans/second-site-experiment.md)** — *snapshot 2026-05-03.* Design and acceptance criteria for the theme.json second-site test (Priority 5).

## Design notes — *deferred* — `design/`

- **[design/release-pinning.md](./design/release-pinning.md)** — deferred extensions to the applied release-pinning policy (auto-resolve Gutenberg's latest plugin release tag; bundled-into-core snapshot). Trigger: P2-M3.
