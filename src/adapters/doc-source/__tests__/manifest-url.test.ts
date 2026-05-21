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

  it('returns [] when manifest fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url) === MANIFEST_URL) throw new Error('Network failure');
      return new Response('', { status: 200 });
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toEqual([]);
  });

  it('returns [] when manifest fetch returns a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url) === MANIFEST_URL) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response('', { status: 200 });
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toEqual([]);
  });

  it('returns [] when manifest body is not a JSON array', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url) === MANIFEST_URL) {
        return new Response(JSON.stringify({ not: 'an array' }), { status: 200 });
      }
      return new Response('', { status: 200 });
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toEqual([]);
  });

  it('silently drops manifest entries that fail ManifestEntrySchema validation', async () => {
    // Mixed manifest: one valid entry + two that should be rejected by the schema.
    // The adapter must drop the invalid ones and still return the valid one.
    const validEntry = {
      slug: 'block-attributes',
      title: 'Block Attributes',
      markdown_source: DOC_URL,
      parent: 'block-api',
    };
    const missingSlugEntry = {
      title: 'No Slug',
      markdown_source: DOC_URL,
      parent: 'block-api',
    };
    const wrongTypesEntry = {
      slug: 42,
      title: 'Wrong Types',
      markdown_source: 'not-a-url',
      parent: 'block-api',
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr === MANIFEST_URL) {
        return new Response(
          JSON.stringify([validEntry, missingSlugEntry, wrongTypesEntry]),
          { status: 200 }
        );
      }
      if (urlStr === DOC_URL) return new Response(sampleDoc, { status: 200 });
      if (urlStr.startsWith('https://api.github.com/')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }));

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

  it('lastModified is null when markdown_source is not a raw.githubusercontent URL', async () => {
    // fetchLastModified has an early-return when the URL does not match the
    // raw.githubusercontent.com pattern. Exercise that path explicitly.
    const nonGhUrl = 'https://example.org/docs/block-api/block-attributes.md';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr === MANIFEST_URL) {
        return new Response(JSON.stringify([{
          slug: 'block-attributes',
          title: 'Block Attributes',
          markdown_source: nonGhUrl,
          parent: 'block-api',
        }]), { status: 200 });
      }
      if (urlStr === nonGhUrl) return new Response(sampleDoc, { status: 200 });
      return new Response('Not Found', { status: 404 });
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    expect(results).toHaveLength(1);
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

  it('falls back to GitHub UI URL when sourceUrlBase is set but the URL has no /docs/ segment', async () => {
    const urlWithoutDocsSegment = 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/foo.md';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr === MANIFEST_URL) {
        return new Response(JSON.stringify([{
          slug: 'foo-doc',
          title: 'Foo Doc',
          markdown_source: urlWithoutDocsSegment,
          parent: 'block-api',
        }]), { status: 200 });
      }
      if (urlStr === urlWithoutDocsSegment) {
        return new Response('# Foo\nContent.', { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }));

    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
      sourceUrlBase: 'https://developer.wordpress.org/block-editor/',
    });
    const results = await source.fetchDocs();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    if (results[0].ok) {
      expect(results[0].doc.sourceUrl).toContain('github.com');
      expect(results[0].doc.sourceUrl).toContain('/blob/');
    }
  });
});

// ---------------------------------------------------------------------------
// Ignore mechanism (per-slug + per-subtree)
// ---------------------------------------------------------------------------

// Flat fixture: two siblings under `block-api`. Used for the basic
// drop-direct-child cases where descendants are not in play.
const flatManifest = [
  { slug: 'block-api',        title: 'Block API',  markdown_source: '../docs/block-api/README.md',      parent: null      },
  { slug: 'block-attributes', title: 'Attributes', markdown_source: '../docs/block-api/attributes.md',  parent: 'block-api' },
  { slug: 'block-bindings',   title: 'Bindings',   markdown_source: '../docs/block-api/bindings.md',    parent: 'block-api' },
];

