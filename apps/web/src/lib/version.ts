import packageJson from "../../package.json";

/**
 * Human-readable version label rendered in the sidebar. The "-LCL"
 * suffix signals that this is the local-only build, distinct from any
 * future Tauri or hosted variant.
 */
export const APP_VERSION = `v${packageJson.version}-LCL`;
