// ---------- PWA: تسجيل الـ service worker + زر "ثبّت التطبيق" ----------
// أندرويد/كروم: نلتقط beforeinstallprompt ونعرض زر تثبيت حقيقي.
// آيفون (سفاري): ما يدعم هذا الحدث، فنعرض تعليمات "مشاركة ← إضافة إلى الشاشة الرئيسية".
let deferredInstallPrompt = null;

function isStandaloneApp() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isIosSafari() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW register failed:', e));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  refreshInstallButtons();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  refreshInstallButtons();
  if (typeof showToast === 'function') showToast('تم تثبيت تاجرلي على جهازك ✅');
});

// الزر يظهر فقط لو التثبيت ممكن (أندرويد/كروم) أو آيفون، وما يظهر لو التطبيق مثبّت أصلاً
function canOfferInstall() {
  if (isStandaloneApp()) return false;
  return !!deferredInstallPrompt || isIosSafari();
}
function refreshInstallButtons() {
  document.querySelectorAll('[data-install-btn]').forEach((b) => { b.style.display = canOfferInstall() ? '' : 'none'; });
}
function installButtonHtml(extraClass) {
  return `<button class="btn small secondary ${extraClass || ''}" data-install-btn style="display:${canOfferInstall() ? '' : 'none'};" onclick="installApp()">📲 ثبّت التطبيق</button>`;
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (e) {}
    deferredInstallPrompt = null;
    refreshInstallButtons();
    return;
  }
  if (isIosSafari()) {
    const m = document.getElementById('ios-install-modal');
    if (m) m.classList.add('show');
    return;
  }
  if (typeof showToast === 'function') showToast('من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»');
}
function closeIosInstallModal() {
  const m = document.getElementById('ios-install-modal');
  if (m) m.classList.remove('show');
}

refreshInstallButtons();
