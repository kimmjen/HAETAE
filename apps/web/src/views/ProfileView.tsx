import { Info, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { ProjectRootsManager } from "@/components/ProjectRootsManager";
import { useAuthStatus, useRefreshAuthStatus } from "@/hooks/useAuthStatus";
import { formatRelativeTime } from "@/lib/format/datetime";

interface ProfileFieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function ProfileField({ label, value, mono }: ProfileFieldProps) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-black text-text-muted uppercase tracking-widest">
        {label}
      </div>
      <div
        className={mono ? "text-[12px] font-mono text-text-main" : "text-[12px] font-bold text-text-main"}
      >
        {value}
      </div>
    </div>
  );
}

function ProfileHeader() {
  const auth = useAuthStatus();
  const data = auth.data?.data;
  const tier = data?.loggedIn && data.subscriptionType
    ? data.subscriptionType.toUpperCase()
    : null;

  return (
    <div className="flex items-center gap-4 p-6 border-b border-border-main bg-bg-secondary">
      <div className="w-14 h-14 flex items-center justify-center border border-border-main bg-bg-primary">
        <User size={28} className="text-text-main" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[18px] font-black uppercase tracking-tighter text-text-main truncate">
          {data?.email ?? "Local Operator"}
        </span>
        <span className="text-[10px] font-mono text-text-muted truncate">
          {data?.orgName ?? "SESSION OWNER · LCL.WORKSTATION"}
        </span>
      </div>
      {tier && (
        <div className="px-3 py-1 border border-accent bg-accent text-text-on-accent text-[11px] font-bold uppercase tracking-widest shrink-0">
          {tier}
        </div>
      )}
    </div>
  );
}

function AccountSection() {
  const auth = useAuthStatus();
  const refresh = useRefreshAuthStatus();
  const data = auth.data?.data;
  const fetchedAt = auth.data?.meta.generatedAt;

  const onRefresh = () => {
    refresh.mutate(undefined, {
      onSuccess: () => toast.success("Auth status refreshed"),
      onError: (err) => toast.error("Refresh failed", { description: err.message }),
    });
  };

  return (
    <div className="p-6 border-b border-border-main">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase text-text-main">
          Account · claude auth status
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refresh.isPending}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-wait"
        >
          <RefreshCw size={10} className={refresh.isPending ? "animate-spin" : ""} />
          <span>{refresh.isPending ? "…" : "Refresh"}</span>
        </button>
      </div>
      {auth.isPending && (
        <p className="text-[11px] font-mono text-text-muted">Loading…</p>
      )}
      {auth.isError && (
        <p className="text-[11px] font-mono text-danger">
          Failed to fetch auth status.
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-6">
            <ProfileField
              label="Logged In"
              value={data.loggedIn ? "yes" : "no"}
              mono
            />
            <ProfileField
              label="Subscription"
              value={data.subscriptionType ?? "—"}
            />
            <ProfileField
              label="Email"
              value={data.email ?? "—"}
              mono
            />
            <ProfileField
              label="Auth Method"
              value={data.authMethod ?? "—"}
              mono
            />
            <ProfileField
              label="API Provider"
              value={data.apiProvider ?? "—"}
              mono
            />
            <ProfileField
              label="Org"
              value={data.orgName ?? "—"}
              mono
            />
          </div>
          <div className="mt-4 flex items-start gap-2 border border-border-subtle bg-bg-secondary px-3 py-2">
            <Info size={12} className="text-text-muted mt-0.5 shrink-0" />
            <p className="text-[10px] font-mono text-text-muted leading-relaxed">
              The subscription tier is cached from when the OAuth token was issued. It can
              stay stale after an upgrade — run <code>claude auth logout &amp;&amp;
              claude auth login</code> to get a fresh token and refresh it.
            </p>
          </div>
          {fetchedAt && (
            <p className="mt-2 text-[10px] font-mono text-text-subtle">
              cache · {formatRelativeTime(new Date(fetchedAt).getTime())}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SystemSection() {
  return (
    <div className="grid grid-cols-2 gap-6 p-6">
      <ProfileField label="Workspace Path" value="~/.claude" mono />
      <ProfileField label="Cache Database" value="~/.haetae/cache.db" mono />
      <ProfileField label="Build Channel" value="LCL.STABLE" />
    </div>
  );
}

export function ProfileView() {
  return (
    <div className="max-w-3xl border border-border-main bg-bg-primary space-y-0">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 text-[11px] font-bold uppercase">
        Operator Profile
      </div>
      <ProfileHeader />
      <AccountSection />
      <SystemSection />
      <div className="border-t border-border-main p-6">
        <ProjectRootsManager />
      </div>
    </div>
  );
}
