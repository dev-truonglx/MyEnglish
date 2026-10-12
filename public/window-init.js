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

  // Disable native autocomplete, autocorrect, autocapitalize, and spellcheck globally on all text inputs
  try {
    var disableAutofill = function (el) {
      if (!el || !el.tagName) return;
      var tag = el.tagName.toUpperCase();
      if (tag === 'INPUT') {
        var t = (el.getAttribute('type') || 'text').toLowerCase();
        if (['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'reset'].indexOf(t) === -1) {
          el.setAttribute('autocomplete', 'off');
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('autocapitalize', 'off');
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('data-gramm', 'false');
          el.setAttribute('data-enable-grammarly', 'false');
          el.setAttribute('data-lpignore', 'true');
          el.setAttribute('data-1p-ignore', 'true');
          el.setAttribute('data-form-type', 'other');
        }
      } else if (tag === 'TEXTAREA') {
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
        el.setAttribute('data-gramm', 'false');
        el.setAttribute('data-enable-grammarly', 'false');
        el.setAttribute('data-lpignore', 'true');
        el.setAttribute('data-1p-ignore', 'true');
        el.setAttribute('data-form-type', 'other');
      } else if (tag === 'FORM') {
        el.setAttribute('autocomplete', 'off');
      }
    };

    document.addEventListener('focusin', function (e) {
      disableAutofill(e.target);
    }, true);

    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType === 1) {
              disableAutofill(node);
              var inputs = node.querySelectorAll('input, textarea, form');
              for (var k = 0; k < inputs.length; k++) {
                disableAutofill(inputs[k]);
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {}
})();

