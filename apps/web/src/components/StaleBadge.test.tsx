import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaleBadge } from "./StaleBadge";

afterEach(() => vi.restoreAllMocks());

describe("StaleBadge", () => {
  it("배지를 렌더하고 클릭 시 재생성 콜백을 호출", async () => {
    const onRegenerate = vi.fn();
    render(<StaleBadge onRegenerate={onRegenerate} />);
    const btn = screen.getByRole("button", { name: /Wiki updated/ });
    expect(btn).toBeInTheDocument();
    await userEvent.setup().click(btn);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("pending 이면 비활성화", () => {
    render(<StaleBadge onRegenerate={() => {}} pending />);
    expect(screen.getByRole("button", { name: /Wiki updated/ })).toBeDisabled();
  });
});
