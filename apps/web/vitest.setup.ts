import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// sigma references WebGL(2)RenderingContext at module load for a feature
// check. happy-dom/jsdom don't define them, so importing any module that
// pulls in sigma (ProjectGraphPanel → ProjectWikiPanel → ProjectRulesView)
// throws ReferenceError at import time. Components under test never actually
// render WebGL, so a bare stub is enough to let the module load.
const g = globalThis as Record<string, unknown>;
if (typeof g.WebGL2RenderingContext === "undefined") g.WebGL2RenderingContext = class {};
if (typeof g.WebGLRenderingContext === "undefined") g.WebGLRenderingContext = class {};

afterEach(() => {
  cleanup();
});
