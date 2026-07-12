import { useEffect, useState } from "react";
import { toast } from "sonner";
import { setThresholds } from "@/lib/thresholds";
import { useMoney } from "@/lib/currency";
import { useThresholdStatus } from "@/hooks/useThresholds";

/**
 * 4 number inputs (5h / daily / weekly / monthly USD) backed by localStorage.
 * 우리는 mid-edit 값으로 OVER 판정을 안 하기 위해 입력은 draft 만 두고
 * Save 눌러야 적용. \"1\" 만 친 상태에서 미리 trip 되는 일 방지.
 */
export function ThresholdSettings() {
  const status = useThresholdStatus();

  const init = (v: number | null) => (v === null ? "" : String(v));

  const [fiveHourDraft, setFiveHourDraft] = useState(init(status.thresholds.fiveHourUsd));
  const [dailyDraft, setDailyDraft] = useState(init(status.thresholds.dailyUsd));
  const [weeklyDraft, setWeeklyDraft] = useState(init(status.thresholds.weeklyUsd));
  const [monthlyDraft, setMonthlyDraft] = useState(init(status.thresholds.monthlyUsd));

  useEffect(() => {
    setFiveHourDraft(init(status.thresholds.fiveHourUsd));
    setDailyDraft(init(status.thresholds.dailyUsd));
    setWeeklyDraft(init(status.thresholds.weeklyUsd));
    setMonthlyDraft(init(status.thresholds.monthlyUsd));
  }, [
    status.thresholds.fiveHourUsd,
    status.thresholds.dailyUsd,
    status.thresholds.weeklyUsd,
    status.thresholds.monthlyUsd,
  ]);

  const onSave = () => {
    const parse = (raw: string): number | null => {
      const t = raw.trim();
      if (t === "") return null;
      const n = Number.parseFloat(t);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    setThresholds({
      fiveHourUsd: parse(fiveHourDraft),
      dailyUsd: parse(dailyDraft),
      weeklyUsd: parse(weeklyDraft),
      monthlyUsd: parse(monthlyDraft),
    });
    toast.success("Thresholds saved");
  };

  const onClear = () => {
    setFiveHourDraft("");
    setDailyDraft("");
    setWeeklyDraft("");
    setMonthlyDraft("");
    setThresholds({
      fiveHourUsd: null,
      dailyUsd: null,
      weeklyUsd: null,
      monthlyUsd: null,
    });
    toast.success("Thresholds cleared");
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Cost Thresholds (USD)
        </label>
        <p className="text-[10px] text-text-subtle font-mono mt-1">
          Based on Local Usage (jsonl). Crossing a threshold shows the sidebar
          OVER badge + a one-time toast, and fills the Rolling Windows
          progress bars on Overview.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ThresholdField
          label="5h"
          placeholder="e.g. 5"
          value={fiveHourDraft}
          onChange={setFiveHourDraft}
          spent={status.fiveHourUsd}
          over={status.fiveHourOver}
          spentLabel="last 5h"
        />
        <ThresholdField
          label="Daily"
          placeholder="e.g. 50"
          value={dailyDraft}
          onChange={setDailyDraft}
          spent={status.todayUsd}
          over={status.dailyOver}
          spentLabel="today"
        />
        <ThresholdField
          label="Weekly"
          placeholder="e.g. 200"
          value={weeklyDraft}
          onChange={setWeeklyDraft}
          spent={status.weekUsd}
          over={status.weeklyOver}
          spentLabel="this week"
        />
        <ThresholdField
          label="Monthly"
          placeholder="e.g. 1000"
          value={monthlyDraft}
          onChange={setMonthlyDraft}
          spent={status.monthUsd}
          over={status.monthlyOver}
          spentLabel="this month"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1.5 text-[10px] font-bold uppercase border border-border-main bg-accent text-text-on-accent hover:opacity-90 transition-opacity"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

function ThresholdField({
  label,
  placeholder,
  value,
  onChange,
  spent,
  over,
  spentLabel,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  spent: number;
  over: boolean;
  spentLabel: string;
}) {
  const money = useMoney();
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
        {label}
      </label>
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-primary text-text-main border border-border-main px-3 py-2 text-[12px] font-bold tabular-nums focus:outline-none focus:border-accent"
      />
      <div className="text-[10px] font-mono">
        <span className="text-text-subtle">{spentLabel}: </span>
        <span className={over ? "text-danger font-bold" : "text-text-muted"}>
          {money.format(spent)}
        </span>
      </div>
    </div>
  );
}
