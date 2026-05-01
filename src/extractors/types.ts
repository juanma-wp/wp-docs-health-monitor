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
