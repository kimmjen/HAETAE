import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="p-1.5 border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
    >
      {isDark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
