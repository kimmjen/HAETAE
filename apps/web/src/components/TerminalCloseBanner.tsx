import { Link } from "@tanstack/react-router";

interface TerminalCloseBannerProps {
  /** WebSocket close code from the server (4400 / 4403 / 4500 / other). */
  code: number;
  /** Raw reason string the server attached to the close frame. */
  reason: string;
}

interface BannerCopy {
  /** Short headline shown in danger color. */
  title: string;
  /** Followup paragraph guiding the user to a next action. */
  hint: string;
  /** Optional in-app link the user can click to fix it. */
  link?: { to: string; label: string };
}

/**
 * Friendly error screen shown in place of xterm when the PTY WebSocket
 * is closed by the server with an application-level code (4xxx).
 *
 * The raw `reason` from the server is always shown verbatim so power
 * users can see what failed; the headline + hint are copy-edited per
 * known code so a new user knows where to go next (Settings, env vars,
 * report a bug…). Unknown 4xxx codes fall back to the raw reason only.
 */
export function TerminalCloseBanner({ code, reason }: TerminalCloseBannerProps) {
  const copy = bannerCopy(code);
  return (
    <div className="h-full flex items-center justify-center bg-terminal-bg p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-danger">
          {copy.title}
        </div>
        <div className="text-[12px] font-mono text-text-main break-words">{reason}</div>
        <div className="text-[11px] font-mono text-text-muted leading-relaxed">{copy.hint}</div>
        {copy.link && (
          <Link
            to={copy.link.to}
            className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-border-main bg-bg-secondary text-text-main hover:bg-bg-hover transition-colors"
          >
            {copy.link.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function bannerCopy(code: number): BannerCopy {
  switch (code) {
    case 4400:
      return {
        title: "Invalid cwd",
        hint: "Must be an absolute path (~ is OK) and exist on disk as a directory. Check the `cwd` value in the URL.",
      };
    case 4403:
      return {
        title: "cwd not allowed",
        hint: "This path isn't on the whitelist (claude home / env vars / project roots in Settings). Add it as a project root in Settings, or use a whitelisted path.",
        link: { to: "/settings", label: "Open Settings" },
      };
    case 4500:
      return {
        title: "PTY failed to start",
        hint: "Failed to spawn a shell — usually a node-pty spawn-helper permission issue. Re-run `pnpm install` and postinstall will re-apply chmod.",
      };
    default:
      return {
        title: "Connection closed",
        hint: `The server closed the connection with code ${code}. Try again or check the server logs.`,
      };
  }
}
