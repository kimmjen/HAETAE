import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
}

/**
 * Bloomberg-toned confirmation modal. Built on Radix Dialog so we get
 * focus trap, scroll lock, Escape-to-close, and ARIA attributes for
 * free — none of which window.confirm honored. Use anywhere a destructive
 * or unrecoverable action needs explicit user assent.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/3 z-50 w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2",
            "bg-bg-elevated border border-border-main shadow-lg",
            "focus:outline-none",
          )}
        >
          <div className="bg-bg-secondary border-b border-border-main px-4 py-2">
            <Dialog.Title className="text-[11px] font-bold uppercase text-text-main tracking-wider">
              {title}
            </Dialog.Title>
          </div>
          {description && (
            <Dialog.Description className="px-6 py-5 text-[12px] font-mono text-text-main leading-relaxed">
              {description}
            </Dialog.Description>
          )}
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-subtle bg-bg-secondary">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              className={cn(
                "px-4 py-2 text-[10px] font-bold uppercase transition-colors",
                variant === "danger"
                  ? "bg-danger text-text-on-accent hover:opacity-90"
                  : "bg-accent text-text-on-accent hover:bg-accent-hover",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
