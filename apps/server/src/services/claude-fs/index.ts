export { getClaudeHome } from "./path";
export { assertSafePath, PathOutsideClaudeHomeError } from "./guard";
export {
  readTree,
  type TreeEntry,
  type TreeCategory,
  type ReadTreeOptions,
} from "./tree";
export {
  readFile,
  writeFile,
  createFile,
  FileNotFoundError,
  StaleMtimeError,
  FileAlreadyExistsError,
  InvalidFileExtensionError,
  type ReadFileResult,
  type WriteFileResult,
} from "./file";
export { saveBackup, listBackups, hashContent } from "./backup";
export { searchTree, type SearchMatch, type SearchResult } from "./search";
export {
  resolveScope,
  UnknownScopeError,
  type ResolvedScope,
} from "./scope";
