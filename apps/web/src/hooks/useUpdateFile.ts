import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { scopeKey, type Scope } from "@/lib/scope";
import type { FileResponse } from "./useFile";

export interface UpdateFileBody {
  path: string;
  content: string;
  expectedMtime: number;
}

export interface UpdateFileResponse extends FileResponse {
  backupId: number;
}

export class FileConflictError extends Error {
  constructor(
    public readonly path: string,
    public readonly expectedMtime: number,
    public readonly actualMtime: number,
  ) {
    super(`File ${path} changed on disk`);
    this.name = "FileConflictError";
  }
}

interface PutFileArgs extends UpdateFileBody {
  scope: Scope;
}

async function putFile(args: PutFileArgs): Promise<UpdateFileResponse> {
  const body = {
    path: args.path,
    content: args.content,
    expectedMtime: args.expectedMtime,
    ...(args.scope && args.scope !== "global" ? { scope: args.scope } : {}),
  };
  const res = await fetch("/api/rules/file", {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    const json = (await res.json()) as { expectedMtime: number; actualMtime: number };
    throw new FileConflictError(args.path, json.expectedMtime, json.actualMtime);
  }
  if (!res.ok) {
    throw new ApiError(`PUT /api/rules/file failed: ${res.status}`, res.status, "/api/rules/file");
  }
  return (await res.json()) as UpdateFileResponse;
}

export function useUpdateFile(scope: Scope = "global") {
  const qc = useQueryClient();
  const sk = scopeKey(scope);
  return useMutation<UpdateFileResponse, Error, UpdateFileBody>({
    mutationFn: (body) => putFile({ ...body, scope }),
    onSuccess: (data) => {
      qc.setQueryData(["rules", "file", sk, data.path], data);
      qc.invalidateQueries({ queryKey: ["rules", "list", sk] });
    },
  });
}
