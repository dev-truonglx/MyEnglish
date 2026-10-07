// Runs before the app bundle: make floating windows transparent from the first paint.
// Kept as a file (not an inline <script>) so the CSP can use script-src 'self' without hashes.
(function () {
  try {
    var p = new URLSearchParams(window.location.search);
    var w = p.get('window');
    var internals = window.__TAURI_INTERNALS__;
    var tauriLabel = internals && internals.metadata && internals.metadata.currentWindow
      ? internals.metadata.currentWindow.label
      : undefined;
    var floating = ['review-popup', 'quick-input', 'review-nudge'];
    if (floating.indexOf(w) !== -1 || floating.indexOf(tauriLabel) !== -1) {
      document.documentElement.classList.add('transparent-window');
      document.documentElement.style.background = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    }
  } catch (e) {}
})();
