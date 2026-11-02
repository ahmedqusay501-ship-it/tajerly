// ---------- إشعارات Push للتاجر (Firebase Cloud Messaging) ----------
// التاجر يضغط "فعّل إشعارات الطلبات" مرة وحدة على كل جهاز، فيوصله إشعار على الموبايل/الكمبيوتر
// لما ينطلب منه طلب جديد حتى لو الموقع مسكّر. التوكن ينحفظ بـ push_tokens/{uid}، والإرسال الفعلي
// تسويه دالة السيرفر notifyMerchantOnOrder (شوف functions-push/ وملف PUSH-SETUP.md).
// مفتاح VAPID العلني من Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates.
// لو فاضي، الكارد ما يظهر ولا يتغيّر أي سلوك.
const PUSH_VAPID_KEY = '';

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function refreshPushCard() {
  const card = document.getElementById('push-enable-card');
  if (!card) return;
  const show = !!PUSH_VAPID_KEY && pushSupported() && Notification.permission !== 'granted' && Notification.permission !== 'denied';
  card.style.display = show ? '' : 'none';
}
async function enablePushNotifications() {
  if (!PUSH_VAPID_KEY || !pushSupported()) { showToast('الإشعارات غير مدعومة على هذا المتصفح'); return; }
  const uid = window.authApi && window.authApi.currentUid && window.authApi.currentUid();
  if (!uid) { showToast('سجّل دخولك أولاً'); return; }
  try {
    const perm = await Notification.requestPermission();
    refreshPushCard();
    if (perm !== 'granted') { showToast('ما انعطت صلاحية الإشعارات — فعّلها من إعدادات المتصفح'); return; }
    const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js')
    ]);
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey: PUSH_VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) { showToast('تعذّر تفعيل الإشعارات'); return; }
    const existing = (await window.authApi.getPrivateDoc('push_tokens', uid)) || {};
    const tokens = Array.from(new Set([token, ...(Array.isArray(existing.tokens) ? existing.tokens : [])])).slice(0, 8);
    await window.authApi.saveDoc('push_tokens', uid, { tokens, updatedAt: Date.now() });
    showToast('تم تفعيل إشعارات الطلبات ✅');
  } catch (e) {
    console.error('Push enable failed:', e);
    showToast('تعذّر تفعيل الإشعارات');
  }
}
refreshPushCard();
