import type { Doc } from '../doc-source/types.js';
import type { CodeTiers } from '../../types/mapping.js';
import type { DocResult } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';

export interface Validator {
  validateDoc(
    doc: Doc,
    codeTiers: CodeTiers,
    codeSources: Record<string, CodeSource>,
  ): Promise<DocResult>;
}
