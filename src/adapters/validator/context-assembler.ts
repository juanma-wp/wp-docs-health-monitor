import type { Doc } from '../doc-source/types.js';
import type { CodeTiers, CodeFile } from '../../types/mapping.js';
import type { DocResult } from '../../types/results.js';
import type { CodeSource } from '../code-source/types.js';

const TOKEN_BUDGET = 50_000;

type FileBlock = {
  repo: string;
  path: string;
  content: string;
  tier: 'primary' | 'secondary' | 'context';
};

export type AssembledContext = {
  fileBlocks: FileBlock[];
  relatedCode: DocResult['relatedCode'];
  estimatedTokens: number;
  diagnostics: string[];
  missingSymbols: string[];
};

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'php':
      return 'php';
    case 'css':
    case 'scss':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return '';
  }
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// Extract backtick-wrapped identifiers from doc markdown (e.g. `registerBlockType`)
export function extractDocSymbols(docContent: string): string[] {
  const matches = docContent.matchAll(/`([^`\s][^`]*[^`\s]|[^`\s])`/g);
  const seen = new Set<string>();
  for (const [, symbol] of matches) {
    if (symbol) seen.add(symbol);
  }
  return [...seen];
}

// Return symbols that do not appear literally in any assembled source file
export function findMissingSymbols(symbols: string[], fileBlocks: FileBlock[]): string[] {
  const allCode = fileBlocks.map(fb => fb.content).join('\n');
  return symbols.filter(sym => !allCode.includes(sym));
}

export function formatContextForClaude(fileBlocks: FileBlock[]): string {
  return fileBlocks
    .map(fb => {
      const lang = inferLanguage(fb.path);
      return `### [${fb.repo}] ${fb.path}\n\`\`\`${lang}\n${fb.content}\n\`\`\``;
    })
    .join('\n\n');
}

export async function assembleContext(
  doc: Doc,
  codeTiers: CodeTiers,
  codeSources: Record<string, CodeSource>,
): Promise<AssembledContext> {
  const fileBlocks: FileBlock[] = [];
  const relatedCode: DocResult['relatedCode'] = [];
  const diagnostics: string[] = [];
  let cumulativeTokens = 0;
  let budgetExceeded = false;

  const tiers: Array<{ name: 'primary' | 'secondary' | 'context'; files: CodeFile[] }> = [
    { name: 'primary',   files: codeTiers.primary },
    { name: 'secondary', files: codeTiers.secondary },
    { name: 'context',   files: codeTiers.context },
  ];

  for (const { name: tierName, files } of tiers) {
    for (const file of files) {
      // If budget is already exceeded for non-primary tiers, mark as excluded
      if (budgetExceeded && tierName !== 'primary') {
        relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        continue;
      }

      let content: string;
      try {
        content = await codeSources[file.repo].readFile(file.path);
      } catch (err) {
        const msg = `Could not read ${tierName} file ${file.repo}:${file.path}`;
        diagnostics.push(msg);
        if (tierName === 'primary') {
          // Always attempt primary files; record diagnostic on failure
          relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        }
        continue;
      }

      const fileTokens = estimateTokens(content);

      // For secondary/context: stop adding if budget would be exceeded
      if (tierName !== 'primary' && cumulativeTokens + fileTokens > TOKEN_BUDGET) {
        budgetExceeded = true;
        relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: false });
        continue;
      }

      cumulativeTokens += fileTokens;
      fileBlocks.push({ repo: file.repo, path: file.path, content, tier: tierName });
      relatedCode.push({ repo: file.repo, file: file.path, tier: tierName, includedInAnalysis: true });
    }
  }

  const symbols = extractDocSymbols(doc.content);
  const missingSymbols = findMissingSymbols(symbols, fileBlocks);

  return {
    fileBlocks,
    relatedCode,
    estimatedTokens: cumulativeTokens,
    diagnostics,
    missingSymbols,
  };
}
