# wp-docs-health-monitor

Automated health monitor for WordPress-hosted developer documentation sites.

The tool compares docs (from markdown in a repo or from a WordPress REST API) against their underlying source code and produces an evidence-backed, scored report of drift — outdated APIs, missing parameters, broken examples, deprecated usage — with suggested fixes.

## Status

🌱 Early. The first design proposal lives in [`PLAN.md`](./PLAN.md) (proposed via PR — review, challenge, and refine there before any implementation starts).

## Why

The Block Editor Handbook alone has 150+ editorial docs that silently drift from Gutenberg source. Contributors who want to improve docs lack a prioritized punch list. The blog post behind this project: https://radicalupdates.wordpress.com/2026/04/15/block-editor-docs-health-monitor/

## How (high level)

1. **Adapter-based pipeline:** pluggable `DocSource`, `CodeSource`, `DocCodeMapper`, `Validator`.
2. **Claude two-pass validation** with prompt caching + quoted-evidence requirements to keep false positives down.
3. **Static HTML dashboard** — one file per doc, color-coded health scores, linkable deep-URLs for fixing.
4. **GitHub Action** for weekly cron + manual dispatch (stretch for the PoC).

See [`PLAN.md`](./PLAN.md) for the full design, issue breakdown, and verification plan.

## License

MIT
