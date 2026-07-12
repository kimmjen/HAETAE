/**
 * Local-only Monaco loader. The default @monaco-editor/react config pulls
 * Monaco from a CDN at runtime — Haetae is offline-by-default so we bundle
 * the editor with the rest of the app instead.
 *
 * The route that imports this module (`routes/guarding/rules.lazy.tsx`)
 * is split out by TanStack Router, so Monaco only enters the bundle the
 * user is loading the rules editor.
 */
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { loader } from "@monaco-editor/react";

self.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

loader.config({ monaco });
