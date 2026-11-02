// ---------- TRACKING: Meta (Facebook) Pixel + TikTok Pixel + Google Analytics 4 ----------
// معرّفات البكسلات تُحفظ في data.settings.tracking (داخل مستند platform-settings العام القراءة —
// معرّف البكسل ليس سرّاً، وهو ظاهر أصلاً في أي موقع يستخدمه). الكتابة عليها محصورة بالأدمن
// كباقي الإعدادات (انظر firestore.rules).
//
// المبدأ: أي استدعاء trackEvent() آمن دائماً — إن لم يُضبط أي معرّف، أو كان المستخدم مسجّل
// دخول (أدمن/تاجر/موظف)، أو لم يحمّل السكربت الخارجي (حاجب إعلانات)، لا يحدث شيء ولا يتعطّل
// الموقع. لا يتم إرسال أي بيانات شخصية (اسم/هاتف/عنوان) للمنصات — فقط المنتج والمبلغ.
//
// الأحداث (اسم موحّد → مقابله في كل منصة):
//   page      → PageView        | ttq.page          | page_view
//   view      → ViewContent     | ViewContent       | view_item
//   addToCart → AddToCart       | AddToCart         | add_to_cart
//   checkout  → InitiateCheckout| InitiateCheckout  | begin_checkout
//   purchase  → Purchase        | CompletePayment   | purchase

const TRACKING_CURRENCY = 'IQD';
let trackingReady = false;
let trackingQueue = [];
let trackingLastPage = null;
const trackingActive = { fb: false, tt: false, ga: false };

// تحقق صارم من الصيغة — المعرّف يُدرج في سكربت/رابط، فلا نقبل إلا الشكل المتوقع (يمنع الحقن).
const TRACKING_PATTERNS = {
  fbPixelId: /^\d{8,20}$/,
  tiktokPixelId: /^[A-Z0-9]{10,30}$/,
  ga4Id: /^G-[A-Z0-9]{6,14}$/
};
function cleanTrackingId(kind, v) {
  v = String(v || '').trim();
  if (kind === 'tiktokPixelId' || kind === 'ga4Id') v = v.toUpperCase();
  return TRACKING_PATTERNS[kind].test(v) ? v : '';
}

function trackingBlocked() {
  try { if (localStorage.getItem('tajerly-no-track') === '1') return true; } catch (e) {}
  // مستخدم مسجّل دخول (أدمن/تاجر/موظف) = ليس زبوناً، فلا نلوّث إحصائيات الإعلانات بتصفّحه.
  return (typeof currentRole !== 'undefined' && !!currentRole);
}

function loadMetaPixel(id) {
  if (window.fbq) { window.fbq('init', id); trackingActive.fb = true; return; } // بكسل إضافي (بكسل التاجر) بجانب بكسل المنصة
  const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  const s = document.createElement('script');
  s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  window.fbq('init', id);
  trackingActive.fb = true;
}

function loadTikTokPixel(id) {
  const w = window, t = 'ttq';
  if (!(w.ttq && w.ttq._loaded)) {
    w.TiktokAnalyticsObject = t;
    const ttq = w[t] = w[t] || [];
    ttq._loaded = true;
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    ttq.setAndDefer = function (o, e) { o[e] = function () { o.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
    ttq.methods.forEach(m => ttq.setAndDefer(ttq, m));
    ttq.instance = function (i) {
      const inst = (ttq._i && ttq._i[i]) || [];
      ttq.methods.forEach(m => ttq.setAndDefer(inst, m));
      return inst;
    };
  }
  // تحميل معرّف واحد (يتكرر لكل بكسل: المنصة ثم التاجر) — نفس ما يسويه ttq.load بالسنِبت الرسمي
  const ttq = w[t];
  if (ttq._i && ttq._i[id]) return;
  ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
  ttq._t = ttq._t || {}; ttq._t[id] = +new Date();
  ttq._o = ttq._o || {}; ttq._o[id] = {};
  const s = document.createElement('script');
  s.async = true; s.src = ttq._i[id]._u + '?sdkid=' + encodeURIComponent(id) + '&lib=' + t;
  document.head.appendChild(s);
  trackingActive.tt = true;
}

function loadGoogleAnalytics(id) {
  if (window.gtag) { window.gtag('config', id, { send_page_view: false }); trackingActive.ga = true; return; } // معرّف إضافي (تاجر)
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: false }); // الصفحات نرسلها يدوياً (الموقع SPA)
  trackingActive.ga = true;
}

