import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

export interface ProjectRootRow {
  id: number;
  absolutePath: string;
}

export class DuplicateRootError extends Error {
  constructor(public readonly absolutePath: string, public readonly source: "env" | "user") {
    super(`Project root already registered (${source}): ${absolutePath}`);
    this.name = "DuplicateRootError";
  }
}

export class InvalidRootPathError extends Error {
  constructor(public readonly attempted: string, message: string) {
    super(message);
    this.name = "InvalidRootPathError";
  }
}

async function postRoot(absolutePath: string): Promise<ProjectRootRow> {
  const res = await fetch("/api/projects/roots", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ absolutePath }),
  });
  if (res.status === 409) {
    const json = (await res.json()) as { path: string; source: "env" | "user" };
    throw new DuplicateRootError(json.path, json.source);
  }
  if (res.status === 400) {
    const json = (await res.json()) as { error: string; path?: string };
    throw new InvalidRootPathError(json.path ?? absolutePath, json.error);
  }
  if (!res.ok) {
    throw new ApiError(`POST /api/projects/roots failed: ${res.status}`, res.status, "/api/projects/roots");
  }
  return (await res.json()) as ProjectRootRow;
}

async function deleteRoot(id: number): Promise<void> {
  const res = await fetch(`/api/projects/roots/${id}`, {
    method: "DELETE",
    headers: { accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(`DELETE /api/projects/roots/${id} failed: ${res.status}`, res.status, "/api/projects/roots");
  }
}

export function useAddProjectRoot() {
  const qc = useQueryClient();
  return useMutation<ProjectRootRow, Error, string>({
    mutationFn: postRoot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "list"] });
    },
  });
}

export function useDeleteProjectRoot() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: deleteRoot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "list"] });
    },
  });
}
