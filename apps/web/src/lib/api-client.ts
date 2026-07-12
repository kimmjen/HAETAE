/**
 * Tiny fetch wrapper for the /api/* surface owned by apps/server.
 *
 * The Vite dev server proxies /api/* to http://127.0.0.1:3001 and the
 * production build is served by the same origin, so a relative path is
 * always correct on both sides.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
}

export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });

  if (!res.ok) {
    throw new ApiError(`GET ${url} failed: ${res.status} ${res.statusText}`, res.status, url);
  }

  return (await res.json()) as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new ApiError(`POST ${url} failed: ${res.status} ${res.statusText}`, res.status, url);
  }

  return (await res.json()) as T;
}
