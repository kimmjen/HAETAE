import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ProjectRootsManager } from "@/components/ProjectRootsManager";
import { ThresholdSettings } from "@/components/ThresholdSettings";
import { CurrencySettings } from "@/components/CurrencySettings";
import { NotebookLMSettings } from "@/components/NotebookLMSettings";

function ApiKeyField() {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
        Anthropic Admin API Key
      </label>
      <input
        type="password"
        placeholder="sk-ant-admin-..."
        readOnly
        aria-disabled="true"
        title="Set via apps/server/.env.local (no UI input)"
        className="w-full bg-bg-secondary text-text-subtle border border-border-subtle px-3 py-2 text-[12px] font-bold cursor-not-allowed placeholder:text-text-subtle"
      />
      <p className="text-[10px] text-text-subtle font-mono">
        For safety the Organization Admin key is never entered via the UI — set
        ANTHROPIC_ADMIN_KEY in apps/server/.env.local and restart the server to enable API Cost / Unified.
      </p>
    </div>
  );
}

type SectionKey = "projects" | "thresholds" | "currency" | "notebooklm" | "apikey";

const SECTIONS: { key: SectionKey; label: string; hint: string; render: () => ReactNode }[] = [
  { key: "projects", label: "Project Roots", hint: "프로젝트 루트", render: () => <ProjectRootsManager /> },
  { key: "thresholds", label: "Cost Thresholds", hint: "비용 임계치", render: () => <ThresholdSettings /> },
  { key: "currency", label: "Display Currency", hint: "표시 통화", render: () => <CurrencySettings /> },
  { key: "notebooklm", label: "NotebookLM", hint: "리서치 연동", render: () => <NotebookLMSettings /> },
  { key: "apikey", label: "API Key", hint: "어드민 키", render: () => <ApiKeyField /> },
];

export function SettingsView() {
  const [active, setActive] = useState<SectionKey>("projects");
  const current = SECTIONS.find((s) => s.key === active) ?? SECTIONS[0];

  return (
    <div className="flex border border-border-main bg-bg-primary min-h-[24rem]">
      {/* Master — section list */}
      <nav className="w-44 shrink-0 border-r border-border-main bg-bg-secondary">
        <div className="px-3 py-2 text-[11px] font-bold uppercase text-text-main border-b border-border-main">
          Settings
        </div>
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={active === s.key}
                className={cn(
                  "w-full text-left px-3 py-2 border-b border-border-subtle transition-colors",
                  active === s.key
                    ? "bg-bg-primary text-text-main border-l-2 border-l-accent"
                    : "text-text-muted hover:bg-bg-hover hover:text-text-main",
                )}
              >
                <div className="text-[11px] font-bold">{s.label}</div>
                <div className="text-[9px] font-mono text-text-subtle uppercase tracking-wider">{s.hint}</div>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Detail — selected section */}
      <div className="flex-1 min-w-0 p-6">{current.render()}</div>
    </div>
  );
}
