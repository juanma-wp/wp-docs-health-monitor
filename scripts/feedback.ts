#!/usr/bin/env node

// Feedback-loop CLI — the human-facing half of the self-improvement cycle.
//
//   1. A validator run produces out/<site>/data/runs/<runId>/results.json.
//   2. `feedback init` emits feedback/<site>/<runId>.json with every reported
//      issue pre-listed and verdict "pending".
//   3. A reviewer fills in verdicts (true-positive / false-positive /
//      duplicate / needs-editorial-judgement), notes, and any missed drift.
//   4. `feedback apply` joins verdicts back to the run, writes
//      feedback/<site>/metrics.json (precision trend), and regenerates the
//      auto-calibration block inside the site-extension prompt so the NEXT
//      run learns from the review. Cross-site FP patterns are reported as
//      promotion candidates (never auto-written to the common prompt).
//
// The GitHub workflow .github/workflows/feedback-loop.yml runs `apply` on
// every push that touches feedback/ and opens a PR with the regenerated
// prompt + metrics, closing the loop without manual steps.
//
// Usage:
//   npm run feedback -- init  --site <site> --run <runId>
//   npm run feedback -- apply [--site <site>]
//   npm run feedback -- metrics --site <site>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { program } from 'commander';

import { loadRunResults, loadSiteFeedback, joinFeedback, type JoinResult, type JoinedIssueFeedback } from '../src/feedback/store.js';
import { computeMetrics } from '../src/feedback/metrics.js';
import { renderCalibrationBlock, spliceCalibration, findPromotionCandidates } from '../src/feedback/calibrate.js';
import type { FeedbackFile } from '../src/feedback/schema.js';
import type { RunResults } from '../src/types/results.js';

const FEEDBACK_ROOT = 'feedback';
const OUT_ROOT      = 'out';
const CONFIG_DIR    = 'config';
const PROMPTS_DIR   = 'prompts';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// The prompt file the calibration block belongs in is whatever the site's
// config wires as systemPromptExtension — single source of truth. Falls back
// to prompts/<site>.md for sites that have not wired an extension yet.
function promptPathForSite(site: string): { path: string; wiredInConfig: boolean } {
  const configPath = join(CONFIG_DIR, `${site}.json`);
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        validator?: { systemPromptExtension?: string };
      };
      const ext = config.validator?.systemPromptExtension;
      if (ext) return { path: ext, wiredInConfig: true };
    } catch {
      // fall through to the default path; apply will still work
    }
  }
  return { path: join(PROMPTS_DIR, `${site}.md`), wiredInConfig: false };
}

function loadJoinedForSite(site: string): { files: FeedbackFile[]; join: JoinResult } {
  const files = loadSiteFeedback(FEEDBACK_ROOT, site);
  const resultsByRunId = new Map<string, RunResults>();
  for (const file of files) {
    const results = loadRunResults(OUT_ROOT, site, file.runId);
    if (results) {
      resultsByRunId.set(file.runId, results);
    } else {
      process.stderr.write(`Warning: no committed results for ${site} run ${file.runId} — its verdicts cannot be joined.\n`);
    }
  }
  return { files, join: joinFeedback(files, resultsByRunId) };
}

