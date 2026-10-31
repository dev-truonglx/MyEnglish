/**
 * Chrome Extension stand-ins for desktop-only plugins: updater, process, autostart.
 */
export type Update = {
  version: string;
  body?: string;
  downloadAndInstall: (cb?: (e: DownloadEvent) => void) => Promise<void>;
};
export type DownloadEvent = { event: string; data?: unknown };

export const check = async (): Promise<Update | null> => null;
export const relaunch = async (): Promise<void> => {
  if (typeof chrome !== "undefined" && chrome.runtime?.reload) {
    chrome.runtime.reload();
  } else if (typeof window !== "undefined") {
    window.location.reload();
  }
};
export const exit = async (): Promise<void> => {
  if (typeof window !== "undefined") window.close();
};

export const enable = async (): Promise<void> => {};
export const disable = async (): Promise<void> => {};
export const isEnabled = async (): Promise<boolean> => false;
