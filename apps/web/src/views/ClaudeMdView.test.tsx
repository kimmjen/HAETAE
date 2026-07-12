import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClaudeMdView } from "./ClaudeMdView";

// Monaco 는 happy-dom 에서 무겁고 본 PR 의 검증 범위 밖. 단순 textarea 로 대체.
vi.mock("@/components/MarkdownEditor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }) => (
    <textarea
      data-testid="md-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

interface MockEntry {
  key: string;
  type: "global" | "team" | "personal" | "subdir";
  filePath: string;
  exists: boolean;
  preview: string | null;
  size: number;
  modifiedAt: number;
  projectSlug?: string;
  projectName?: string;
  projectAbsolutePath?: string;
  subPath?: string;
}

function mockApi(opts: {
  entries: MockEntry[];
  fileContents?: Record<string, string>;
}) {
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("/api/claude-md/file") && init?.method === "PUT") {
      return new Response(
        JSON.stringify({
          data: { size: 0, modifiedAt: Date.now() },
          meta: { generatedAt: new Date().toISOString() },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/claude-md/file")) {
      const params = new URL(url, "http://x").searchParams;
      const type = params.get("type") ?? "global";
      const slug = params.get("projectSlug") ?? "";
      const subPath = params.get("subPath") ?? "";
      const k =
        type === "global"
          ? "global"
          : type === "subdir"
            ? `subdir:${slug}:${subPath}`
            : `${type}:${slug}`;
      const content = opts.fileContents?.[k];
      if (content === undefined) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
        });
      }
      return new Response(
        JSON.stringify({
          data: { content, size: content.length, modifiedAt: 1000 },
          meta: { generatedAt: new Date().toISOString() },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/api/claude-md")) {
      return new Response(
        JSON.stringify({
          data: opts.entries,
          meta: {
            generatedAt: new Date().toISOString(),
            totalEvents: opts.entries.length,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaudeMdView />
    </QueryClientProvider>,
  );
}

describe("ClaudeMdView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("인덱스 entries 가 섹션별로 그려짐 + projectName 으로 라벨", async () => {
    mockApi({
      entries: [
        {
          key: "global",
          type: "global",
          filePath: "/home/user/.claude/CLAUDE.md",
          exists: true,
          preview: "global hello",
          size: 12,
          modifiedAt: 1000,
        },
        {
          key: "team:proj-a",
          type: "team",
          filePath: "/work/proj-a/CLAUDE.md",
          exists: false,
          preview: null,
          size: 0,
          modifiedAt: 0,
          projectSlug: "proj-a",
          projectName: "Project Alpha",
          projectAbsolutePath: "/work/proj-a",
        },
      ],
      fileContents: { global: "global hello\n" },
    });
    renderView();
    await waitFor(() =>
      expect(screen.getByText("Global")).toBeInTheDocument(),
    );
    expect(screen.getByText("Team (per-project)")).toBeInTheDocument();
    // 라벨이 projectName 사용 — useProjects() 호출 없이 entry 만으로
    expect(
      screen.getByText("Project Alpha / CLAUDE.md"),
    ).toBeInTheDocument();
    // exists=false 자리에 "empty — create" 메시지
    expect(screen.getByText("empty — create")).toBeInTheDocument();
    // sidebar entry 의 hover tooltip 에 projectAbsolutePath
    const teamBtn = screen
      .getByText("Project Alpha / CLAUDE.md")
      .closest("button")!;
    expect(teamBtn.getAttribute("title")).toBe("/work/proj-a");
  });

  it("entry 클릭 시 파일 fetch + 에디터에 content 노출", async () => {
    mockApi({
      entries: [
        {
          key: "global",
          type: "global",
          filePath: "/home/user/.claude/CLAUDE.md",
          exists: true,
          preview: "hi",
          size: 3,
          modifiedAt: 1000,
        },
      ],
      fileContents: { global: "live content" },
    });
    renderView();
    await waitFor(() => {
      const ed = screen.getByTestId("md-editor") as HTMLTextAreaElement;
      expect(ed.value).toBe("live content");
    });
  });

  it("subdir entry 가 별도 섹션으로 그려지고 클릭 시 content 로드", async () => {
    mockApi({
      entries: [
        {
          key: "global",
          type: "global",
          filePath: "/home/user/.claude/CLAUDE.md",
          exists: true,
          preview: "g",
          size: 1,
          modifiedAt: 1000,
        },
        {
          key: "subdir:proj-a:docs/CLAUDE.md",
          type: "subdir",
          filePath: "/work/proj-a/docs/CLAUDE.md",
          exists: true,
          preview: "docs preview",
          size: 12,
          modifiedAt: 1000,
          projectSlug: "proj-a",
          projectName: "Project Alpha",
          projectAbsolutePath: "/work/proj-a",
          subPath: "docs/CLAUDE.md",
        },
      ],
      fileContents: {
        global: "g",
        "subdir:proj-a:docs/CLAUDE.md": "docs content live",
      },
    });
    renderView();
    expect(
      await screen.findByText("Subdirectories (per-project)"),
    ).toBeInTheDocument();
    const subBtn = await screen.findByText(
      "Project Alpha / docs/CLAUDE.md",
    );
    await userEvent.click(subBtn);
    await waitFor(() => {
      const ed = screen.getByTestId("md-editor") as HTMLTextAreaElement;
      expect(ed.value).toBe("docs content live");
    });
  });

  it("Save 버튼은 변경 없으면 disabled", async () => {
    mockApi({
      entries: [
        {
          key: "global",
          type: "global",
          filePath: "/home/user/.claude/CLAUDE.md",
          exists: true,
          preview: "hi",
          size: 3,
          modifiedAt: 1000,
        },
      ],
      fileContents: { global: "stable" },
    });
    renderView();
    const saveBtn = await screen.findByRole("button", { name: /save/i });
    expect(saveBtn).toBeDisabled();

    const ed = (await screen.findByTestId(
      "md-editor",
    )) as HTMLTextAreaElement;
    await userEvent.clear(ed);
    await userEvent.type(ed, "edited");
    expect(saveBtn).not.toBeDisabled();
  });
});
