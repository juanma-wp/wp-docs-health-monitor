export type SymbolKind = 'function' | 'type' | 'interface' | 'const' | 'class' | 'enum';

export type ExtractedSymbol = {
  kind: SymbolKind;
  name: string;
  signature: string;
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
