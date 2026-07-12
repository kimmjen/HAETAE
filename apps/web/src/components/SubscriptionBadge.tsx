import { CircleCheck, CircleSlash } from "lucide-react";
import { useAuthStatus } from "@/hooks/useAuthStatus";

/**
 * Compact subscription tier indicator for the sidebar bottom strip.
 * 한 줄: \"PRO · email\" / \"NOT LOGGED IN\". 자세한 정보는 Profile 페이지.
 */
export function SubscriptionBadge() {
  const auth = useAuthStatus();

  if (auth.isPending) {
    return <Row label="…" muted />;
  }
  const status = auth.data?.data;
  if (auth.isError || !status) {
    return <Row label="AUTH N/A" muted />;
  }
  if (!status.loggedIn) {
    return <Row label="NOT LOGGED IN" icon="off" />;
  }
  const tier = status.subscriptionType
    ? status.subscriptionType.toUpperCase()
    : "ACCOUNT";
  // Team plan 일 땐 식별력이 email 보다 org 에 있음 (한 사람이 여러 org 에
  // 속할 수 있고, 사이드바 폭 w-52 안에서 email 은 어차피 truncate). orgName
  // 이 빈 응답이면 email 로 fallback.
  const sublabel =
    status.subscriptionType === "team"
      ? (status.orgName ?? status.email ?? undefined)
      : (status.email ?? undefined);
  return <Row label={tier} sublabel={sublabel} icon="on" />;
}

function Row({
  label,
  sublabel,
  icon,
  muted,
}: {
  label: string;
  sublabel?: string;
  icon?: "on" | "off";
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "flex items-center gap-1.5 text-text-subtle"
          : "flex items-center gap-1.5 text-text-main"
      }
      title={sublabel ? `${label} · ${sublabel}` : label}
    >
      {icon === "on" && <CircleCheck size={10} className="text-success shrink-0" />}
      {icon === "off" && <CircleSlash size={10} className="text-warning shrink-0" />}
      <span className="text-[10px] font-bold uppercase tracking-wider truncate">
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] font-mono opacity-70 truncate">
          · {sublabel}
        </span>
      )}
    </div>
  );
}
