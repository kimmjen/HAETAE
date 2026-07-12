import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopHeader } from "./TopHeader";
import { ThemeProvider } from "@/lib/theme";
import { CurrencyProvider } from "@/lib/currency";

function renderHeader(withProvider = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const header = <TopHeader title="OVERVIEW" onProfileClick={() => {}} />;
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {withProvider ? <CurrencyProvider>{header}</CurrencyProvider> : header}
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

// No API/FX server in unit tests — stub fetch so the usage query and the rate
// fetch reject cleanly instead of opening real sockets (ECONNRESET noise).
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network"))));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("TopHeader SYNC", () => {
  it("SYNC 는 usage 재인덱스와 usage-limits 강제 갱신을 함께 쏜다", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(
      screen.getByRole("button", { name: /refresh local usage index and usage limits/i }),
    );

    const urls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/api/usage/local/refresh");
    expect(urls).toContain("/api/system/usage-limits/refresh");
  });
});

describe("TopHeader currency toggle", () => {
  it("헤더에 통화 토글이 실제로 렌더된다 (기본 USD)", () => {
    renderHeader();
    // 기본 통화 USD → 버튼 라벨 "$ USD", aria 는 전환 대상(KRW)
    const toggle = screen.getByRole("button", { name: "Switch to KRW" });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent("$ USD");
  });

  it("클릭하면 USD→KRW 로 전환된다", async () => {
    const user = userEvent.setup();
    renderHeader(true);

    await user.click(screen.getByRole("button", { name: "Switch to KRW" }));

    const toggled = screen.getByRole("button", { name: "Switch to USD" });
    expect(toggled).toHaveTextContent("₩ KRW");
  });
});
