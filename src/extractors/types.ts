export type SymbolKind =
  | 'function'
  | 'type'
  | 'interface'
  | 'const'
  | 'class'
  | 'enum'
  // Schema-derived names: properties, $defs/definitions, enum string values
  // emitted by the JSON-schema extractor. Indexed for relevance scoring; not
  // rendered as exported API surface.
  | 'schema-property';

export type JSDocInfo = {
  description?: string;
  default?: string;
  deprecated?: string;
  since?: string;
};

export type ExtractedMember = {
  name: string;
  signature: string;
  jsdoc?: JSDocInfo;
};

export type ExtractedSymbol = {
  kind: SymbolKind;
  name: string;
  signature: string;
  // Structured JSDoc (TypeScript extractor). Preferred for richer rendering.
  jsdoc?: JSDocInfo;
  members?: ExtractedMember[];
  // Raw doc comment text (PHP extractor and any extractor that emits the
  // original /** */ block verbatim). Renderer falls back to this when
  // `jsdoc` is absent.
  docComment?: string;
};

export type ExtractedFile = {
  repo: string;
  path: string;
  symbols: ExtractedSymbol[];
};

export type HookKind = 'filter' | 'action';

export type ExtractedHook = {
  kind: HookKind;
  name: string;
  call: string;
  line: number;
  source: string;
};

export type ExtractedHookFile = {
  repo: string;
  path: string;
  hooks: ExtractedHook[];
};

export type DefaultPattern = 'wp_parse_args' | 'object-spread';

export type ExtractedDefault = {
  pattern: DefaultPattern;
  line: number;
  source: string;
};

export type ExtractedDefaultFile = {
  repo: string;
  path: string;
  defaults: ExtractedDefault[];
};

export type ExtractedSchema = {
  repo: string;
  path: string;
  content: string;
  truncated: boolean;
};
