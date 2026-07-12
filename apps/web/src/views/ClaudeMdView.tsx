import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileText, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/datetime";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import {
  useClaudeMdFile,
  useClaudeMdIndex,
  useUpdateClaudeMd,
  type ClaudeMdEntry,
  type ClaudeMdType,
} from "@/hooks/useClaudeMd";

interface Selection {
  type: ClaudeMdType;
  projectSlug?: string;
  subPath?: string;
}

function selectionKey(s: Selection): string {
  if (s.type === "global") return "global";
  if (s.type === "subdir") return `subdir:${s.projectSlug}:${s.subPath}`;
  return `${s.type}:${s.projectSlug}`;
}

/**
 * CLAUDE.md 관리 — 3 위치 (global / 프로젝트별 team / personal) 인덱스
 * + Monaco 에디터. 디스크에 없는 자리도 그대로 노출해서 \"여기 만들 수
 * 있음\" 의 형태로 사용자가 신규 작성 가능.
 */
export function ClaudeMdView() {
  const index = useClaudeMdIndex();
  const entries = index.data?.data ?? [];

  // 인덱스 첫 로드 시 첫 entry 자동 선택.
  const [selection, setSelection] = useState<Selection | null>(null);
  useEffect(() => {
    if (selection === null && entries.length > 0) {
      const first = entries[0];
      setSelection({
        type: first.type,
        projectSlug: first.projectSlug,
        subPath: first.subPath,
      });
    }
  }, [entries, selection]);

  const selectedEntry = useMemo(() => {
    if (!selection) return null;
    return (
      entries.find((e) => {
        if (selection.type !== e.type) return false;
        if (selection.type === "global") return true;
        if (selection.type === "subdir") {
          return (
            e.projectSlug === selection.projectSlug &&
            e.subPath === selection.subPath
          );
        }
        return e.projectSlug === selection.projectSlug;
      }) ?? null
    );
  }, [entries, selection]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-3">
      <IndexList
        entries={entries}
        selectionKey={selection ? selectionKey(selection) : null}
        onSelect={setSelection}
        loading={index.isPending}
        error={index.isError}
      />
      <Editor selection={selection} entry={selectedEntry} />
    </div>
  );
}

interface IndexListProps {
  entries: ClaudeMdEntry[];
  selectionKey: string | null;
  onSelect: (s: Selection) => void;
  loading: boolean;
  error: boolean;
}

function IndexList({
  entries,
  selectionKey,
  onSelect,
  loading,
  error,
}: IndexListProps) {
  if (loading) {
    return (
      <div className="border border-border-main p-3 text-[11px] font-mono text-text-muted">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-border-main p-3 text-[11px] font-mono text-danger">
        Failed to load the index.
      </div>
    );
  }

  const grouped: Record<
    "global" | "team" | "personal" | "subdir",
    ClaudeMdEntry[]
  > = {
    global: [],
    team: [],
    personal: [],
    subdir: [],
  };
  for (const e of entries) grouped[e.type].push(e);

  return (
    <div className="border border-border-main bg-bg-primary self-start lg:sticky lg:top-2">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-text-main">
        CLAUDE.md
      </div>
      <Section
        label="Global"
        items={grouped.global}
        selectionKey={selectionKey}
        onSelect={onSelect}
        labelFor={() => "~/.claude/CLAUDE.md"}
      />
      <Section
        label="Team (per-project)"
        items={grouped.team}
        selectionKey={selectionKey}
        onSelect={onSelect}
        labelFor={(e) =>
          `${e.projectName ?? e.projectSlug ?? "?"} / CLAUDE.md`
        }
      />
      <Section
        label="Personal (per-project)"
        items={grouped.personal}
        selectionKey={selectionKey}
        onSelect={onSelect}
        labelFor={(e) =>
          `${e.projectName ?? e.projectSlug ?? "?"} / CLAUDE.local.md`
        }
      />
      <Section
        label="Subdirectories (per-project)"
        items={grouped.subdir}
        selectionKey={selectionKey}
        onSelect={onSelect}
        labelFor={(e) =>
          `${e.projectName ?? e.projectSlug ?? "?"} / ${e.subPath ?? "?"}`
        }
      />
    </div>
  );
}

interface SectionProps {
  label: string;
  items: ClaudeMdEntry[];
  selectionKey: string | null;
  onSelect: (s: Selection) => void;
  labelFor: (e: ClaudeMdEntry) => string;
}

