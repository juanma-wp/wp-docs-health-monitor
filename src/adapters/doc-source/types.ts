export type DocMetrics = {
  wordCount: number;
  codeExampleCount: number;
  linkCount: number;
};

export type Doc = {
  slug: string;
  title: string;
  parent: string | null;
  sourceUrl: string;           // developer.wordpress.org URL (or GitHub UI URL if sourceUrlBase not set)
  content: string;             // raw markdown, frontmatter stripped
  metrics: DocMetrics;
  lastModified: string | null; // ISO 8601 from GitHub Commits API; null on failure
  codeElementRefs?: string[];  // optional — populated by Phase 2 symbol-search mapper
};

export type DocFetchResult =
  | { ok: true;  doc: Doc }
  | { ok: false; slug: string; title: string; sourceUrl: string; diagnostic: string };

export interface DocSource {
  fetchDocs(): Promise<DocFetchResult[]>;
}
