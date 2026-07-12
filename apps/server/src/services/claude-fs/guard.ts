import path from "node:path";

export class PathOutsideClaudeHomeError extends Error {
  constructor(public readonly attempted: string) {
    super(`Path is outside claude home: ${attempted}`);
    this.name = "PathOutsideClaudeHomeError";
  }
}

/**
 * Resolve a path that the caller claims is inside `home` and confirm
 * that it really is. Returns the absolute path on success; throws
 * PathOutsideClaudeHomeError otherwise.
 *
 * Accepts both relative paths (resolved against `home`) and absolute
 * paths (must already be inside `home`). Rejects any path that escapes
 * via `..`.
 */
export function assertSafePath(home: string, target: string): string {
  const homeReal = path.resolve(home);

  const candidate = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(homeReal, target);

  const rel = path.relative(homeReal, candidate);
  const escapes = rel.startsWith("..") || path.isAbsolute(rel);
  if (escapes) {
    throw new PathOutsideClaudeHomeError(target);
  }

  return candidate;
}
