// Installable / offline support (spec 07 §12).

export function setupPWA({ installButton }) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Relative URL so it works under the GitHub Pages sub-path.
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }

  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    deferred = null;
    installButton.hidden = true;
  });
  addEventListener('appinstalled', () => { installButton.hidden = true; });
}