function Section({
  label,
  items,
  selectionKey,
  onSelect,
  labelFor,
}: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-text-muted bg-bg-secondary/40">
        {label}
      </div>
      {items.map((e) => {
        const myKey =
          e.type === "global"
            ? "global"
            : e.type === "subdir"
              ? `subdir:${e.projectSlug}:${e.subPath}`
              : `${e.type}:${e.projectSlug}`;
        const active = selectionKey === myKey;
        // Hover tooltip — subdir 은 풀 파일경로 (root + subPath), team/
        // personal 은 프로젝트 root, global 은 filePath. truncate 된
        // 라벨의 full form 확인용.
        const tooltip =
          e.type === "subdir"
            ? e.filePath
            : (e.projectAbsolutePath ?? e.filePath);
        return (
          <button
            type="button"
            key={e.key}
            title={tooltip}
            onClick={() =>
              onSelect({
                type: e.type,
                projectSlug: e.projectSlug,
                subPath: e.subPath,
              })
            }
            className={cn(
              "w-full text-left px-3 py-2 flex items-start gap-2 transition-colors group",
              active
                ? "bg-accent text-text-on-accent"
                : "hover:bg-bg-hover text-text-main",
            )}
          >
            <FileText
              size={12}
              className={cn(
                "mt-0.5 shrink-0",
                active
                  ? "text-text-on-accent"
                  : e.exists
                    ? "text-text-muted group-hover:text-text-main"
                    : "text-text-subtle",
              )}
            />
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-[11px] font-bold uppercase truncate",
                  !e.exists && !active && "text-text-subtle",
                )}
              >
                {labelFor(e)}
              </div>
              {e.exists ? (
                <div
                  className={cn(
                    "text-[10px] font-mono truncate mt-0.5",
                    active ? "text-text-on-accent/80" : "text-text-muted",
                  )}
                  title={e.preview ?? undefined}
                >
                  {e.preview ?? "(empty)"}
                </div>
              ) : (
                <div
                  className={cn(
                    "text-[10px] font-mono mt-0.5",
                    active ? "text-text-on-accent/80" : "text-text-subtle",
                  )}
                >
                  empty — create
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface EditorProps {
  selection: Selection | null;
  entry: ClaudeMdEntry | null;
}

function Editor({ selection, entry }: EditorProps) {
  const fileQuery = useClaudeMdFile(
    selection?.type,
    selection?.projectSlug,
    selection?.subPath,
    { enabled: !!selection && (entry?.exists ?? false) },
  );
  const update = useUpdateClaudeMd();

  // 디스크 값과 비교용 baseline + 현재 편집 중 draft.
  const [draft, setDraft] = useState<string>("");
  const [baseline, setBaseline] = useState<string>("");
  const [mtime, setMtime] = useState<number | null>(null);

  // 선택 / 디스크 값 변경 시 draft 동기화.
  useEffect(() => {
    if (!selection) return;
    if (entry?.exists === false) {
      setDraft("");
      setBaseline("");
      setMtime(null);
      return;
    }
    const d = fileQuery.data?.data;
    if (d) {
      setDraft(d.content);
      setBaseline(d.content);
      setMtime(d.modifiedAt);
    }
  }, [
    selection?.type,
    selection?.projectSlug,
    selection?.subPath,
    entry?.exists,
    fileQuery.data,
    selection,
  ]);

  if (!selection) {
    return (
      <div className="border border-border-main bg-bg-primary p-6 text-[11px] font-mono text-text-muted">
        Select a CLAUDE.md entry on the left.
      </div>
    );
  }

  const dirty = draft !== baseline;

  const handleSave = async () => {
    try {
      const res = await update.mutateAsync({
        type: selection.type,
        projectSlug: selection.projectSlug,
        subPath: selection.subPath,
        content: draft,
        expectedMtime: mtime,
      });
      setBaseline(draft);
      setMtime(res.data.modifiedAt);
      toast.success("CLAUDE.md saved");
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string } };
      if (e.status === 409) {
        toast.error(
          "The file changed elsewhere — reload and edit again",
        );
      } else if (e.status === 403) {
        toast.error("Permission denied — not a registered project root");
      } else {
        toast.error(`Save failed: ${e.body?.error ?? "unknown"}`);
      }
    }
  };

  const handleRevert = () => setDraft(baseline);

  return (
    <div className="border border-border-main bg-bg-primary flex flex-col min-h-[60vh]">
      <header className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase truncate">
            {entry?.filePath ?? "…"}
          </div>
          <div className="text-[10px] font-mono text-text-muted mt-0.5">
            {entry?.exists
              ? `mtime · ${formatRelativeTime(entry.modifiedAt)}`
              : "New file — created on save"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRevert}
            disabled={!dirty || update.isPending}
            aria-disabled={!dirty || update.isPending}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main transition-colors",
              !dirty || update.isPending
                ? "bg-bg-secondary text-text-subtle cursor-not-allowed"
                : "bg-bg-primary text-text-main hover:bg-bg-hover",
            )}
          >
            <RotateCcw size={12} />
            Revert
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            aria-disabled={!dirty || update.isPending}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main transition-colors",
              !dirty || update.isPending
                ? "bg-bg-secondary text-text-subtle cursor-not-allowed"
                : "bg-accent text-text-on-accent hover:bg-accent-hover",
            )}
          >
            <Save size={12} />
            {update.isPending ? "Saving" : "Save"}
          </button>
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <MarkdownEditor value={draft} onChange={setDraft} onSave={handleSave} />
      </div>
    </div>
  );
}
