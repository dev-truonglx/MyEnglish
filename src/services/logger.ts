import { invoke } from "@tauri-apps/api/core";

export function logTerminal(tag: string, message: string) {
  console.log(`[${tag}] ${message}`);
  invoke("log_debug", { tag, message }).catch(() => {});
}
