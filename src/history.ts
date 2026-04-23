import { createHash } from 'crypto';

export function fingerprintIssue(
  slug: string,
  type: string,
  codeFile: string,
  issueText: string,
): string {
  const normalized = issueText
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const input = `${slug}|${type}|${codeFile}|${normalized}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
