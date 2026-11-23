// ---------- إشعارات Push للتاجر (Firebase Cloud Messaging) ----------
// التاجر يضغط "فعّل إشعارات الطلبات" مرة وحدة على كل جهاز، فيوصله إشعار على الموبايل/الكمبيوتر
// لما ينطلب منه طلب جديد حتى لو الموقع مسكّر. التوكن ينحفظ بـ push_tokens/{uid}، والإرسال الفعلي
// تسويه دالة السيرفر notifyMerchantOnOrder (شوف functions-push/ وملف PUSH-SETUP.md).
// مفتاح VAPID اختياري: لو فاضي، Firebase يستخدم مفتاحه الافتراضي وكل شي يشتغل عادي.
// لو تريد مفتاح خاص بمشروعك: Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates.
const PUSH_VAPID_KEY = '';

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function pushIsIOSNotInstalled() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}

// يعرض حالة الإشعارات بالبطاقة: غير مفعّلة (زر) / مفعّلة / محظورة من المتصفح / آيفون لازم يثبّت الموقع.
function refreshPushCard() {
  const card = document.getElementById('push-enable-card');
  if (!card) return;
  const btn = card.querySelector('[data-push-btn]');
  const status = card.querySelector('[data-push-status]');
  if (!pushSupported()) {
    if (pushIsIOSNotInstalled()) {
      card.style.display = '';
      if (btn) btn.style.display = 'none';
      if (status) status.textContent = 'على الآيفون: اضغط زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"، افتح الموقع من الأيقونة، وبعدها فعّل الإشعارات (يحتاج iOS 16.4 أو أحدث).';
    } else {
      card.style.display = 'none';
    }
    return;
  }
  card.style.display = '';
  const perm = Notification.permission;
  if (perm === 'granted') {
    if (btn) btn.style.display = 'none';
    if (status) status.textContent = '✅ الإشعارات مفعّلة على هذا الجهاز — يوصلك تنبيه بكل طلب جديد.';
  } else if (perm === 'denied') {
    if (btn) btn.style.display = 'none';
    if (status) status.textContent = '⛔ الإشعارات محظورة من إعدادات المتصفح. فعّلها من إعدادات الموقع (أيقونة القفل بجنب الرابط) ثم حدّث الصفحة.';
  } else {
    if (btn) btn.style.display = '';
    if (status) status.textContent = 'فعّل الإشعارات حتى يوصلك تنبيه بكل طلب جديد على جهازك حتى لو الموقع مسكّر.';
  }
}

async function getPushToken() {
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js')
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const reg = await navigator.serviceWorker.ready;
  const opts = { serviceWorkerRegistration: reg };
  if (PUSH_VAPID_KEY) opts.vapidKey = PUSH_VAPID_KEY;
  return getToken(getMessaging(app), opts);
}

async function savePushToken(uid, token) {
  const existing = (await window.authApi.getPrivateDoc('push_tokens', uid)) || {};
  const old = Array.isArray(existing.tokens) ? existing.tokens : [];
  if (old[0] === token) return; // نفس التوكن بالمقدمة — ما نكتب شي
  const tokens = Array.from(new Set([token, ...old])).slice(0, 8);
  await window.authApi.saveDoc('push_tokens', uid, { tokens, updatedAt: Date.now() });
}

async function enablePushNotifications() {
  if (!pushSupported()) { showToast('الإشعارات غير مدعومة على هذا المتصفح'); return; }
  const uid = window.authApi && window.authApi.currentUid && window.authApi.currentUid();
  if (!uid) { showToast('سجّل دخولك أولاً'); return; }
  try {
    const perm = await Notification.requestPermission();
    refreshPushCard();
    if (perm !== 'granted') { showToast('ما انعطت صلاحية الإشعارات — فعّلها من إعدادات المتصفح'); return; }
    const token = await getPushToken();
    if (!token) { showToast('تعذّر تفعيل الإشعارات'); return; }
    await savePushToken(uid, token);
    _pushSyncedUid = uid;
    showToast('تم تفعيل إشعارات الطلبات ✅');
  } catch (e) {
    console.error('Push enable failed:', e);
    showToast('تعذّر تفعيل الإشعارات');
  }
}

// تجديد صامت: لو الصلاحية ممنوحة سابقاً، نتأكد إن توكن هذا الجهاز محفوظ لهذا الحساب (التوكن ممكن
// يتغيّر، أو التاجر يسجّل دخول بحساب ثاني على نفس الجهاز) بدون ما نزعجه بأي نافذة.
let _pushSyncedUid = null;
async function syncPushTokenIfGranted() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const uid = window.authApi && window.authApi.currentUid && window.authApi.currentUid();
    if (!uid || _pushSyncedUid === uid) return;
    const token = await getPushToken();
    if (!token) return;
    await savePushToken(uid, token);
    _pushSyncedUid = uid;
  } catch (e) { /* صامت — يعيد المحاولة بالدورة الجاية */ }
}

refreshPushCard();
syncPushTokenIfGranted();
setInterval(syncPushTokenIfGranted, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshPushCard(); syncPushTokenIfGranted(); } });
