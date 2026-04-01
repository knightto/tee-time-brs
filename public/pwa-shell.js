(() => {
  const DISMISS_KEY = 'pwaInstallDismissedUntilV1';
  const IOS_TIP_KEY = 'pwaIosTipDismissedV1';
  let deferredPrompt = null;
  let installBar = null;

  const isStandalone = () => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch (_err) {
      return window.navigator.standalone === true;
    }
  };

  const isIosSafari = () => {
    const ua = window.navigator.userAgent || '';
    const isiOS = /iphone|ipad|ipod/i.test(ua);
    const isWebkit = /webkit/i.test(ua);
    const isCriOS = /crios/i.test(ua);
    const isFxiOS = /fxios/i.test(ua);
    return isiOS && isWebkit && !isCriOS && !isFxiOS;
  };

  function dismissed(key) {
    try {
      const value = Number(localStorage.getItem(key) || 0);
      return Number.isFinite(value) && value > Date.now();
    } catch (_err) {
      return false;
    }
  }

  function setDismissed(key, days = 7) {
    try {
      localStorage.setItem(key, String(Date.now() + (days * 24 * 60 * 60 * 1000)));
    } catch (_err) {}
  }

  function applyStandaloneClass() {
    document.body.classList.toggle('standalone-app', isStandalone());
    document.body.classList.toggle('browser-app', !isStandalone());
  }

  function ensureInstallBar() {
    if (installBar) return installBar;
    const installTitle = document.body && document.body.dataset && document.body.dataset.pwaInstallTitle
      ? document.body.dataset.pwaInstallTitle
      : 'Add to Home Screen';
    const installMessage = document.body && document.body.dataset && document.body.dataset.pwaInstallMessage
      ? document.body.dataset.pwaInstallMessage
      : 'Install for quicker access.';
    installBar = document.createElement('div');
    installBar.className = 'pwa-install-bar';
    installBar.innerHTML = `
      <div class="pwa-install-copy">
        <strong id="pwaInstallTitle">${installTitle}</strong>
        <span id="pwaInstallMessage">${installMessage}</span>
      </div>
      <div class="pwa-install-actions">
        <button id="pwaInstallButton" class="pwa-install-btn" type="button">Install</button>
        <button id="pwaDismissButton" class="pwa-dismiss-btn" type="button">Not Now</button>
      </div>
    `;
    document.body.appendChild(installBar);

    const installButton = installBar.querySelector('#pwaInstallButton');
    const dismissButton = installBar.querySelector('#pwaDismissButton');

    installButton.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch (_err) {}
        deferredPrompt = null;
        hideInstallBar();
        return;
      }
      hideInstallBar();
      setDismissed(IOS_TIP_KEY, 14);
    });

    dismissButton.addEventListener('click', () => {
      if (deferredPrompt) setDismissed(DISMISS_KEY, 14);
      else setDismissed(IOS_TIP_KEY, 14);
      hideInstallBar();
    });

    return installBar;
  }

  function setInstallMessage(message, installLabel = 'Install') {
    const bar = ensureInstallBar();
    const titleEl = bar.querySelector('#pwaInstallTitle');
    const messageEl = bar.querySelector('#pwaInstallMessage');
    const installButton = bar.querySelector('#pwaInstallButton');
    const defaultTitle = document.body && document.body.dataset && document.body.dataset.pwaInstallTitle
      ? document.body.dataset.pwaInstallTitle
      : 'Add to Home Screen';
    if (titleEl) titleEl.textContent = defaultTitle;
    if (messageEl) messageEl.textContent = message;
    if (installButton) installButton.textContent = installLabel;
  }

  function showInstallBar() {
    if (isStandalone()) return;
    ensureInstallBar().classList.add('visible');
  }

  function hideInstallBar() {
    if (!installBar) return;
    installBar.classList.remove('visible');
  }

  function maybeShowIosTip() {
    if (!isIosSafari() || isStandalone() || dismissed(IOS_TIP_KEY)) return;
    setInstallMessage('Use Share, then Add to Home Screen.', 'Got It');
    showInstallBar();
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (dismissed(DISMISS_KEY) || isStandalone()) return;
    deferredPrompt = event;
    setInstallMessage('Install for quicker access.', 'Install');
    showInstallBar();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBar();
    applyStandaloneClass();
  });

  window.addEventListener('DOMContentLoaded', () => {
    applyStandaloneClass();
    maybeShowIosTip();
  });

  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', applyStandaloneClass);
  } catch (_err) {}
})();
