export type SymbolKind = 'function' | 'type' | 'interface' | 'const' | 'class' | 'enum';

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
  jsdoc?: JSDocInfo;
  members?: ExtractedMember[];
};

export type ExtractedFile = {
  repo: string;
  path: string;
  symbols: ExtractedSymbol[];
};
