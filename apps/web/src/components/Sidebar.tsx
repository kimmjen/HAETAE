import { useEffect, useRef, type ReactNode } from "react";
import dayjs from "@/lib/dayjs";
import { Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BarChart3,
  BrainCircuit,
  Command,
  BookOpen,
  FileCode,
  Fingerprint,
  FolderKanban,
  History,
  LayoutDashboard,
  Layers,
  Library,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useMoney } from "@/lib/currency";
import { useProjects } from "@/hooks/useProjects";
import { useThresholdStatus } from "@/hooks/useThresholds";
import { useCommandPalette } from "./command-palette";
import { HaetaeLogo } from "./HaetaeLogo";
import { SubscriptionBadge } from "./SubscriptionBadge";

interface NavItemProps {
  icon: ReactNode;
  label: string;
  to?: string;
  shortcut?: string;
  disabled?: boolean;
}

function NavItem({ icon, label, to, shortcut, disabled }: NavItemProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = !disabled && to !== undefined && (pathname === to || pathname.startsWith(`${to}/`));

  const className = cn(
    "w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase transition-colors group",
    disabled
      ? "text-text-subtle cursor-not-allowed"
      : active
        ? "bg-accent text-text-on-accent"
        : "text-text-main hover:bg-bg-hover",
  );

  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-3.5 h-3.5",
            disabled
              ? "text-text-subtle"
              : active
                ? "text-text-on-accent"
                : "text-text-muted group-hover:text-text-main",
          )}
        >
          {icon}
        </span>
        <span>{label}</span>
      </div>
      {shortcut && (
        <span className="text-[9px] font-mono opacity-60">{shortcut}</span>
      )}
    </>
  );

  if (disabled || !to) {
    return (
      <button type="button" disabled={disabled} aria-disabled={disabled} className={className}>
        {inner}
      </button>
    );
  }

  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}

interface ProjectNavItemProps {
  slug: string;
  name: string;
  hasClaudeDir: boolean;
}

function ProjectNavItem({ slug, name, hasClaudeDir }: ProjectNavItemProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === `/projects/${slug}`;
  const className = cn(
    "w-full flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase transition-colors group",
    active
      ? "bg-accent text-text-on-accent"
      : hasClaudeDir
        ? "text-text-main hover:bg-bg-hover"
        : "text-text-subtle hover:bg-bg-hover",
  );
  return (
    <Link
      to="/projects/$slug"
      params={{ slug }}
      className={className}
      title={hasClaudeDir ? undefined : "No .claude/ directory"}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            active
              ? "text-text-on-accent"
              : hasClaudeDir
                ? "text-text-muted group-hover:text-text-main"
                : "text-text-subtle",
          )}
        >
          <FolderKanban size={14} />
        </span>
        <span className="truncate">{name}</span>
      </div>
    </Link>
  );
}

interface ProjectsListProps {
  isLoading: boolean;
  isError: boolean;
  entries: Array<{ slug: string; name: string; hasClaudeDir: boolean }>;
}

function ProjectsList({ isLoading, isError, entries }: ProjectsListProps) {
  if (isError) {
    return (
      <div className="px-2 py-1 text-[10px] font-mono text-danger">
        Failed to load the project list.
      </div>
    );
  }
  if (isLoading) {
    return <div className="px-2 py-1 text-[10px] font-mono text-text-muted">Loading…</div>;
  }
  if (entries.length === 0) {
    return (
      <div className="px-2 py-1 text-[10px] font-mono text-text-subtle leading-relaxed">
        HAETAE_PROJECT_ROOTS env is empty.
      </div>
    );
  }
  return (
    <div className="space-y-px">
      {entries.map((p) => (
        <ProjectNavItem
          key={p.slug}
          slug={p.slug}
          name={p.name}
          hasClaudeDir={p.hasClaudeDir}
        />
      ))}
    </div>
  );
}

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  const danger = badge === "OVER";
  return (
    <div className="px-2 mt-4 mb-1 flex items-center justify-between">
      <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
        {label}
      </span>
      {badge && (
        <span
          className={cn(
            "text-[9px] font-mono uppercase tracking-wider",
            danger
              ? "text-danger font-bold animate-pulse"
              : "text-text-subtle",
          )}
          title={
            danger
              ? "Cost threshold exceeded — adjust it in Settings"
              : undefined
          }
        >
          {badge}
        </span>
      )}
    </div>
  );
}


