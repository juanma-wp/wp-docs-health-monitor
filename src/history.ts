import { createHash } from 'node:crypto';

export function fingerprintIssue(
  slug: string,
  type: string,
  codeFile: string,
  issueText: string,
): string {
  const normalized = issueText.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = `${slug}|${type}|${codeFile}|${normalized}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
