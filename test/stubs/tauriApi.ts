/**
 * No-op test doubles for the Tauri JS APIs used by services (core, event, notification,
 * process, updater, window). Tests that need specific behaviour can vi.mock these.
 */
export const invoke = async (_cmd: string, _args?: unknown): Promise<unknown> => undefined;
export const listen = async (_event: string, _handler: unknown): Promise<() => void> => () => {};
export const emit = async (_event: string, _payload?: unknown): Promise<void> => {};

export const isPermissionGranted = async (): Promise<boolean> => true;
export const requestPermission = async (): Promise<string> => "granted";
export const sendNotification = (_options: unknown): void => {};

export const relaunch = async (): Promise<void> => {};
export const check = async (): Promise<null> => null;
export type Update = unknown;
export type DownloadEvent = unknown;

export const getCurrentWindow = () => ({ label: "main" });
export const getCurrentWebviewWindow = () => ({ label: "main" });
