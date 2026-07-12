import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface ProjectMemoryEntry {
  name: string;
  preview: string | null;
  size: number;
  modifiedAt: number;
}

interface Envelope {
  data: ProjectMemoryEntry[];
  meta: { generatedAt: string; totalEvents: number };
}

export function useProjectMemory(projectPath: string | undefined) {
  return useQuery({
    enabled: typeof projectPath === "string" && projectPath.length > 0,
    queryKey: ["projects", "memory", projectPath] as const,
    queryFn: ({ signal }) =>
      apiGet<Envelope>(
        `/api/projects/memory?projectPath=${encodeURIComponent(projectPath!)}`,
        { signal },
      ),
    staleTime: 60_000,
  });
}

interface FileEnvelope {
  data: {
    name: string;
    content: string;
    size: number;
    modifiedAt: number;
  };
  meta: { generatedAt: string };
}

export function useProjectMemoryFile(
  projectPath: string | undefined,
  name: string | null,
) {
  return useQuery({
    enabled:
      typeof projectPath === "string" &&
      projectPath.length > 0 &&
      typeof name === "string" &&
      name.length > 0,
    queryKey: ["projects", "memory", "file", projectPath, name] as const,
    queryFn: ({ signal }) =>
      apiGet<FileEnvelope>(
        `/api/projects/memory/file?projectPath=${encodeURIComponent(projectPath!)}&name=${encodeURIComponent(name!)}`,
        { signal },
      ),
    staleTime: 60_000,
  });
}
