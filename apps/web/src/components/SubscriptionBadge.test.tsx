import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionBadge } from "./SubscriptionBadge";

interface AuthFields {
  loggedIn?: boolean;
  email?: string | null;
  orgId?: string | null;
  orgName?: string | null;
  subscriptionType?: string | null;
}

function mockAuthStatus(fields: AuthFields | null) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = typeof url === "string" ? url : (url as URL).toString();
    if (!u.includes("/api/system/auth-status")) {
      return new Response("{}", { status: 200 });
    }
    if (fields === null) {
      return new Response("server boom", { status: 500 });
    }
    const data = {
      loggedIn: fields.loggedIn ?? true,
      authMethod: "claude.ai",
      apiProvider: "firstParty",
      email: fields.email ?? null,
      orgId: fields.orgId ?? null,
      orgName: fields.orgName ?? null,
      subscriptionType: fields.subscriptionType ?? null,
    };
    return new Response(
      JSON.stringify({ data, meta: { generatedAt: new Date().toISOString() } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

function renderBadge() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionBadge />
    </QueryClientProvider>,
  );
}

describe("SubscriptionBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("개인 plan 은 sublabel 로 email 노출", async () => {
    mockAuthStatus({
      subscriptionType: "pro",
      email: "user@example.com",
      orgName: null,
    });
    renderBadge();
    await waitFor(() => expect(screen.getByText("PRO")).toBeInTheDocument());
    expect(screen.getByText("· user@example.com")).toBeInTheDocument();
  });

  it("Team plan 은 sublabel 로 orgName 노출 (email 은 안 보임)", async () => {
    mockAuthStatus({
      subscriptionType: "team",
      email: "user@example.com",
      orgName: "egolab",
    });
    renderBadge();
    await waitFor(() => expect(screen.getByText("TEAM")).toBeInTheDocument());
    expect(screen.getByText("· egolab")).toBeInTheDocument();
    expect(screen.queryByText("· user@example.com")).not.toBeInTheDocument();
  });

  it("Team plan 인데 orgName 이 비어있으면 email 로 fallback", async () => {
    mockAuthStatus({
      subscriptionType: "team",
      email: "user@example.com",
      orgName: null,
    });
    renderBadge();
    await waitFor(() => expect(screen.getByText("TEAM")).toBeInTheDocument());
    expect(screen.getByText("· user@example.com")).toBeInTheDocument();
  });

  it("미로그인 상태 표시", async () => {
    mockAuthStatus({ loggedIn: false });
    renderBadge();
    await waitFor(() =>
      expect(screen.getByText("NOT LOGGED IN")).toBeInTheDocument(),
    );
  });

  it("서버 에러 시 AUTH N/A", async () => {
    mockAuthStatus(null);
    renderBadge();
    await waitFor(() =>
      expect(screen.getByText("AUTH N/A")).toBeInTheDocument(),
    );
  });
});
