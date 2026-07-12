import { useEffect, useState } from "react";
import { Outlet, createRootRouteWithContext, useMatches, useNavigate } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";
import { Footer } from "@/components/Footer";
import { CommandPalette, CommandPaletteProvider } from "@/components/command-palette";
import { TerminalDockProvider } from "@/components/TerminalDock";
import { NotFoundView } from "@/views/NotFoundView";
import { breadcrumbTitle } from "@/lib/breadcrumb";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundView,
});

function RootLayout() {
  const navigate = useNavigate();
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  const pathname = lastMatch?.pathname ?? "/";
  const title = breadcrumbTitle(pathname);
  const transitionKey = lastMatch?.id ?? pathname;

  // Mobile nav state lives at the shell so the hamburger (in TopHeader)
  // and the drawer (in Sidebar) share one source of truth. Above lg
  // (1024px) the drawer is irrelevant — Sidebar is permanently visible.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close drawer on route change so tapping a nav link doesn't leave it
  // covering the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // ESC closes the drawer. Bound once at shell level so it doesn't
  // fight with other key handlers (cmdk has its own ESC handling but
  // only while the palette is open).
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  return (
    <CommandPaletteProvider>
      <TerminalDockProvider>
        <div className="flex h-screen w-full overflow-hidden bg-bg-primary text-text-main font-sans select-none">
          <Sidebar
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />

          <main className="flex-1 flex flex-col overflow-hidden">
            <TopHeader
              title={title}
              onProfileClick={() => navigate({ to: "/profile" })}
              onMenuClick={() => setMobileNavOpen(true)}
            />

            <div className="flex-1 overflow-y-auto p-4 bg-bg-primary">
              <AnimatePresence mode="wait">
                <motion.div
                  key={transitionKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="max-w-[1600px] mx-auto w-full"
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>

            <Footer sessionId="A8F22X" cacheSize="1.2GB" status="READY TO SYNC" />
          </main>
          <CommandPalette />
        </div>
      </TerminalDockProvider>
    </CommandPaletteProvider>
  );
}