// تُستدعى مرة واحدة بعد تحميل الإعدادات (انظر loadData في 03-storage-firebase.js).
function initTracking() {
  if (trackingReady) return;
  trackingReady = true;
  if (trackingBlocked()) { trackingQueue = []; return; }
  const cfg = (data && data.settings && data.settings.tracking) || {};
  try {
    const fb = cleanTrackingId('fbPixelId', cfg.fbPixelId);
    const tt = cleanTrackingId('tiktokPixelId', cfg.tiktokPixelId);
    const ga = cleanTrackingId('ga4Id', cfg.ga4Id);
    if (fb) loadMetaPixel(fb);
    if (tt) loadTikTokPixel(tt);
    if (ga) loadGoogleAnalytics(ga);
  } catch (e) { console.warn('tracking init failed', e); }
  const q = trackingQueue; trackingQueue = [];
  q.forEach(args => trackEvent.apply(null, args));
}

// p = { id, name, price, qty, value, shop, orderId, ids:[], numItems }
function trackEvent(kind, p) {
  try {
    if (!trackingReady) { if (trackingQueue.length < 20) trackingQueue.push([kind, p]); return; }
    if (!trackingActive.fb && !trackingActive.tt && !trackingActive.ga) return;
    if (trackingBlocked()) return;
    p = p || {};
    const value = Number(p.value != null ? p.value : (p.price || 0) * (p.qty || 1)) || 0;
    const ids = (p.ids && p.ids.length ? p.ids : (p.id != null ? [p.id] : [])).map(String);
    const cur = TRACKING_CURRENCY;
    const gaItems = p.id != null
      ? [{ item_id: String(p.id), item_name: p.name || '', price: Number(p.price) || 0, quantity: p.qty || 1, item_brand: p.shop || '' }]
      : ids.map(i => ({ item_id: i }));

    if (kind === 'page') {
      const key = location.pathname + location.search;
      if (key === trackingLastPage) return; // نفس الصفحة مرتين متتاليتين = تجاهل
      trackingLastPage = key;
      if (trackingActive.fb) window.fbq('track', 'PageView');
      if (trackingActive.tt) window.ttq.page();
      if (trackingActive.ga) window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      return;
    }

    const fbBase = { content_ids: ids, content_type: 'product', value: value, currency: cur };
    if (p.name) fbBase.content_name = p.name;
    const ttBase = { contents: ids.map(i => ({ content_id: i, content_type: 'product', content_name: p.name || '', quantity: p.qty || 1, price: Number(p.price) || 0 })), content_type: 'product', value: value, currency: cur };

    if (kind === 'view') {
      if (trackingActive.fb) window.fbq('track', 'ViewContent', fbBase);
      if (trackingActive.tt) window.ttq.track('ViewContent', ttBase);
      if (trackingActive.ga) window.gtag('event', 'view_item', { currency: cur, value: value, items: gaItems });
    } else if (kind === 'addToCart') {
      if (trackingActive.fb) window.fbq('track', 'AddToCart', fbBase);
      if (trackingActive.tt) window.ttq.track('AddToCart', ttBase);
      if (trackingActive.ga) window.gtag('event', 'add_to_cart', { currency: cur, value: value, items: gaItems });
    } else if (kind === 'checkout') {
      const fb = Object.assign({}, fbBase, { num_items: p.numItems || ids.length });
      if (trackingActive.fb) window.fbq('track', 'InitiateCheckout', fb);
      if (trackingActive.tt) window.ttq.track('InitiateCheckout', ttBase);
      if (trackingActive.ga) window.gtag('event', 'begin_checkout', { currency: cur, value: value, items: gaItems });
    } else if (kind === 'purchase') {
      const eid = p.orderId != null ? { eventID: 'purchase-' + p.orderId } : undefined; // للتكرار لاحقاً مع Conversions API
      const fb = Object.assign({}, fbBase, { num_items: p.numItems || ids.length });
      if (trackingActive.fb) window.fbq('track', 'Purchase', fb, eid);
      if (trackingActive.tt) window.ttq.track('CompletePayment', ttBase);
      if (trackingActive.ga) window.gtag('event', 'purchase', { transaction_id: String(p.orderId || ''), currency: cur, value: value, items: gaItems });
    }
  } catch (e) { /* التتبّع لا يجب أن يكسر الموقع أبداً */ }
}

// ---------- Admin settings card (يُرسم من renderSettings) ----------
function renderTrackingSettings() {
  const t = (data.settings && data.settings.tracking) || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('trk-fb', t.fbPixelId); set('trk-tt', t.tiktokPixelId); set('trk-ga', t.ga4Id);
}
function saveTrackingSettings() {
  const read = (id) => (document.getElementById(id) || {}).value || '';
  const raw = { fbPixelId: read('trk-fb'), tiktokPixelId: read('trk-tt'), ga4Id: read('trk-ga') };
  const next = {}; const bad = [];
  Object.keys(raw).forEach(k => {
    if (!raw[k].trim()) { next[k] = ''; return; }
    const ok = cleanTrackingId(k, raw[k]);
    if (ok) next[k] = ok; else bad.push(k);
  });
  const err = document.getElementById('trk-error');
  if (bad.length) {
    const names = { fbPixelId: 'بكسل فيسبوك', tiktokPixelId: 'بكسل تيك توك', ga4Id: 'Google Analytics' };
    if (err) err.textContent = 'صيغة غير صحيحة: ' + bad.map(k => names[k]).join('، ');
    return;
  }
  if (err) err.textContent = '';
  data.settings.tracking = next;
  saveData();
  renderTrackingSettings();
  showToast('تم حفظ إعدادات التتبّع (تظهر للزبائن بعد تحديث الصفحة)');
}

