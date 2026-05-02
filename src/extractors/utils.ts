// Shared helpers used by multiple extractors. Keep this file dependency-light
// (no imports from other extractor modules) so it can be safely imported from
// any extractor without circular-dependency risk.

// Returns the 1-indexed line number containing `index` in `content`.
// O(n) scan; callers should prefer to compute line numbers in a single pass
// over a buffer rather than calling this in a tight loop.
export function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}
