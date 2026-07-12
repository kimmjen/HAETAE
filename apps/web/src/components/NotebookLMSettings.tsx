import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useNotebookLmAuth, useSyncNotebooks, type NotebookLmAuth } from "@/hooks/useNotebooks";
import { cn } from "@/lib/utils";

const STATUS_META: Record<NotebookLmAuth["status"], { label: string; tone: string }> = {
  ok: { label: "Authenticated", tone: "border-accent/40 text-accent" },
  expired: { label: "Auth expired", tone: "border-danger/40 text-danger" },
  no_auth: { label: "Not logged in", tone: "border-danger/40 text-danger" },
  error: { label: "Check failed", tone: "border-border-main text-text-muted" },
};

const BTN_PRIMARY =
  "text-[11px] font-bold uppercase px-3 py-1.5 bg-accent text-text-on-accent hover:opacity-90 transition-opacity";
const BTN_SECONDARY =
  "text-[11px] font-bold uppercase px-3 py-1.5 border border-border-main text-text-main hover:bg-bg-hover transition-colors";
const BTN_DISABLED =
  "text-[11px] font-bold uppercase px-3 py-1.5 border border-border-subtle text-text-subtle cursor-not-allowed";

export function NotebookLMSettings() {
  const navigate = useNavigate();
  const authQ = useNotebookLmAuth();
  const sync = useSyncNotebooks();

  const auth = authQ.data;
  const meta = auth ? STATUS_META[auth.status] : undefined;
  const fallbackLogin = "python -m notebooklm login";

  function reauthenticate() {
    // Open the integrated terminal IN the service's app dir (login_cwd) and run
    // the SHORT relative login command — a long absolute path wraps in the
    // terminal and a stray fragment can run after login. The Google OAuth
    // happens in the browser the CLI opens (can't be a pure web button).
    navigate({
      to: "/working/terminal",
      search: { cwd: auth?.login_cwd, autoCommand: auth?.login_command || fallbackLogin },
    });
  }

  function doSync() {
    sync.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(`Synced — ${r.notebooks} notebooks · ${r.sources} sources`),
      onError: () => toast.error("Sync failed — check the auth status."),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">
          NotebookLM Auth
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {authQ.isPending ? (
            <span className="text-[11px] font-mono text-text-muted">Checking…</span>
          ) : authQ.isError ? (
            <span className="text-[11px] font-mono text-danger">
              Status unavailable — make sure the NotebookLM service (:4100) is running.
            </span>
          ) : (
            <>
              {meta && (
                <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 border", meta.tone)}>
                  {meta.label}
                </span>
              )}
              {auth?.profile && (
                <span className="text-[10px] font-mono text-text-subtle">profile: {auth.profile}</span>
              )}
            </>
          )}
        </div>
        {auth?.detail && auth.status !== "ok" && (
          <p className="text-[10px] font-mono text-text-subtle mt-1 break-words">{auth.detail}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reauthenticate} className={BTN_PRIMARY}>
          Re-authenticate in Terminal
        </button>
        <button
          type="button"
          onClick={doSync}
          disabled={sync.isPending}
          aria-disabled={sync.isPending}
          className={sync.isPending ? BTN_DISABLED : BTN_SECONDARY}
        >
          {sync.isPending ? "Syncing…" : "Sync now"}
        </button>
        <button type="button" onClick={() => authQ.refetch()} className={BTN_SECONDARY}>
          Refresh status
        </button>
      </div>

      <p className="text-[10px] font-mono text-text-subtle leading-relaxed">
        Re-authentication runs <code className="text-text-muted">notebooklm login</code> in the
        integrated terminal (browser Google sign-in). When done, press "Sync now" to refresh the local mirror.
      </p>
    </div>
  );
}
