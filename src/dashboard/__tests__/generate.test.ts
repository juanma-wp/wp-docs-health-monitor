import { describe, it, expect, afterAll } from 'vitest';
import { readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../generate.js';
import type { RunResults } from '../../types/results.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../');
const mockResultsPath = join(projectRoot, 'examples', 'mock-results.json');

// Use a project-relative output dir instead of /tmp
const outDir = join(projectRoot, `out-test-${Math.random().toString(36).slice(2, 9)}`);

async function loadMockResults(): Promise<RunResults> {
  const raw = JSON.parse(await readFile(mockResultsPath, 'utf-8'));
  return raw as RunResults;
}

afterAll(async () => {
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
  }
});

describe('generate()', () => {
  it('creates expected HTML files', async () => {
    const results = await loadMockResults();
    await generate(results, outDir);

    const expectedFiles = [
      'index.html',
      'doc/block-metadata.html',
      'doc/block-registration.html',
      'doc/block-attributes.html',
      'doc/block-supports.html',
      'folder/block-api.html',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(outDir, file)), `Expected ${file} to exist`).toBe(true);
    }
  });

  it('index.html contains block-metadata and overall health score', async () => {
    const results = await loadMockResults();
    const content = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(content).toContain('block-metadata');
    expect(content).toContain(String(results.overallHealth));
  });

  it('doc/block-metadata.html contains "healthy" and not "critical" as a status', async () => {
    const content = await readFile(join(outDir, 'doc/block-metadata.html'), 'utf-8');
    expect(content).toContain('healthy');
    // block-metadata has no critical issues; status badge should not say critical
    expect(content).not.toMatch(/text-red-800[^<]*>critical/);
  });

  it('doc/block-attributes.html contains "critical" and at least one issue docSays text', async () => {
    const results = await loadMockResults();
    const content = await readFile(join(outDir, 'doc/block-attributes.html'), 'utf-8');
    expect(content).toContain('critical');
    const attrDoc = results.docs.find(d => d.slug === 'block-attributes');
    expect(attrDoc).toBeDefined();
    const firstIssue = attrDoc!.issues[0];
    // The docSays text should appear (HTML-escaped) in the output
    // Use a segment from the text that contains no characters affected by HTML escaping
    expect(content).toContain('to store attribute values in post meta');
  });

  it('all generated files include the Tailwind CDN script', async () => {
    const files = [
      'index.html',
      'doc/block-metadata.html',
      'doc/block-attributes.html',
      'folder/block-api.html',
    ];
    for (const file of files) {
      const content = await readFile(join(outDir, file), 'utf-8');
      expect(content, `${file} should include Tailwind CDN`).toContain(
        '<script src="https://cdn.tailwindcss.com"></script>',
      );
    }
  });
});
