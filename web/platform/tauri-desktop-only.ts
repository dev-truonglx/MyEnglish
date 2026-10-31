/**
 * Web stand-ins for the desktop-only plugins: updater (the site updates on reload), process, autostart.
 */
export type Update = {
  version: string;
  body?: string;
  downloadAndInstall: (cb?: (e: DownloadEvent) => void) => Promise<void>;
};
export type DownloadEvent = { event: string; data?: unknown };

/** No app update on the web: a new deploy is picked up on the next load */
export const check = async (): Promise<Update | null> => null;
export const relaunch = async (): Promise<void> => window.location.reload();
export const exit = async (): Promise<void> => {};

export const enable = async (): Promise<void> => {};
export const disable = async (): Promise<void> => {};
export const isEnabled = async (): Promise<boolean> => false;
