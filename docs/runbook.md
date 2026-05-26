# Dashboard deploy runbook

Operator guide for the current GitHub Pages flow. This covers the CI-driven deploy path implemented by [`scripts/rebuild.ts`](../scripts/rebuild.ts) and [`.github/workflows/deploy-dashboard.yml`](../.github/workflows/deploy-dashboard.yml).

## One-time GitHub Pages setup

On a new fork or repo:

1. Open **Settings → Pages**.
2. Under **Source**, choose **GitHub Actions**.
3. Save.

Published URL pattern:

- `https://<owner>.github.io/<repo>/`

## What triggers a deploy

The [`deploy-dashboard`](../.github/workflows/deploy-dashboard.yml) workflow runs when:

- a commit lands on `main` and changes any of:
  - `out/**/results.json`
  - `out/**/site.json`
  - `config/*.json`
  - `src/dashboard/**`
  - `src/types/**`
  - `scripts/rebuild.ts`
  - `package.json`
  - `package-lock.json`
  - `.github/workflows/deploy-dashboard.yml`
- an operator starts it manually with **Actions → deploy-dashboard → Run workflow**

## Operator loop

For normal content updates:

1. Run `npm run analyze`.
2. Review the generated `out/<slug>/data/runs/<id>/results.json`.
3. If site identity changed, review `out/<slug>/data/site.json` too.
4. Commit the new `results.json` (and `site.json` if it changed) to `main`.
5. Push to GitHub.
6. CI runs `npm run rebuild` and deploys the rebuilt dashboard to GitHub Pages.

Important:

- `out/<slug>/data/runs/<id>/results.json` is the source of truth for run history.
- `out/<slug>/data/history.json` is derived by `scripts/rebuild.ts` from committed `results.json` files.
- Do **not** hand-edit `data/history.json`.
- Do **not** commit `data/history.json` or generated HTML files; CI rebuilds them.

## Where to watch a deploy

Watch the run in the **Actions** tab:

- workflow: **deploy-dashboard**

Open the latest run to inspect the `build` and `deploy` jobs, then use the Pages environment link once deployment completes.

## Verify a deploy

1. Open the Pages URL: `https://<owner>.github.io/<repo>/`
2. Find the latest run shown in the dashboard.
3. Confirm its timestamp matches the most recent committed `out/<slug>/data/runs/<id>/results.json` on `main`.

If the timestamp matches, the deployed dashboard is serving the latest committed run data.

## Roll back a bad deploy

If a bad `results.json` was committed:

1. Revert the offending commit on `main`.
2. Push the revert.
3. Wait for `deploy-dashboard` to run again automatically.
4. Re-open the Pages URL and verify the dashboard now reflects the restored latest good run.
