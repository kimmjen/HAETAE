import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

interface HarnessProps {
  initialOpen?: boolean;
  onConfirm?: () => void;
  variant?: "default" | "danger";
}

function Harness({ initialOpen = true, onConfirm = () => undefined, variant }: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Discard changes?"
      description="작성 중인 내용이 사라집니다."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      variant={variant}
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("renders title + description when open", () => {
    render(<Harness />);
    expect(screen.getByText(/Discard changes\?/)).toBeInTheDocument();
    expect(screen.getByText(/작성 중인 내용이 사라집니다/)).toBeInTheDocument();
  });

  it("does not render content when open=false", () => {
    render(<Harness initialOpen={false} />);
    expect(screen.queryByText(/Discard changes\?/)).not.toBeInTheDocument();
  });

  it("Confirm click runs onConfirm and closes the dialog", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Discard changes\?/)).not.toBeInTheDocument();
  });

  it("Cancel click closes the dialog without invoking onConfirm", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: /keep editing/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByText(/Discard changes\?/)).not.toBeInTheDocument();
  });

  it("Escape key closes the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Discard changes\?/)).not.toBeInTheDocument();
  });

  it("danger variant uses the danger color on the confirm button", () => {
    render(<Harness variant="danger" />);
    const confirm = screen.getByRole("button", { name: /discard/i });
    expect(confirm.className).toContain("bg-danger");
  });
});
