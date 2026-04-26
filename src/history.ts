import { createHash } from 'crypto';

// Uses structured fields only — not LLM-generated text — so fingerprints are
// stable across runs even when Claude paraphrases the same finding differently.
export function fingerprintIssue(
  slug: string,
  type: string,
  codeRepo: string,
  codeFile: string,
): string {
  const input = `${slug}|${type}|${codeRepo}|${codeFile}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
