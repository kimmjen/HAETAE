import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Brain, X } from "lucide-react";
import {
  useProjectMemory,
  useProjectMemoryFile,
} from "@/hooks/useProjectMemory";
import { formatRelativeTime } from "@/lib/format/datetime";

interface Props {
  projectPath: string;
}

/**
 * \`~/.claude/projects/<encoded>/memory/\` 의 auto-memory 파일 목록.
 * Claude Code 가 자동으로 쌓는 사용자 / feedback / project 메모리들.
 * 행을 클릭하면 read-only modal 로 본문 미리보기 (편집은 추후 PR).
 *
 * 근거: docs/research/claude-code-data-sources.md.
 */
export function ProjectMemoryList({ projectPath }: Props) {
  const q = useProjectMemory(projectPath);
  const [openName, setOpenName] = useState<string | null>(null);
  const rows = q.data?.data ?? [];

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center gap-2">
        <Brain size={12} className="text-text-muted" />
        <span className="text-[11px] font-bold uppercase text-text-main">
          Memories for this project
        </span>
        <span className="text-[10px] font-mono text-text-muted ml-auto">
          {rows.length} files
        </span>
      </div>
      {q.isPending && (
        <div className="p-3 text-[11px] font-mono text-text-muted">Loading…</div>
      )}
      {q.isError && (
        <div className="p-3 text-[11px] font-mono text-danger">
          Failed to load the memory list.
        </div>
      )}
      {!q.isPending && rows.length === 0 && (
        <div className="p-3 text-[11px] font-mono text-text-subtle">
          No auto-memory yet for this project.
        </div>
      )}
      {rows.length > 0 && (
        <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
          {rows.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => setOpenName(m.name)}
              className="w-full text-left px-3 py-2 font-mono text-[11px] hover:bg-bg-hover transition-colors"
              title={`${m.name} · ${m.size}B — click to preview`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-text-main truncate">{m.name}</span>
                <span className="text-text-muted text-[10px]">
                  {formatRelativeTime(m.modifiedAt)}
                </span>
              </div>
              {m.preview && (
                <div className="text-[10px] text-text-muted mt-0.5 truncate">
                  {m.preview}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <MemoryPreviewDialog
        projectPath={projectPath}
        name={openName}
        onClose={() => setOpenName(null)}
      />
    </div>
  );
}

function MemoryPreviewDialog({
  projectPath,
  name,
  onClose,
}: {
  projectPath: string;
  name: string | null;
  onClose: () => void;
}) {
  const file = useProjectMemoryFile(projectPath, name);

  return (
    <Dialog.Root open={name !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[80vw] max-w-[900px] h-[80vh] -translate-x-1/2 -translate-y-1/2 bg-bg-elevated border border-border-main shadow-lg flex flex-col focus:outline-none">
          <div className="bg-bg-secondary border-b border-border-main px-4 py-2 flex items-center gap-2">
            <Brain size={12} className="text-text-muted" />
            <Dialog.Title className="text-[11px] font-bold uppercase text-text-main tracking-wider truncate">
              {name ?? ""}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="ml-auto p-1 text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {file.isPending && (
              <div className="text-[11px] font-mono text-text-muted">Loading…</div>
            )}
            {file.isError && (
              <div className="text-[11px] font-mono text-danger">
                Failed to load the memory file.
              </div>
            )}
            {file.data && (
              <pre className="whitespace-pre-wrap font-mono text-[12px] text-text-main leading-relaxed">
                {file.data.data.content}
              </pre>
            )}
          </div>
          {file.data && (
            <div className="border-t border-border-subtle bg-bg-secondary px-4 py-1.5 text-[10px] font-mono text-text-muted flex items-center gap-3">
              <span>{file.data.data.size.toLocaleString("en-US")} bytes</span>
              <span>·</span>
              <span>
                modified · {formatRelativeTime(file.data.data.modifiedAt)}
              </span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
