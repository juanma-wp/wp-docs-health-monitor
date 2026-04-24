import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestUrlDocSource } from '../manifest-url.js';
import type { DocSourceConfig } from '../../../config/schema.js';

const miniManifest = [
  {
    slug: 'block-attributes',
    title: 'Block Attributes',
    markdown_source: 'docs/reference-guides/block-api/block-attributes.md',
    parent: 'block-api',
  },
  {
    slug: 'block-metadata',
    title: 'Block Metadata',
    markdown_source: 'docs/reference-guides/block-api/block-metadata.md',
    parent: 'other-parent',
  },
  {
    slug: 'getting-started',
    title: 'Getting Started',
    markdown_source: 'docs/getting-started/index.md',
    parent: null,
  },
];

const sampleDoc = `---
title: Block Attributes
slug: block-attributes
---

# Block Attributes

This is a sample doc.

\`\`\`php
function my_block_attributes() {
  return array('content' => array('type' => 'string'));
}
\`\`\`

\`\`\`js
const attributes = { url: { type: 'string' } };
\`\`\`

Check out the [Block API reference](https://developer.wordpress.org/block-editor/).
Visit [WordPress](https://wordpress.org/) for more info.
Also see [Gutenberg GitHub](https://github.com/WordPress/gutenberg).
`;

const MANIFEST_URL = 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/manifest.json';
const DOC_URL = 'https://raw.githubusercontent.com/WordPress/gutenberg/trunk/docs/reference-guides/block-api/block-attributes.md';
const GITHUB_COMMITS_URL_PATTERN = /api\.github\.com\/repos\/.*\/commits/;

function makeConfig(extra: Partial<Extract<DocSourceConfig, { type: 'manifest-url' }>> = {}): DocSourceConfig {
  return {
    type: 'manifest-url',
    manifestUrl: MANIFEST_URL,
    parentSlug: 'block-api',
    ...extra,
  };
}

describe('ManifestUrlDocSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters by parentSlug and returns exactly 1 successful result', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    const results = await source.fetchDocs();

    const successful = results.filter((r) => r.ok);
    expect(successful).toHaveLength(1);
    expect(successful[0]).toMatchObject({ ok: true });
    if (successful[0].ok) {
      expect(successful[0].doc.slug).toBe('block-attributes');
    }
  });

  it('resolves relative markdown_source to absolute URL before validation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    await source.fetchDocs();

    // The absolute URL for the matching entry should have been fetched
    expect(fetchMock).toHaveBeenCalledWith(DOC_URL);
  });

  it('computes correct codeExampleCount and linkCount', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    const results = await source.fetchDocs();

    const success = results.find((r) => r.ok);
    expect(success?.ok).toBe(true);
    if (success?.ok) {
      expect(success.doc.metrics.codeExampleCount).toBe(2);
      expect(success.doc.metrics.linkCount).toBe(3);
    }
  });

  it('returns { ok: false } when doc fetch returns 404', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    const results = await source.fetchDocs();

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) {
      expect(results[0].diagnostic).toContain('404');
      expect(results[0].diagnostic).toContain(DOC_URL);
    }
  });

  it('lastModified is null when GitHub Commits API throws', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    const results = await source.fetchDocs();

    const success = results.find((r) => r.ok);
    expect(success?.ok).toBe(true);
    if (success?.ok) {
      expect(success.doc.lastModified).toBeNull();
    }
  });

  it('uses sourceUrlBase transform when configured', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(
      makeConfig({ sourceUrlBase: 'https://developer.wordpress.org/block-editor/reference-guides/block-api/' })
    );
    const results = await source.fetchDocs();

    const success = results.find((r) => r.ok);
    expect(success?.ok).toBe(true);
    if (success?.ok) {
      expect(success.doc.sourceUrl).toContain('developer.wordpress.org');
      expect(success.doc.sourceUrl).not.toContain('raw.githubusercontent.com');
    }
  });

  it('falls back to GitHub UI URL when sourceUrlBase is absent', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MANIFEST_URL) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(miniManifest),
        });
      }
      if (url === DOC_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(sampleDoc),
        });
      }
      if (GITHUB_COMMITS_URL_PATTERN.test(url as string)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const source = new ManifestUrlDocSource(makeConfig());
    const results = await source.fetchDocs();

    const success = results.find((r) => r.ok);
    expect(success?.ok).toBe(true);
    if (success?.ok) {
      expect(success.doc.sourceUrl).toContain('github.com');
      expect(success.doc.sourceUrl).toContain('/blob/');
    }
  });
});