/**
 * Fires a sonner toast on the rising edge of `over` — i.e. when any
 * window's spend first crosses the user's limit during this mount.
 * Dedupe per (kind, scope) in sessionStorage so a refresh mid-window
 * doesn't re-toast the same overrun. 5h scope is bucketized to 5-hour
 * blocks of the local day so a single overrun toasts once per block.
 */
type WindowKind = "5h" | "daily" | "weekly" | "monthly";

function scopeForKind(kind: WindowKind): string {
  const now = dayjs();
  if (kind === "5h") {
    const block = Math.floor(now.hour() / 5);
    return `${now.format("YYYY-MM-DD")}-block${block}`;
  }
  if (kind === "daily") return now.format("YYYY-MM-DD");
  if (kind === "monthly") return now.format("YYYY-MM");
  // weekly: day-of-year / 7
  const dayOfYear = now.diff(now.startOf("year"), "day");
  return `${now.year()}-w${Math.floor(dayOfYear / 7)}`;
}

const TOAST_LABEL: Record<WindowKind, string> = {
  "5h": "last 5h",
  daily: "today",
  weekly: "this week",
  monthly: "this month",
};

function useThresholdToast(
  fiveHourOver: boolean,
  dailyOver: boolean,
  weeklyOver: boolean,
  monthlyOver: boolean,
  fiveHourUsd: number,
  todayUsd: number,
  weekUsd: number,
  monthUsd: number,
) {
  const money = useMoney();
  const prev = useRef({
    "5h": false,
    daily: false,
    weekly: false,
    monthly: false,
  } as Record<WindowKind, boolean>);
  useEffect(() => {
    const fire = (kind: WindowKind, spent: number) => {
      const scope = scopeForKind(kind);
      const key = `haetae:threshold-toasted-${kind}-${scope}`;
      if (typeof window === "undefined") return;
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
      toast.warning(
        `${TOAST_LABEL[kind]} cost exceeded the threshold — ${money.format(spent)}`,
      );
    };

    if (fiveHourOver && !prev.current["5h"]) fire("5h", fiveHourUsd);
    if (dailyOver && !prev.current.daily) fire("daily", todayUsd);
    if (weeklyOver && !prev.current.weekly) fire("weekly", weekUsd);
    if (monthlyOver && !prev.current.monthly) fire("monthly", monthUsd);
    prev.current = {
      "5h": fiveHourOver,
      daily: dailyOver,
      weekly: weeklyOver,
      monthly: monthlyOver,
    };
  }, [
    fiveHourOver,
    dailyOver,
    weeklyOver,
    monthlyOver,
    fiveHourUsd,
    todayUsd,
    weekUsd,
    monthUsd,
  ]);
}

