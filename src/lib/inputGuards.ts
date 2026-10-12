/**
 * Global input guards to enforce raw keyboard input only:
 * - Disable browser / OS autofill and autocomplete
 * - Disable OS / WebKit autocorrect, spellcheck, autocapitalize
 * - Suppress password managers (LastPass, 1Password, Bitwarden) and Grammarly injections
 */

export const RAW_INPUT_PROPS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-gramm": "false",
  "data-enable-grammarly": "false",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
} as const;

export function applyRawInputAttributes(el: Element | null | undefined | any): void {
  if (!el || typeof el.setAttribute !== "function") return;
  const tag = (el.tagName || "").toUpperCase();

  if (tag === "INPUT") {
    const type = (el.type || (typeof el.getAttribute === "function" ? el.getAttribute("type") : null) || "text").toLowerCase();
    if (!["checkbox", "radio", "range", "color", "file", "button", "submit", "reset"].includes(type)) {
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("data-gramm", "false");
      el.setAttribute("data-enable-grammarly", "false");
      el.setAttribute("data-lpignore", "true");
      el.setAttribute("data-1p-ignore", "true");
      el.setAttribute("data-form-type", "other");
    }
  } else if (tag === "TEXTAREA") {
    el.setAttribute("autocomplete", "off");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("data-gramm", "false");
    el.setAttribute("data-enable-grammarly", "false");
    el.setAttribute("data-lpignore", "true");
    el.setAttribute("data-1p-ignore", "true");
    el.setAttribute("data-form-type", "other");
  } else if (tag === "FORM") {
    el.setAttribute("autocomplete", "off");
  }
}

let initialized = false;

export function initStrictInputGuards(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const processNode = (node: Node) => {
    if (node instanceof HTMLElement) {
      applyRawInputAttributes(node);
      const inputs = node.querySelectorAll("input, textarea, form");
      for (let i = 0; i < inputs.length; i++) {
        applyRawInputAttributes(inputs[i]);
      }
    }
  };

  // Run on all initial elements
  document.querySelectorAll("input, textarea, form").forEach(applyRawInputAttributes);

  // Monitor newly rendered elements (React components, modals, tabs)
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(processNode);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // Intercept focus events in capture phase as immediate fallback
  document.addEventListener(
    "focusin",
    (e) => {
      if (e.target instanceof Element) {
        applyRawInputAttributes(e.target);
      }
    },
    true
  );
}
