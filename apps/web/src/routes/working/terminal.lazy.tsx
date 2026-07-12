import { useEffect } from "react";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Route as TerminalRoute } from "./terminal";
import { useTerminalDock } from "@/components/TerminalDock";

export const Route = createLazyFileRoute("/working/terminal")({
  component: TerminalPage,
});

/**
 * 빈 placeholder. 실제 터미널 (xterm + WS + 탭) 은 root layout 의
 * TerminalDockProvider 에 항상 mount 되어 있어 라우트 이동 시에도
 * PTY 가 살아있다. 이 컴포넌트는 단지 (a) URL search 에서 cwd /
 * autoCommand 가 들어오면 dock 에 \"새 탭 spawn 해주세요\" 를 한 번
 * 보내고 (b) dock 이 자기 영역을 보여주도록 라우트를 점유.
 */
function TerminalPage() {
  const { cwd, autoCommand } = TerminalRoute.useSearch();
  const dock = useTerminalDock();

  useEffect(() => {
    if (cwd === undefined && autoCommand === undefined) return;
    dock.requestSpawn({ cwd, autoCommand });
  }, [cwd, autoCommand, dock]);

  // 보이는 영역 자체는 dock 이 fixed-layer 로 그림. 라우트는 빈 슬롯만
  // 차지해 다른 페이지의 max-width 흐름을 깨지 않게.
  return null;
}
