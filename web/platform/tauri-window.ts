/** Web stand-in for @tauri-apps/api/window, /webview and /webviewWindow: one window, the tab, labelled "main". */
const current = {
  label: "main",
  isVisible: async () => typeof document === "undefined" || document.visibilityState === "visible",
  isFocused: async () => typeof document !== "undefined" && document.hasFocus(),
  show: async () => {},
  hide: async () => {},
  close: async () => {},
  setFocus: async () => window.focus(),
  unminimize: async () => {},
  listen: async () => () => {},
  onFocusChanged: async () => () => {},
};

export const getCurrentWindow = () => current;
export const getCurrentWebviewWindow = () => current;
export const getCurrentWebview = () => current;