interface SidebarProps {
  /** Whether the drawer is open on mobile (<lg). Ignored on lg+ where
      the sidebar is always visible. Defaults to false so tests / older
      callers that don't pass the prop still render the desktop shape. */
  mobileOpen?: boolean;
  /** Fired when the user dismisses the drawer (backdrop tap / nav). */
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps = {}) {
  const { openPalette } = useCommandPalette();
  const projects = useProjects();
  const status = useThresholdStatus();
  useThresholdToast(
    status.fiveHourOver,
    status.dailyOver,
    status.weeklyOver,
    status.monthlyOver,
    status.fiveHourUsd,
    status.todayUsd,
    status.weekUsd,
    status.monthUsd,
  );
  return (
    <>
      {/* Backdrop — only painted when the drawer is open on <lg. Tap
          dismisses without navigating. lg:hidden so it never blocks
          desktop content. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-bg-inverse/60 lg:hidden"
        />
      )}
      <div
        className={cn(
          // Static column on lg+ — preserved as the original sidebar.
          "w-52 h-screen bg-bg-secondary border-r border-border-main flex flex-col shrink-0 font-sans",
          // <lg: fixed-positioned drawer that slides in from the left.
          // The transform animates between `-translate-x-full` (off) and
          // `translate-x-0` (on). On lg+ we override back to static.
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:translate-x-0 lg:transition-none",
        )}
      >
      <div className="p-3 flex items-center gap-2 border-b border-border-main bg-bg-secondary">
        <div className="w-8 h-8 flex items-center justify-center border border-border-main bg-bg-primary">
          <HaetaeLogo size={22} className="text-text-main" />
        </div>
        <div className="flex flex-col">
          <span className="text-[16px] font-black leading-tight tracking-tighter text-text-main">
            HAETAE
          </span>
          <span className="text-[9px] text-text-muted px-1 leading-none self-start mt-0.5 font-mono uppercase tracking-wider">
            {APP_VERSION}
          </span>
        </div>
      </div>

      <div className="p-2 border-b border-border-main">
        <button
          type="button"
          onClick={openPalette}
          className="w-full flex items-center justify-between gap-2 bg-bg-primary text-text-muted border border-border-main py-1.5 px-2 text-[10px] font-bold hover:bg-bg-hover transition-colors"
        >
          <span className="flex items-center gap-2">
            <Search size={12} />
            <span>FIND MODULE...</span>
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider opacity-60">
            ⌘K
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1 py-2">
        <SectionHeader
          label="Watching"
          badge={status.anyOver ? "OVER" : undefined}
        />
        <NavItem
          icon={<LayoutDashboard size={14} />}
          label="Overview"
          to="/watching/overview"
          shortcut="1"
        />
        <NavItem
          icon={<BarChart3 size={14} />}
          label="Local Usage"
          to="/watching/local"
          shortcut="2"
        />
        <NavItem
          icon={<Zap size={14} />}
          label="API Cost"
          to="/watching/api"
          shortcut="3"
        />
        <NavItem
          icon={<Layers size={14} />}
          label="Unified"
          to="/watching/unified"
          shortcut="4"
        />
        <NavItem
          icon={<History size={14} />}
          label="Sessions"
          to="/watching/sessions/"
          shortcut="5"
        />
        <NavItem
          icon={<BrainCircuit size={14} />}
          label="Memories"
          to="/watching/memories/"
          shortcut="6"
        />
        <NavItem
          icon={<Share2 size={14} />}
          label="Graph"
          to="/watching/graph/"
          shortcut="7"
        />
        <NavItem
          icon={<Fingerprint size={14} />}
          label="Voice"
          to="/watching/voice/"
          shortcut="8"
        />
        <NavItem
          icon={<Library size={14} />}
          label="Knowledge"
          to="/watching/knowledge/"
          shortcut="9"
        />

        <SectionHeader label="Guarding" />
        <NavItem
          icon={<BookOpen size={14} />}
          label="CLAUDE.md"
          to="/guarding/claude-md"
        />
        <NavItem
          icon={<ShieldCheck size={14} />}
          label="Rules"
          to="/guarding/rules"
        />
        <NavItem
          icon={<FileCode size={14} />}
          label="Global Rules"
          to="/guarding/global-rules"
        />
        <NavItem
          icon={<Command size={14} />}
          label="Skills"
          to="/guarding/skills"
        />

        <SectionHeader label="Working" />
        <NavItem
          icon={<Terminal size={14} />}
          label="Terminal"
          to="/working/terminal"
        />

        <SectionHeader label="Research" />
        <NavItem
          icon={<Search size={14} />}
          label="Notebooks"
          to="/research/notebooks/"
        />

        <SectionHeader label="Projects" />
        <ProjectsList
          isLoading={projects.isPending}
          isError={projects.isError}
          entries={projects.data ?? []}
        />
      </div>

      <div className="border-t border-border-main p-2 bg-bg-secondary space-y-1.5">
        <div className="text-[10px] text-text-muted font-bold">ACCOUNT</div>
        <SubscriptionBadge />
      </div>

      <div className="p-1 border-t border-border-main">
        <NavItem icon={<Settings size={14} />} label="Settings" to="/settings" />
      </div>
      </div>
    </>
  );
}
