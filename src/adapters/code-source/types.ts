export interface CodeSource {
  readFile(path: string, startLine?: number, endLine?: number): Promise<string>;
  listDir(path: string): Promise<string[]>;
  getCommitSha(): Promise<string>;
}
