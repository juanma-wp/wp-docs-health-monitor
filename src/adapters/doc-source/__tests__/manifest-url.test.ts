import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ManifestUrlDocSource } from '../manifest-url.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../../../tests/fixtures');

// Load fixture content
const miniManifest = JSON.parse(readFileSync(resolve(fixturesDir, 'mini-manifest.json'), 'utf-8'));
const sampleDoc    = readFileSync(resolve(fixturesDir, 'sample-doc.md'), 'utf-8');

const MANIFEST_URL = 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/manifest.json';
const DOC_URL      = `https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/block-api/block-attributes.md`;
const COMMITS_URL  = `https://api.github.com/repos/WordPress/gutenberg/commits?path=docs/block-api/block-attributes.md&per_page=1`;

function makeFetchMock(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (url: string) => {
    const urlStr = String(url);
    if (overrides[urlStr]) return overrides[urlStr]();
    if (urlStr === MANIFEST_URL) {
      return new Response(JSON.stringify(miniManifest), { status: 200 });
    }
    if (urlStr === DOC_URL) {
      return new Response(sampleDoc, { status: 200 });
    }
    if (urlStr.startsWith('https://api.github.com/repos/') && urlStr.includes('/commits')) {
      return new Response(
        JSON.stringify([{ commit: { committer: { date: '2024-01-01T00:00:00Z' } } }]),
        { status: 200 }
      );
    }
    return new Response('Not Found', { status: 404 });
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchMock());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Filtering by parentSlug
// ---------------------------------------------------------------------------

describe('ManifestUrlDocSource — filtering', () => {
  it('returns exactly 1 successful result from a 3-entry manifest when filtering by parentSlug', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].doc.slug).toBe('block-attributes');
    }
  });

  it('returns 0 results when no entries match parentSlug', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'nonexistent',
    });
    const results = await source.fetchDocs();
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Relative markdown_source resolution
// ---------------------------------------------------------------------------

describe('ManifestUrlDocSource — URL resolution', () => {
  it('resolves relative markdown_source to absolute URL before validation', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    // If relative URL was not resolved, ManifestEntrySchema would reject it
    // and we'd get 0 results. Getting 1 result proves resolution happened.
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('ManifestUrlDocSource — metrics', () => {
  it('codeExampleCount === 2 and linkCount === 3 on the sample fixture', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      const { metrics } = results[0].doc;
      expect(metrics.codeExampleCount).toBe(2);
      expect(metrics.linkCount).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 404 response
// ---------------------------------------------------------------------------

describe('ManifestUrlDocSource — error handling', () => {
  it('returns { ok: false } when doc fetch returns 404; diagnostic includes URL and status code', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      [DOC_URL]: () => new Response('Not Found', { status: 404 }),
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].diagnostic).toContain('404');
      expect(results[0].diagnostic).toContain(DOC_URL);
    }
  });

  it('lastModified is null when GitHub Commits API call throws', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      [COMMITS_URL]: () => { throw new Error('Network error'); },
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].doc.lastModified).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// sourceUrl derivation
// ---------------------------------------------------------------------------

describe('ManifestUrlDocSource — sourceUrl', () => {
  it('uses sourceUrlBase transform when configured', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
      sourceUrlBase: 'https://developer.wordpress.org/block-editor/',
    });
    const results = await source.fetchDocs();
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].doc.sourceUrl).toContain('developer.wordpress.org');
    }
  });

  it('falls back to GitHub UI URL when sourceUrlBase is absent', async () => {
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].doc.sourceUrl).toContain('github.com');
      expect(results[0].doc.sourceUrl).toContain('/blob/');
    }
  });
});
