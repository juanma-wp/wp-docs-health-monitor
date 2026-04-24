import matter from 'gray-matter';
import { remark } from 'remark';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import pLimit from 'p-limit';

import { ManifestEntrySchema } from '../../types/mapping.js';
import type { DocSource, DocFetchResult, Doc } from './types.js';

interface ManifestUrlConfig {
  manifestUrl: string;
  parentSlug: string;
  sourceUrlBase?: string;
}

function deriveSourceUrl(absoluteRawUrl: string, sourceUrlBase?: string): string {
  if (sourceUrlBase) {
    const parts = absoluteRawUrl.split('/docs/');
    if (parts.length >= 2) {
      const docsPath = parts[1];
      const clean = docsPath
        .replace(/\/README\.md$/, '/')
        .replace(/\.md$/, '/');
      return `${sourceUrlBase}${clean}`;
    }
    // No /docs/ segment — fall through to GitHub UI URL fallback
  }
  // Fallback: GitHub UI URL
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
    const data = await res.json() as any[];
    return data[0]?.commit?.committer?.date ?? null;
  } catch {
    return null;
  }
}

function computeMetrics(content: string): { wordCount: number; codeExampleCount: number; linkCount: number } {
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  let codeExampleCount = 0;
  let linkCount = 0;

  const processor = remark().use(remarkParse);
  const tree = processor.parse(content);

  visit(tree, 'code', () => { codeExampleCount++; });
  visit(tree, 'link', () => { linkCount++; });

  return { wordCount, codeExampleCount, linkCount };
}

export class ManifestUrlDocSource implements DocSource {
  private readonly config: ManifestUrlConfig;

  constructor(config: ManifestUrlConfig) {
    this.config = config;
  }

  async fetchDocs(): Promise<DocFetchResult[]> {
    const { manifestUrl, parentSlug, sourceUrlBase } = this.config;

    let rawEntries: unknown[];
    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) {
        console.error(`ManifestUrlDocSource: manifest fetch failed with HTTP ${res.status}: ${manifestUrl}`);
        return [];
      }
      rawEntries = await res.json() as unknown[];
    } catch (err) {
      console.error(`ManifestUrlDocSource: manifest fetch error: ${err}`);
      return [];
    }

    if (!Array.isArray(rawEntries)) {
      console.error('ManifestUrlDocSource: manifest is not an array');
      return [];
    }

    // Resolve relative markdown_source to absolute URL, then validate
    const resolvedEntries = rawEntries.flatMap((raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return [];
      const entry = raw as Record<string, unknown>;
      if (typeof entry.markdown_source === 'string') {
        entry.markdown_source = new URL(entry.markdown_source, manifestUrl).href;
      }
      const parsed = ManifestEntrySchema.safeParse(entry);
      if (!parsed.success) return [];
      return [parsed.data];
    });

    // Filter by parentSlug
    const filtered = resolvedEntries.filter(e => e.parent === parentSlug);

    const limit = pLimit(5);

    const results = await Promise.all(
      filtered.map(entry =>
        limit(async (): Promise<DocFetchResult> => {
          const { slug, title, markdown_source, parent } = entry;
          const sourceUrl = deriveSourceUrl(markdown_source, sourceUrlBase);

          let rawContent: string;
          try {
            const res = await fetch(markdown_source);
            if (!res.ok) {
              return {
                ok: false,
                slug,
                title,
                sourceUrl,
                diagnostic: `HTTP ${res.status}: ${markdown_source}`,
              };
            }
            rawContent = await res.text();
          } catch (err) {
            return {
              ok: false,
              slug,
              title,
              sourceUrl,
              diagnostic: `Fetch error: ${err}`,
            };
          }

          // Strip frontmatter
          const { content } = matter(rawContent);

          // Compute metrics
          const metrics = computeMetrics(content);

          // Fetch last modified
          const lastModified = await fetchLastModified(markdown_source);

          const doc: Doc = {
            slug,
            title,
            parent,
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