// ---------- بكسل خاص بكل تاجر ----------
// التاجر يحط معرّفات بكسلاته بإعدادات متجره (m.tracking)، وتتحمّل على متجره هو بس (ما تأثر على المتاجر الثانية)
// بجانب بكسل المنصة. نفس أحداث trackEvent (مشاهدة، سلة، شيك أوت، شراء) تنرسل للبكسلين.
const merchantTrackingLoaded = new Set();
function initMerchantTracking(m) {
  try {
    if (!m || !m.tracking || merchantTrackingLoaded.has(m.id)) return;
    if (trackingBlocked()) return;
    merchantTrackingLoaded.add(m.id);
    const platform = (data && data.settings && data.settings.tracking) || {};
    const fb = cleanTrackingId('fbPixelId', m.tracking.fbPixelId);
    const tt = cleanTrackingId('tiktokPixelId', m.tracking.tiktokPixelId);
    const ga = cleanTrackingId('ga4Id', m.tracking.ga4Id);
    if (fb && fb !== cleanTrackingId('fbPixelId', platform.fbPixelId)) loadMetaPixel(fb);
    if (tt && tt !== cleanTrackingId('tiktokPixelId', platform.tiktokPixelId)) loadTikTokPixel(tt);
    if (ga && ga !== cleanTrackingId('ga4Id', platform.ga4Id)) loadGoogleAnalytics(ga);
  } catch (e) { console.warn('merchant tracking init failed', e); }
}
function merchantTrackingCardHtml(m) {
  const t = m.tracking || {};
  return `<div class="card">
    <div class="card-title">بكسل وتتبّع متجرك</div>
    <div class="subtitle" style="margin-bottom:8px;">حط معرّفات بكسلاتك حتى تقدر تسوي إعلانات وإعادة استهداف لزبائن متجرك. تشتغل على متجرك أنت بس. اترك الحقل فاضي إذا ما عندك.</div>
    <label style="font-size:12px;">بكسل فيسبوك (أرقام فقط)</label>
    <input id="mtrk-fb-${m.id}" placeholder="مثال: 123456789012345" value="${esc(t.fbPixelId || '')}" style="direction:ltr;">
    <label style="font-size:12px;">بكسل تيك توك</label>
    <input id="mtrk-tt-${m.id}" placeholder="مثال: C1ABCDEF2GHIJ3KLMN" value="${esc(t.tiktokPixelId || '')}" style="direction:ltr;">
    <label style="font-size:12px;">Google Analytics (G-...)</label>
    <input id="mtrk-ga-${m.id}" placeholder="مثال: G-ABCDE12345" value="${esc(t.ga4Id || '')}" style="direction:ltr;">
    <div id="mtrk-error-${m.id}" style="color:#DC2626; font-size:12px; min-height:16px;"></div>
    <button class="btn small" onclick="saveMerchantTracking(${m.id})">حفظ</button>
  </div>`;
}
function saveMerchantTracking(mid) {
  const m = data.merchants.find(x => x.id === mid);
  if (!m) return;
  const read = (k) => (document.getElementById(`mtrk-${k}-${mid}`) || {}).value || '';
  const raw = { fbPixelId: read('fb'), tiktokPixelId: read('tt'), ga4Id: read('ga') };
  const next = {}; const bad = [];
  Object.keys(raw).forEach(k => {
    if (!raw[k].trim()) { next[k] = ''; return; }
    const ok = cleanTrackingId(k, raw[k]);
    if (ok) next[k] = ok; else bad.push(k);
  });
  const err = document.getElementById(`mtrk-error-${mid}`);
  if (bad.length) {
    const names = { fbPixelId: 'بكسل فيسبوك', tiktokPixelId: 'بكسل تيك توك', ga4Id: 'Google Analytics' };
    if (err) err.textContent = 'صيغة غير صحيحة: ' + bad.map(k => names[k]).join('، ');
    return;
  }
  if (err) err.textContent = '';
  m.tracking = next;
  saveData();
  showToast('تم حفظ البكسل — يشتغل على متجرك بعد تحديث الصفحة');
}
