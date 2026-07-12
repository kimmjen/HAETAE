import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { TerminalTabsView } from "@/views/TerminalTabsView";

/**
 * Persistent terminal dock — TerminalTabsView 가 root layout 에 단 한 번만
 * mount 되어 사용자가 다른 페이지로 이동해도 PTY / WebSocket / xterm
 * 인스턴스가 통째로 살아있게 한다. 라우트 이동 = 보이기 / 숨기기 만
 * CSS 로 토글.
 *
 * /working/terminal 라우트의 컴포넌트가 mount 될 때 \`requestSpawn\` 으로
 * 새 탭 spawn 을 부탁하는 형태. 같은 (cwd + autoCommand) 페어를 두 번
 * 부탁하면 무시 (back/forward navigation 으로 spawn 폭주 방지).
 */
interface DockApi {
  requestSpawn: (opts: { cwd?: string; autoCommand?: string }) => void;
}

const DockContext = createContext<DockApi | null>(null);

export function useTerminalDock(): DockApi {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error("useTerminalDock outside provider");
  return ctx;
}

interface PendingSpawn {
  cwd?: string;
  autoCommand?: string;
  /** Increment when the same (cwd, autoCommand) pair should be re-spawned. */
  nonce: number;
}

interface ProviderProps {
  children: ReactNode;
}

export function TerminalDockProvider({ children }: ProviderProps) {
  const location = useLocation();
  const visible = location.pathname === "/working/terminal";

  const [spawn, setSpawn] = useState<PendingSpawn | null>(null);
  const lastKeyRef = useRef<string | null>(null);

  // Clear the spawn-dedup when leaving the terminal route. The dedup stops a
  // single visit (and StrictMode's double-effect) from spawning twice, but it
  // must not permanently block a later launch of the SAME (cwd, autoCommand) —
  // e.g. clicking "re-authenticate" again returns to the same URL and should
  // open a fresh tab, not be silently ignored.
  useEffect(() => {
    if (!visible) lastKeyRef.current = null;
  }, [visible]);

  const requestSpawn = useCallback(
    (opts: { cwd?: string; autoCommand?: string }) => {
      const key = `${opts.cwd ?? ""}::${opts.autoCommand ?? ""}`;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      setSpawn((prev) => ({
        cwd: opts.cwd,
        autoCommand: opts.autoCommand,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    },
    [],
  );

  const api = useMemo<DockApi>(() => ({ requestSpawn }), [requestSpawn]);

  return (
    <DockContext.Provider value={api}>
      {children}
      <div
        aria-hidden={!visible}
        // 라우트가 /working/terminal 이 아닐 때 화면 밖으로 보내지만 mount
        // + layout 은 유지. display:none 으로 숨기면 xterm 의 fit addon /
        // ResizeObserver 가 0×0 으로 잘못 측정해 다시 보일 때 1행짜리
        // 터미널이 되는 케이스를 피한다. visibility:hidden + pointer-events
        // 차단으로 사실상 invisible 한 활성 상태.
        //
        // 너비는 사이드바 (w-52) 오른쪽부터 우측 끝까지 padding 만 두고
        // 통째로. 이전 라우트 안에 있을 때처럼 max-w 제한을 또 걸면
        // 터미널이 좁아 보이는 문제가 생긴다.
        className={
          visible
            ? "fixed top-12 left-52 right-0 bottom-6 p-4 bg-bg-primary overflow-hidden z-30"
            : "fixed top-12 left-52 right-0 bottom-6 p-4 bg-bg-primary overflow-hidden z-[-1] invisible pointer-events-none"
        }
      >
        <TerminalTabsView pendingSpawn={spawn} />
      </div>
    </DockContext.Provider>
  );
}
