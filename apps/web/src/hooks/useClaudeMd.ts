import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export type ClaudeMdType = "global" | "team" | "personal" | "subdir";

export interface ClaudeMdEntry {
  key: string;
  type: ClaudeMdType;
  filePath: string;
  exists: boolean;
  preview: string | null;
  size: number;
  modifiedAt: number;
  projectSlug?: string;
  projectName?: string;
  projectAbsolutePath?: string;
  /** subdir 일 때만 — project root 기준 상대 경로 (예: \`docs/CLAUDE.md\`). */
  subPath?: string;
}

interface IndexEnvelope {
  data: ClaudeMdEntry[];
  meta: { generatedAt: string; totalEvents: number };
}

interface FileEnvelope {
  data: { content: string; size: number; modifiedAt: number };
  meta: { generatedAt: string };
}

const INDEX_KEY = ["claude-md", "index"] as const;

function fileKey(
  type: ClaudeMdType,
  projectSlug?: string,
  subPath?: string,
) {
  return [
    "claude-md",
    "file",
    type,
    projectSlug ?? "",
    subPath ?? "",
  ] as const;
}

export function useClaudeMdIndex() {
  return useQuery({
    queryKey: INDEX_KEY,
    queryFn: ({ signal }) =>
      apiGet<IndexEnvelope>("/api/claude-md", { signal }),
    staleTime: 30_000,
  });
}

export function useClaudeMdFile(
  type: ClaudeMdType | undefined,
  projectSlug: string | undefined,
  subPath: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    enabled: options.enabled !== false && typeof type === "string",
    queryKey: fileKey(type ?? "global", projectSlug, subPath),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ type: type! });
      if (projectSlug) params.set("projectSlug", projectSlug);
      if (subPath) params.set("subPath", subPath);
      return apiGet<FileEnvelope>(
        `/api/claude-md/file?${params.toString()}`,
        { signal },
      );
    },
    retry: false,
    staleTime: 30_000,
  });
}

interface WriteInput {
  type: ClaudeMdType;
  projectSlug?: string;
  subPath?: string;
  content: string;
  expectedMtime?: number | null;
}

/**
 * PUT 후 index + 해당 파일 쿼리 모두 invalidate. 응답에서 받은 새 mtime
 * 으로 캐시 갱신하면 다음 read 가 fresh 한 mtime 으로 시작.
 */
export function useUpdateClaudeMd() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WriteInput) => {
      const res = await fetch("/api/claude-md/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & {
          status: number;
          body: unknown;
        };
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return (await res.json()) as {
        data: { size: number; modifiedAt: number };
      };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: INDEX_KEY });
      qc.invalidateQueries({
        queryKey: fileKey(vars.type, vars.projectSlug, vars.subPath),
      });
    },
  });
}
