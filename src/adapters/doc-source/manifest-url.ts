import matter from 'gray-matter';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import pLimit from 'p-limit';
import type { DocSourceConfig } from '../../config/schema.js';
import { ManifestEntrySchema } from '../../types/index.js';
import type { Doc, DocFetchResult, DocMetrics } from './types.js';

function getBaseUrl(manifestUrl: string): string {
  // For raw.githubusercontent.com, paths in manifests are relative to the repo root
  // e.g., https://raw.githubusercontent.com/owner/repo/ref/docs/manifest.json
  // → base = https://raw.githubusercontent.com/owner/repo/ref/
  const ghMatch = manifestUrl.match(/^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/)/);
  if (ghMatch) return ghMatch[1];
  // Fallback: use the manifest file's directory
  return new URL('.', manifestUrl).href;
}

function deriveSourceUrl(absoluteRawUrl: string, sourceUrlBase?: string): string {
  if (sourceUrlBase) {
    const docsPath = absoluteRawUrl.split('/docs/')[1];
    if (!docsPath) {
      return absoluteRawUrl
        .replace('raw.githubusercontent.com', 'github.com')
        .replace(/\/([^/]+\/[^/]+)\//, '/$1/blob/');
    }
    const clean = docsPath
      .replace(/\/README\.md$/, '/')
      .replace(/\.md$/, '/');
    return `${sourceUrlBase}${clean}`;
  }
  return absoluteRawUrl
    .replace('raw.githubusercontent.com', 'github.com')
    .replace(/\/([^/]+\/[^/]+)\//, '/$1/blob/');
}

async function fetchLastModified(absoluteRawUrl: string): Promise<string | null> {
  const match = absoluteRawUrl.match(
    /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/[^/]+\/(.+)/
  );
  if (!match) return null;
  const [, owner, repo, filePath] = match;
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${filePath}&per_page=1`;
  const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ commit?: { committer?: { date?: string } } }>;
    return data[0]?.commit?.committer?.date ?? null;
  } catch {
    return null;
  }
}

function computeMetrics(content: string): DocMetrics {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const processor = remark().use(remarkParse);
  const tree = processor.parse(content);
  let codeExampleCount = 0;
  let linkCount = 0;
  visit(tree, 'code', () => { codeExampleCount++; });
  visit(tree, 'link', () => { linkCount++; });
  return { wordCount, codeExampleCount, linkCount };
}

export class ManifestUrlDocSource {
  private config: Extract<DocSourceConfig, { type: 'manifest-url' }>;

  constructor(config: DocSourceConfig) {
    if (config.type !== 'manifest-url') {
      throw new Error(`ManifestUrlDocSource requires type "manifest-url", got "${config.type}"`);
    }
    this.config = config as Extract<DocSourceConfig, { type: 'manifest-url' }>;
  }

  async fetchDocs(): Promise<DocFetchResult[]> {
    const { manifestUrl, parentSlug, sourceUrlBase } = this.config;

    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest from ${manifestUrl}: HTTP ${manifestRes.status}`);
    }
    const rawEntries = await manifestRes.json() as unknown[];
    const baseUrl = getBaseUrl(manifestUrl);

    const entries = rawEntries
      .map((raw) => {
        const withAbsolute = {
          ...(raw as Record<string, unknown>),
          markdown_source: new URL(
            (raw as Record<string, string>).markdown_source,
            baseUrl
          ).href,
        };
        return ManifestEntrySchema.safeParse(withAbsolute);
      })
      .filter((r) => r.success)
      .map((r) => r.data!)
      .filter((entry) => entry.parent === parentSlug);

    const limit = pLimit(5);

    const results = await Promise.all(
      entries.map((entry) =>
        limit(async (): Promise<DocFetchResult> => {
          const absoluteRawUrl = entry.markdown_source;
          const sourceUrl = deriveSourceUrl(absoluteRawUrl, sourceUrlBase);

          const res = await fetch(absoluteRawUrl);
          if (!res.ok) {
            return {
              ok: false,
              slug: entry.slug,
              title: entry.title,
              sourceUrl,
              diagnostic: `HTTP ${res.status}: ${absoluteRawUrl}`,
            };
          }

          const raw = await res.text();
          const { content } = matter(raw);
          const metrics = computeMetrics(content);
          const lastModified = await fetchLastModified(absoluteRawUrl);

          const doc: Doc = {
            slug: entry.slug,
            title: entry.title,
            parent: entry.parent ?? null,
            sourceUrl,
            content,
            metrics,
            lastModified,
          };

          return { ok: true, doc };
        })
      )
    );

    return results;
  }
}
