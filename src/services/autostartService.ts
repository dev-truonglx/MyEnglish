import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";

const AUTOSTART_PREF_KEY = "myenglish_autostart_enabled_v1";

/**
 * Checks if autostart preference is saved.
 * If never configured before, defaults to true.
 */
export function getSavedAutostartPreference(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSTART_PREF_KEY);
    if (raw === null) {
      // Default is enabled
      return true;
    }
    return raw === "true";
  } catch {
    return true;
  }
}

/**
 * Synchronizes the OS autostart state with the user's preference.
 * Defaults to true if no preference was ever set.
 */
export async function syncAutostartWithSystem(): Promise<boolean> {
  const desired = getSavedAutostartPreference();
  try {
    const currentlyEnabled = await isEnabled();
    if (desired && !currentlyEnabled) {
      await enable();
    } else if (!desired && currentlyEnabled) {
      await disable();
    }
    return desired;
  } catch (err) {
    console.warn("Failed to sync autostart with OS:", err);
    return desired;
  }
}

/**
 * Updates the autostart preference and applies it to the OS.
 */
export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  try {
    localStorage.setItem(AUTOSTART_PREF_KEY, String(enabled));
    if (enabled) {
      await enable();
    } else {
      await disable();
    }
    window.dispatchEvent(
      new CustomEvent("myenglish-autostart-changed", { detail: { enabled } })
    );
    return true;
  } catch (err) {
    console.warn("Failed to set autostart in OS:", err);
    // Still save the preference in localStorage
    localStorage.setItem(AUTOSTART_PREF_KEY, String(enabled));
    window.dispatchEvent(
      new CustomEvent("myenglish-autostart-changed", { detail: { enabled } })
    );
    return false;
  }
}

/**
 * Checks the real-time status from the OS.
 */
export async function checkSystemAutostartStatus(): Promise<boolean> {
  try {
    return await isEnabled();
  } catch {
    return getSavedAutostartPreference();
  }
}