// Deep fixture: ancestor chain block-api → block-bindings → binding-source-1 → sub-detail.
// Used to verify the transitive ancestor walk: `sub-detail` is two levels below
// `block-bindings`. Scoping `parentSlug: 'binding-source-1'` puts `sub-detail` in the
// direct-children slice, so the only thing that can drop it is the walk reaching
// the ignored `block-bindings` root.
const deepManifest = [
  { slug: 'block-api',        title: 'Block API',  markdown_source: '../docs/block-api/README.md',         parent: null               },
  { slug: 'block-bindings',   title: 'Bindings',   markdown_source: '../docs/block-api/bindings.md',       parent: 'block-api'        },
  { slug: 'binding-source-1', title: 'Source 1',   markdown_source: '../docs/block-api/source-1.md',       parent: 'block-bindings'   },
  { slug: 'sub-detail',       title: 'Sub Detail', markdown_source: '../docs/block-api/sub-detail.md',     parent: 'binding-source-1' },
];

function mockManifestFetch(manifest: unknown[]): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const urlStr = String(url);
    if (urlStr === MANIFEST_URL) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (urlStr.startsWith('https://api.github.com/')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    // Any .md fetch returns the sample doc — content is not under test here.
    return new Response(sampleDoc, { status: 200 });
  }));
}

describe('ManifestUrlDocSource — ignore', () => {
  it('omitted ignore is a no-op (existing direct-children behavior preserved)', async () => {
    mockManifestFetch(flatManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
    });
    const results = await source.fetchDocs();
    const slugs = results.flatMap(r => r.ok ? [r.doc.slug] : []);
    expect(slugs.sort()).toEqual(['block-attributes', 'block-bindings']);
  });

  it('ignore.slugs drops the named entry from the direct-children slice', async () => {
    mockManifestFetch(flatManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
      ignore: { slugs: ['block-bindings'] },
    });
    const results = await source.fetchDocs();
    const slugs = results.flatMap(r => r.ok ? [r.doc.slug] : []);
    expect(slugs).toEqual(['block-attributes']);
  });

  it('ignore.subtrees drops the subtree-root entry itself', async () => {
    // The root is included in the subtree, so listing a slug in `subtrees`
    // also drops the entry whose own slug matches.
    mockManifestFetch(flatManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
      ignore: { subtrees: ['block-bindings'] },
    });
    const results = await source.fetchDocs();
    const slugs = results.flatMap(r => r.ok ? [r.doc.slug] : []);
    expect(slugs).toEqual(['block-attributes']);
  });

  it('ignore.subtrees drops a descendant whose ancestor chain hits the ignored root (depth ≥ 2)', async () => {
    // sub-detail is a direct child of binding-source-1 (in scope under parentSlug).
    // Its ancestor chain reaches block-bindings two levels up. ignore.subtrees
    // for block-bindings must drop sub-detail via the transitive walk.
    mockManifestFetch(deepManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'binding-source-1',
      ignore: { subtrees: ['block-bindings'] },
    });
    const results = await source.fetchDocs();
    expect(results).toEqual([]);
  });

  it('ignore.slugs does NOT drop descendants of the named slug (contrast with subtrees)', async () => {
    // Same scope as the previous test, same fixture. Switching from
    // `subtrees` to `slugs` for the same name must NOT drop sub-detail —
    // because per-slug ignore drops only the named entry, not its descendants.
    // This test pins the semantic distinction between the two fields.
    mockManifestFetch(deepManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'binding-source-1',
      ignore: { slugs: ['block-bindings'] },
    });
    const results = await source.fetchDocs();
    const slugs = results.flatMap(r => r.ok ? [r.doc.slug] : []);
    expect(slugs).toEqual(['sub-detail']);
  });

  it('ignoring a slug not present in the manifest is a silent no-op', async () => {
    mockManifestFetch(flatManifest);
    const source = new ManifestUrlDocSource({
      manifestUrl: MANIFEST_URL,
      parentSlug: 'block-api',
      ignore: { slugs: ['nonexistent-slug'], subtrees: ['also-nonexistent'] },
    });
    const results = await source.fetchDocs();
    const slugs = results.flatMap(r => r.ok ? [r.doc.slug] : []);
    expect(slugs.sort()).toEqual(['block-attributes', 'block-bindings']);
  });
});
