export type DocMetrics = {
  wordCount: number;
  codeExampleCount: number;
  linkCount: number;
};

export type Doc = {
  slug: string;
  title: string;
  parent: string | null;
  sourceUrl: string;
  content: string;
  metrics: DocMetrics;
  lastModified: string | null;
  codeElementRefs?: string[];
};

export type DocFetchResult =
  | { ok: true; doc: Doc }
  | { ok: false; slug: string; title: string; sourceUrl: string; diagnostic: string };

export interface DocSource {
  fetchDocs(): Promise<DocFetchResult[]>;
}