function listSites(): string[] {
  if (!existsSync(FEEDBACK_ROOT)) return [];
  return readdirSync(FEEDBACK_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

// --- init -------------------------------------------------------------------

function cmdInit(options: { site: string; run: string; force?: boolean }): void {
  const { site, run } = options;
  const results = loadRunResults(OUT_ROOT, site, run);
  if (!results) fail(`No results found at ${join(OUT_ROOT, site, 'data', 'runs', run, 'results.json')}.`);

  const target = join(FEEDBACK_ROOT, site, `${run}.json`);
  if (existsSync(target) && !options.force) {
    fail(`${target} already exists — it may contain review verdicts. Pass --force to overwrite.`);
  }

  const skeleton: FeedbackFile = {
    site,
    runId: run,
    reviewedAt: new Date().toISOString(),
    issues: results.docs.flatMap(doc =>
      doc.issues.map(issue => ({
        slug:        doc.slug,
        fingerprint: issue.fingerprint,
        verdict:     'pending' as const,
        notes:       `[${issue.severity}/${issue.type}] doc: ${issue.evidence.docSays.slice(0, 120)}`,
        exemplar:    false,
      })),
    ),
    missed: [],
  };

  mkdirSync(join(FEEDBACK_ROOT, site), { recursive: true });
  writeFileSync(target, `${JSON.stringify(skeleton, null, 2)}\n`, 'utf-8');
  process.stdout.write(
    `Wrote ${target} with ${skeleton.issues.length} pending verdict(s).\n` +
    `Review each entry: set verdict, replace the pre-filled notes with your rationale ` +
    `(for false positives the notes become prompt guidance), add missed drift under "missed", ` +
    `then run: npm run feedback -- apply --site ${site}\n`,
  );
}

// --- apply ------------------------------------------------------------------

function applySite(site: string): JoinedIssueFeedback[] {
  const { files, join: joinResult } = loadJoinedForSite(site);
  if (files.length === 0) {
    process.stdout.write(`${site}: no feedback files — skipping.\n`);
    return [];
  }

  for (const u of joinResult.unmatched) {
    process.stderr.write(`Warning: ${site} feedback entry ${u.slug}/${u.fingerprint} (run ${u.runId}) could not be joined: ${u.reason}\n`);
  }

  const metrics = computeMetrics(site, joinResult.joined);
  const metricsPath = join(FEEDBACK_ROOT, site, 'metrics.json');
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf-8');

  const pendingCount = metrics.cumulative.counts.pending;
  const precision = metrics.cumulative.precision;
  process.stdout.write(
    `${site}: ${joinResult.joined.length} joined verdict(s), ` +
    `precision ${precision === null ? 'n/a' : (precision * 100).toFixed(1) + '%'}` +
    `${pendingCount > 0 ? `, ${pendingCount} still pending` : ''} → ${metricsPath}\n`,
  );

  const block = renderCalibrationBlock(joinResult);
  if (block) {
    const { path: promptPath, wiredInConfig } = promptPathForSite(site);
    const existing = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : '';
    const updated = spliceCalibration(existing, block);
    if (updated !== existing) {
      mkdirSync(dirname(promptPath), { recursive: true });
      writeFileSync(promptPath, updated, 'utf-8');
      process.stdout.write(`${site}: calibration block regenerated in ${promptPath}\n`);
    } else {
      process.stdout.write(`${site}: calibration block already up to date in ${promptPath}\n`);
    }
    if (!wiredInConfig) {
      process.stdout.write(
        `${site}: NOTE — wire "validator.systemPromptExtension": "${promptPath}" into ${join(CONFIG_DIR, `${site}.json`)} so runs actually load it.\n`,
      );
    }
  } else {
    process.stdout.write(`${site}: no decisive verdicts yet — prompt untouched.\n`);
  }

  return joinResult.joined;
}

function cmdApply(options: { site?: string }): void {
  const sites = options.site ? [options.site] : listSites();
  if (sites.length === 0) {
    process.stdout.write('No feedback directories found — nothing to apply.\n');
    return;
  }

  const joinedBySite: Record<string, JoinedIssueFeedback[]> = {};
  for (const site of sites) {
    joinedBySite[site] = applySite(site);
  }

  const candidates = findPromotionCandidates(joinedBySite);
  if (candidates.length > 0) {
    process.stdout.write('\nPromotion candidates (recurring FP classes across sites — consider moving a rule up the layer stack per CLAUDE.md "Where a new rule belongs"; automation never edits the common prompt):\n');
    for (const c of candidates) {
      process.stdout.write(`  - issue type "${c.issueType}": ${c.fpCount} false positive(s) across ${c.sites.join(', ')}\n`);
    }
  }
}

// --- metrics ----------------------------------------------------------------

function cmdMetrics(options: { site: string }): void {
  const { join: joinResult } = loadJoinedForSite(options.site);
  const metrics = computeMetrics(options.site, joinResult.joined);
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

// --- wiring -----------------------------------------------------------------

program
  .name('feedback')
  .description('Close the loop between report review feedback and validator prompts');

program
  .command('init')
  .description('Generate a pending-verdict skeleton for a run')
  .requiredOption('--site <site>', 'site slug (config file basename, e.g. gutenberg-block-editor)')
  .requiredOption('--run <runId>', 'run ID (YYYYMMDD-HHmmss)')
  .option('--force', 'overwrite an existing feedback file')
  .action(cmdInit);

program
  .command('apply')
  .description('Join verdicts to runs, write metrics, regenerate calibration blocks')
  .option('--site <site>', 'limit to one site (default: every directory under feedback/)')
  .action(cmdApply);

program
  .command('metrics')
  .description('Print the computed metrics for a site without writing anything')
  .requiredOption('--site <site>', 'site slug')
  .action(cmdMetrics);

program.parse(process.argv);
