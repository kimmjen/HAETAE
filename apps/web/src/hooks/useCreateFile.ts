import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { scopeKey, type Scope } from "@/lib/scope";
import type { FileResponse } from "./useFile";

export interface CreateFileBody {
  path: string;
  content: string;
}

export class FileExistsError extends Error {
  constructor(public readonly path: string) {
    super(`File already exists: ${path}`);
    this.name = "FileExistsError";
  }
}

interface PostFileArgs extends CreateFileBody {
  scope: Scope;
}

async function postFile(args: PostFileArgs): Promise<FileResponse> {
  const body = {
    path: args.path,
    content: args.content,
    ...(args.scope && args.scope !== "global" ? { scope: args.scope } : {}),
  };
  const res = await fetch("/api/rules/file", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    throw new FileExistsError(args.path);
  }
  if (!res.ok) {
    throw new ApiError(`POST /api/rules/file failed: ${res.status}`, res.status, "/api/rules/file");
  }
  return (await res.json()) as FileResponse;
}

export function useCreateFile(scope: Scope = "global") {
  const qc = useQueryClient();
  const sk = scopeKey(scope);
  return useMutation<FileResponse, Error, CreateFileBody>({
    mutationFn: (body) => postFile({ ...body, scope }),
    onSuccess: (data) => {
      qc.setQueryData(["rules", "file", sk, data.path], data);
      qc.invalidateQueries({ queryKey: ["rules", "list", sk] });
    },
  });
}
