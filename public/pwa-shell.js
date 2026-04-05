(() => {
  const DISMISS_KEY = 'pwaInstallDismissedUntilV1';
  const IOS_TIP_KEY = 'pwaIosTipDismissedV1';
  let deferredPrompt = null;
  let installBar = null;
  let installFab = null;
  let installSheet = null;

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
    syncInstallUi();
  }

  function currentInstallTitle() {
    return document.body && document.body.dataset && document.body.dataset.pwaInstallTitle
      ? document.body.dataset.pwaInstallTitle
      : 'Add to Home Screen';
  }

  function currentInstallMessage() {
    return document.body && document.body.dataset && document.body.dataset.pwaInstallMessage
      ? document.body.dataset.pwaInstallMessage
      : 'Install for quicker access.';
  }

  function currentAppTitle() {
    return document.body && document.body.dataset && document.body.dataset.pwaTitle
      ? document.body.dataset.pwaTitle
      : 'this app';
  }

  function canShowInstallUi() {
    if (isStandalone()) return false;
    return Boolean(deferredPrompt) || isIosSafari();
  }

  function buildSheetContent() {
    const appTitle = currentAppTitle();
    if (isIosSafari()) {
      return {
        title: `Install ${appTitle}`,
        intro: `Save ${appTitle} to your Home Screen for a cleaner, app-like launch.`,
        steps: [
          'Tap the Share button in Safari.',
          'Scroll down and choose Add to Home Screen.',
          'Tap Add in the upper-right corner.',
        ],
        confirmLabel: 'Got It',
      };
    }
    return {
      title: `Install ${appTitle}`,
      intro: `Install ${appTitle} so it opens in standalone mode with faster access from your Home Screen.`,
      steps: [
        'Tap Install below.',
        'Confirm the browser install prompt.',
        'Launch it from your Home Screen like an app.',
      ],
      confirmLabel: 'Install Now',
    };
  }

  function ensureInstallSheet() {
    if (installSheet) return installSheet;
    installSheet = document.createElement('div');
    installSheet.className = 'pwa-install-sheet';
    installSheet.innerHTML = `
      <div class="pwa-install-sheet-backdrop" data-pwa-sheet-close></div>
      <div class="pwa-install-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="pwaInstallSheetTitle">
        <div class="pwa-install-sheet-handle"></div>
        <div class="pwa-install-sheet-copy">
          <strong id="pwaInstallSheetTitle"></strong>
          <p id="pwaInstallSheetIntro"></p>
          <ol id="pwaInstallSheetSteps" class="pwa-install-steps"></ol>
        </div>
        <div class="pwa-install-sheet-actions">
          <button id="pwaInstallSheetConfirm" class="pwa-sheet-primary" type="button"></button>
          <button id="pwaInstallSheetDismiss" class="pwa-sheet-secondary" type="button">Not Now</button>
        </div>
      </div>
    `;
    document.body.appendChild(installSheet);

    installSheet.querySelectorAll('[data-pwa-sheet-close]').forEach((node) => {
      node.addEventListener('click', hideInstallSheet);
    });
    installSheet.querySelector('#pwaInstallSheetDismiss').addEventListener('click', () => {
      if (isIosSafari()) setDismissed(IOS_TIP_KEY, 14);
      else setDismissed(DISMISS_KEY, 14);
      hideInstallSheet();
      syncInstallUi();
    });
    installSheet.querySelector('#pwaInstallSheetConfirm').addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          await deferredPrompt.userChoice;
        } catch (_err) {}
        deferredPrompt = null;
      } else if (isIosSafari()) {
        setDismissed(IOS_TIP_KEY, 14);
      }
      hideInstallSheet();
      hideInstallBar();
      syncInstallUi();
    });
    return installSheet;
  }

  function showInstallSheet() {
    if (!canShowInstallUi()) return;
    const sheet = ensureInstallSheet();
    const content = buildSheetContent();
    const titleEl = sheet.querySelector('#pwaInstallSheetTitle');
    const introEl = sheet.querySelector('#pwaInstallSheetIntro');
    const stepsEl = sheet.querySelector('#pwaInstallSheetSteps');
    const confirmEl = sheet.querySelector('#pwaInstallSheetConfirm');
    if (titleEl) titleEl.textContent = content.title;
    if (introEl) introEl.textContent = content.intro;
    if (stepsEl) {
      stepsEl.innerHTML = content.steps.map((step) => `<li>${step}</li>`).join('');
    }
    if (confirmEl) confirmEl.textContent = content.confirmLabel;
    sheet.classList.add('visible');
  }

  function hideInstallSheet() {
    if (!installSheet) return;
    installSheet.classList.remove('visible');
  }

  function ensureInstallFab() {
    if (installFab) return installFab;
    installFab = document.createElement('button');
    installFab.className = 'pwa-install-fab';
    installFab.type = 'button';
    installFab.innerHTML = '<span class="pwa-install-fab-icon">+</span><span class="pwa-install-fab-label">Install App</span>';
    installFab.addEventListener('click', () => {
      if (deferredPrompt) {
        showInstallSheet();
        return;
      }
      if (isIosSafari()) {
        showInstallSheet();
      }
    });
    document.body.appendChild(installFab);
    return installFab;
  }

  function syncInstallUi() {
    const shouldShow = canShowInstallUi();
    if (installFab) installFab.classList.toggle('visible', shouldShow);
    if (!shouldShow) {
      hideInstallBar();
      hideInstallSheet();
    }
  }

  function ensureInstallBar() {
    if (installBar) return installBar;
    const installTitle = currentInstallTitle();
    const installMessage = currentInstallMessage();
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
        showInstallSheet();
        return;
      }
      if (isIosSafari()) {
        showInstallSheet();
        return;
      }
      hideInstallBar();
    });

    dismissButton.addEventListener('click', () => {
      if (deferredPrompt) setDismissed(DISMISS_KEY, 14);
      else setDismissed(IOS_TIP_KEY, 14);
      hideInstallBar();
      syncInstallUi();
    });

    return installBar;
  }

  function setInstallMessage(message, installLabel = 'Install') {
    const bar = ensureInstallBar();
    const titleEl = bar.querySelector('#pwaInstallTitle');
    const messageEl = bar.querySelector('#pwaInstallMessage');
    const installButton = bar.querySelector('#pwaInstallButton');
    const defaultTitle = currentInstallTitle();
    if (titleEl) titleEl.textContent = defaultTitle;
    if (messageEl) messageEl.textContent = message;
    if (installButton) installButton.textContent = installLabel;
  }

  function showInstallBar() {
    if (isStandalone()) return;
    ensureInstallBar().classList.add('visible');
    ensureInstallFab();
    syncInstallUi();
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
    ensureInstallFab();
    syncInstallUi();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBar();
    hideInstallSheet();
    applyStandaloneClass();
  });

  window.addEventListener('DOMContentLoaded', () => {
    applyStandaloneClass();
    ensureInstallFab();
    maybeShowIosTip();
    syncInstallUi();
  });

  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', applyStandaloneClass);
  } catch (_err) {}
})();
