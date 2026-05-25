# Runbook — Manual Publish

## When to use

After any successful `npm run analyze` run, to publish the updated dashboard publicly.

## Prerequisites

- `out/` directory exists (run `npm run analyze` first)
- Git working tree is clean (publish fails if tracked files have uncommitted changes)
- You have push access to `origin`
- Git 2.42 or newer (required for `git worktree add --orphan` on first publish)
- The repository is public
- GitHub Pages is configured to deploy from branch `gh-pages` at `/ (root)`

## Steps

1. Run the analysis (if not already done):
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   npm run analyze -- --config config/gutenberg-block-api.json --output ./out
   ```

2. Verify the output looks correct:
   ```bash
   open out/index.html
   ```

3. Publish:
   ```bash
   npm run publish
   ```

4. Verify the live dashboard:
   - Open your repository's Pages URL (`https://<owner>.github.io/<repo>/`)
   - Check that the run timestamp in the footer matches the run you just published
   - Check that `data/runs/` on the `gh-pages` branch has accumulated all prior runs:
     ```bash
     git fetch origin gh-pages
     git ls-tree -r --name-only origin/gh-pages | grep 'data/runs/'
     ```

## One-time repository setup

1. Ensure the repository is public.
2. In **Settings → Pages**, choose **Deploy from branch**.
3. Select the `gh-pages` branch and the `/ (root)` folder.
4. After the first publish, verify the site is live at `https://<owner>.github.io/<repo>/`.

## How to revert a bad publish

```bash
git fetch origin gh-pages
git checkout gh-pages
git revert HEAD
git push origin gh-pages
git checkout -
```

## Data layout on `gh-pages`

```text
/                          — dashboard HTML (replaced each run)
runs/
  YYYYMMDD-HHmmss/         — archived per-run dashboard pages when present
data/
  history.json             — index of all runs, newest first
  runs/
    YYYYMMDD-HHmmss/
      results.json         — full RunResults for that run (never overwritten)
```
