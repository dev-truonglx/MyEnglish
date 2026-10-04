export type ThemeMode = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "myenglish_theme_mode_v1";

/**
 * Get saved theme preference or default to "dark"
 */
export function getSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {}
  return "dark";
}

/**
 * Apply theme classes to document.documentElement
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;

  let effectiveDark = true;
  if (mode === "dark") {
    effectiveDark = true;
  } else if (mode === "light") {
    effectiveDark = false;
  } else {
    // system
    effectiveDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  if (effectiveDark) {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
}

/**
 * Set and persist theme mode
 */
export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("myenglish-theme-changed", { detail: { mode } }));
}

/**
 * Initialize theme listener on app start
 */
export function initTheme(): () => void {
  const current = getSavedTheme();
  applyTheme(current);

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemChange = () => {
    if (getSavedTheme() === "system") {
      applyTheme("system");
    }
  };

  mediaQuery.addEventListener("change", handleSystemChange);

  // Floating windows (nudge/popup/quick-input) live as long as the app: localStorage is shared
  // across same-origin webviews, so follow theme changes made in the main window
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(getSavedTheme());
  };
  // Re-check when a hidden window is shown again
  const handleVisibility = () => {
    if (document.visibilityState === "visible") applyTheme(getSavedTheme());
  };
  window.addEventListener("storage", handleStorage);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    mediaQuery.removeEventListener("change", handleSystemChange);
    window.removeEventListener("storage", handleStorage);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
