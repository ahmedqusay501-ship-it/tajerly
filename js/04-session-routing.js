// ---------- ROUTING: public store link vs login screen ----------
// A merchant's unique store link looks like: yourdomain.com/?s=CODE
// Anyone opening that link goes straight to that merchant's storefront — no login, no nav, nothing else.
//
// A merchant with a custom domain assigned by the admin (see assignCustomDomain) is reached
// a different way: their domain's DNS is pointed (by whoever controls that domain — the admin
// or the merchant, outside this app) straight at wherever this same file is hosted, so the
// visitor's browser sends no ?store= parameter at all — just the bare domain. We detect that
// case by matching location.hostname against every merchant's customDomain here, before
// falling through to the normal ?store= check. Nothing else about the merchant (products,
// orders, slug link) changes — this is purely an alternate way to reach the exact same store.
// ---------- SHORT STORE LINKS ----------
// Store link is now  tajerly.shop/?s=ab3k9  (5 chars). The old ?store=<name>-<id> links are no longer supported. The short code is derived deterministically from the
// merchant id (so every browser computes the same one) and then saved on the merchant.
const SHORT_SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike chars (i,l,o,0,1)
const SHORT_SLUG_LEN = 5;
function shortSlugCandidate(id, salt) {
  const str = String(id) + ':' + (salt || 0);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < SHORT_SLUG_LEN; i++) {
    out += SHORT_SLUG_ALPHABET[h % SHORT_SLUG_ALPHABET.length];
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
  }
  return out;
}
function shortSlugFor(m) {
  if (!m) return '';
  if (m.shortSlug) return m.shortSlug;
  const list = (typeof data !== 'undefined' && data.merchants) || [];
  for (let salt = 0; salt < 50; salt++) {
    const cand = shortSlugCandidate(m.id, salt);
    const taken = list.some(o => o.id !== m.id && (o.shortSlug
      ? o.shortSlug === cand
      : (o.id < m.id && shortSlugCandidate(o.id, 0) === cand)));
    if (!taken) { m.shortSlug = cand; return cand; }
  }
  m.shortSlug = shortSlugCandidate(m.id, 99);
  return m.shortSlug;
}
function findMerchantBySlug(slug) {
  const s = (slug || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  return data.merchants.find(x => x.status === 'active' && shortSlugFor(x) === lower) || null;
}

function normalizeDomain(d) {
  return (d || '').trim().toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
}
function merchantForHostname(hostname) {
  const host = normalizeDomain(hostname);
  if (!host) return null;
  return data.merchants.find(m => m.customDomain && normalizeDomain(m.customDomain) === host && m.status === 'active') || null;
}
function routeOnLoad() {
  const domainMerchant = merchantForHostname(location.hostname);
  if (domainMerchant) {
    openPublicStore(domainMerchant.linkSlug);
    return;
  }
  const params = new URLSearchParams(location.search);
  const slug = params.get('s');
  if (slug) {
    openPublicStore(decodeURIComponent(slug));
    return;
  }
  if (params.get('join') === '1') {
    showJoinScreen();
    return;
  }
  if (params.get('market') === '1') {
    openGeneralMarket();
    return;
  }
  if (params.get('restaurants') === '1') {
    openRestaurantsMarket();
    return;
  }
  // Try to silently restore a previous login (admin or merchant) instead of always
  // showing the login form after every page reload/update. See restoreSession().
  if (restoreSession()) return;
  showHomeScreen();
}

// ---------- SESSION PERSISTENCE ----------
// Keeps the person logged in across page reloads (site updates, closing/reopening the
// tab, phone screen locking, etc.) so they don't have to re-type their username and
// password every time the page happens to reload. Only the role + merchant id are
// stored — never the password — and it's checked against the freshly loaded data
// every time, so a removed/disabled merchant or a stale session is never trusted blindly.
const SESSION_KEY = 'platform-session';

function saveSession(role) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ role, merchantId: loggedInMerchantId, employeeId: loggedInEmployeeId }));
  } catch (e) { /* localStorage unavailable — session just won't persist, no big deal */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function restoreSession() {
  let saved;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (e) { return false; }

  if (saved.role === 'admin') {
    enterApp('admin');
    return true;
  }
  if (saved.role === 'merchant' && saved.merchantId != null) {
    const m = data.merchants.find(x => x.id === saved.merchantId && x.status !== 'pending');
    if (m) {
      loggedInMerchantId = m.id;
      enterApp('merchant');
      return true;
    }
  }
  if (saved.role === 'employee' && saved.employeeId != null) {
    const emp = data.employees.find(x => x.id === saved.employeeId && x.status === 'active');
    if (emp) {
      if (emp.ownerType === 'merchant') {
        const m = data.merchants.find(x => x.id === emp.merchantId && x.status !== 'pending');
        if (!m) { clearSession(); return false; } // the employee's merchant is gone/disabled — don't trust a stale session
      }
      loggedInEmployeeId = emp.id;
      enterApp('employee');
      return true;
    }
  }
  // Session pointed at an account that's gone or disabled — don't keep retrying it
  clearSession();
  return false;
}

let publicStoreMerchantId = null;

function openPublicStore(slug) {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('general-market-screen').style.display = 'none';
  generalMarketActive = false;
  document.getElementById('restaurants-screen').style.display = 'none';
  restaurantsMarketActive = false;
  document.getElementById('public-store-screen').style.display = 'block';
  const m = findMerchantBySlug(slug);
  const brandEl = document.getElementById('public-store-brand');
  const content = document.getElementById('public-storefront-content');
  if (!m) {
    brandEl.textContent = 'المتجر غير متاح';
    content.innerHTML = '<div class="card"><div class="empty">هذا الرابط غير صحيح أو المتجر غير متاح حالياً</div></div>';
    publicStoreMerchantId = null;
    productDetailFullPageActive = false;
    updateStoreViewToggleFab();
    return;
  }
  publicStoreMerchantId = m.id;
  productDetailFullPageActive = false; // زيارة جديدة لمتجر — نضمن ما ترث حالة "تفاصيل مفتوحة" من متجر سابق
  updateBootMerchantLogo(m);
  brandEl.textContent = m.shop;
  m.visits = (m.visits || 0) + 1;
  saveData();
  renderStorefrontInto(m.id, content);
  updateCartFab();
  if (typeof trackEvent === 'function') trackEvent('page');
  // رابط مشاركة منتج معيّن (شوف shareProduct بـ 12-storefront.js) يجي بصيغة
  // ?s=CODE&product=ID — نفتح تفاصيل هذا المنتج مباشرة بدل ما نوقف بقائمة المتجر
  // ونخلي الشخص يدور عليه بنفسه.
  // ?lp=ID → صفحة هبوط مخصصة لهذا المنتج وحده (شوف openProductLanding بـ 12-storefront.js)
  const lpParam = new URLSearchParams(location.search).get('lp');
  if (lpParam) {
    const lpid = parseInt(lpParam, 10);
    if (m.products.some(x => x.id === lpid)) { openProductLanding(m.id, lpid); return; }
  }
  const productIdParam = new URLSearchParams(location.search).get('product');
  if (productIdParam) {
    const pid = parseInt(productIdParam, 10);
    if (m.products.some(x => x.id === pid)) openProductDetail(m.id, pid);
  }
}

// Backfill theme/shipping fields for merchants created before these features existed
function ensureMerchantTheme(m) {
  shortSlugFor(m); // backfill short store code for merchants created before short links
  if (!m.theme) m.theme = { primaryColor: '#C77B4A', logo: null, banner: null };
  if (typeof safeColor === 'function') m.theme.primaryColor = safeColor(m.theme.primaryColor); // blocks CSS/attribute injection via a crafted color value
  if (!m.theme.themeId) m.theme.themeId = 'classic'; // ثيم المتجر — شوف js/12b-store-themes.js
  if (typeof m.shippingAmount !== 'number') m.shippingAmount = data.settings.shippingAmount;
  // Merchants the admin has flagged as handling their own delivery (their own driver/service)
  // instead of the platform's. Existing merchants without this field yet default to false so
  // they keep behaving exactly like before — an explicit admin toggle (see openOwnDeliveryModal)
  // turns it on for them. New merchants get ownDelivery: true set directly at creation time
  // (see submitRequest in 08-admin-requests-employees-creds.js), so this line never touches them.
  if (typeof m.ownDelivery !== 'boolean') m.ownDelivery = false;
  if (typeof m.ownDeliveryPrice !== 'number') m.ownDeliveryPrice = 0;
  // Suggested delivery time text shown to the customer at checkout (e.g. "يومين")، الافتراضي
  // لأي منطقة ما إلها وقت خاص محدد لها. اختياري — يترك فاضي لو ما يبي التاجر يحدد وقت.
  if (typeof m.ownDeliveryDays !== 'string') m.ownDeliveryDays = '';
  // Which governorates this merchant is allowed to ship their own-delivery orders to — set by
  // the admin (see openOwnDeliveryModal). Empty array = no restriction (all governorates).
  if (!Array.isArray(m.ownDeliveryGovernorates)) m.ownDeliveryGovernorates = [];
  // Per-governorate, per-area delivery prices — set by the admin only, from inside the
  // "own delivery" modal (see renderOwnDeliveryAreaPricing / confirmOwnDelivery). The merchant
  // can't edit these themselves. Falls back to ownDeliveryPrice for any area without its own price.
  if (!m.ownDeliveryAreaPrices || typeof m.ownDeliveryAreaPrices !== 'object') m.ownDeliveryAreaPrices = {};
  // Which of the three delivery prices the CUSTOMER actually sees/pays at checkout, per
  // merchant, admin-controlled only (see openOwnDeliveryModal / confirmOwnDelivery in
  // js/15-admin-tools.js): 'merchant' (m.ownDeliveryPrice/areaPrices — same meaning as
  // ownDelivery:true always had), 'platform' (data.settings.shippingZones, the old default),
  // or 'agent' (the merchant's currently assigned delivery agent's own deliveryZones pricing —
  // see agentDeliveryQuote in js/03-storage-firebase.js). This is purely about WHICH PRICE is
  // shown; it never changes the fulfillment workflow (m.ownDelivery still decides whether the
  // order skips the platform's shipping/agent-handover queue). Migrated once from the old
  // boolean so existing merchants keep behaving exactly like before until the admin explicitly
  // picks 'agent' for them.
  if (m.deliveryPriceSource !== 'agent' && m.deliveryPriceSource !== 'platform' && m.deliveryPriceSource !== 'merchant') {
    m.deliveryPriceSource = m.ownDelivery ? 'merchant' : 'platform';
  }
  if (!m.feeType) m.feeType = 'fixed';
  if (typeof m.itemDeduction !== 'number') m.itemDeduction = data.settings.itemDeduction || 0;
  if (typeof m.itemDeductionPercent !== 'number') m.itemDeductionPercent = data.settings.itemDeductionPercent || 0;
  // Admin-set exemption: items priced at or below this amount pay zero platform fee (and
  // zero fixed item deduction) for this merchant specifically — see calcFee(). 0 = no exemption.
  if (typeof m.feeExemptMaxPrice !== 'number') m.feeExemptMaxPrice = 0;
  // الاشتراك الشهري (نموذج الربح الثالث) — أدمن حصراً، شوف js/22-subscriptions.js. تاجر قديم = غير مشترك.
  if (typeof m.subscriptionEnabled !== 'boolean') m.subscriptionEnabled = false;
  if (typeof m.subscriptionPrice !== 'number') m.subscriptionPrice = 0;
  if (typeof m.subscriptionDays !== 'number' || m.subscriptionDays < 1) m.subscriptionDays = 30;
  if (typeof m.subscriptionEndsAt !== 'number') m.subscriptionEndsAt = 0;
  // Custom domain the admin bought/assigned to this merchant as an official gift (see
  // assignCustomDomain). Purely additive — the merchant keeps their normal platform link
  // working too (see storeLinkUrl), so removing/changing this can never orphan their store,
  // products, or orders; it only changes which URL is treated as "the" official one.
  if (typeof m.customDomain !== 'string') m.customDomain = '';
  // Store-level category (ملابس، إلكترونيات...) — merchants created before this feature
  // existed, or whose join request predates it being saved, default to "أخرى" so they still
  // show up under a filter on the general market page instead of vanishing from it entirely.
  if (typeof m.category !== 'string' || !STORE_CATEGORIES.includes(m.category)) m.category = 'أخرى';
  // نوع المتجر: 'market' (ماركت عادي) أو 'restaurant' (مطعم) — يقرر أي صفحة سوق عام
  // يظهر التاجر بها (السوق العام أو صفحة المطاعم، شوف 19-general-market.js و
  // 20-restaurants-market.js). قفلها أدمن بس (نفس قفل hiddenFromMarket بـ firestore.rules).
  // كل التجار القدامى يرجعون 'market' تلقائياً فما يتغيّر شي على وضعهم الحالي.
  if (m.type !== 'restaurant' && m.type !== 'market') m.type = 'market';
  // ساعات عمل المطعم (مطاعم بس — شوف isMerchantOpenNow بـ 20-restaurants-market.js). اختيارية
  // بالكامل: enabled=false (الافتراضي لأي تاجر قديم أو ماركت عادي) يعني المتجر يعتبر مفتوح
  // دايماً، بالضبط نفس السلوك قبل هذي الميزة — ما ينكسر شي لأي تاجر ما فعّلها بنفسه.
  if (!m.workingHours || typeof m.workingHours !== 'object') m.workingHours = { enabled: false, days: {} };
  if (!m.workingHours.days || typeof m.workingHours.days !== 'object') m.workingHours.days = {};
  WEEK_DAYS.forEach(d => {
    if (!m.workingHours.days[d.key] || typeof m.workingHours.days[d.key] !== 'object') {
      m.workingHours.days[d.key] = { closed: false, open: '10:00', close: '23:00' };
    }
  });
  // Per-product commission exemption requests — a merchant asks to stop paying platform
  // commission on one specific product, the admin approves/rejects it. { id, productId,
  // productName, status: 'pending'|'approved'|'rejected', createdAt, respondedAt }. See
  // requestCommissionExemption() / approveCommissionRequest() / isProductCommissionExempt().
  if (!Array.isArray(m.commissionRequests)) m.commissionRequests = [];
  if (!m.dashboardColor) m.dashboardColor = '#10B981';
  if (typeof m.visits !== 'number') m.visits = 0;
  // Social links: each platform has its own URL + an independent show/hide toggle, so the
  // merchant can keep a link saved without it necessarily being visible on the storefront.
  if (!m.theme.social) {
    m.theme.social = {
      facebook: { url: '', visible: true },
      instagram: { url: '', visible: true },
      twitter: { url: '', visible: true },
      tiktok: { url: '', visible: true }
    };
  }
  SOCIAL_PLATFORMS.forEach(p => {
    if (!m.theme.social[p.key]) m.theme.social[p.key] = { url: '', visible: true };
  });
  if (typeof m.welcomeMessage !== 'string') m.welcomeMessage = '';
  if (typeof m.bio !== 'string') m.bio = '';
  // Store-specific terms & conditions (e.g. exchange/return policy) written by the merchant
  // themselves, separate from the platform-wide legal-modal. Defaults to hidden/empty for
  // every merchant — nothing shows on a storefront until the merchant both writes something
  // AND explicitly turns it on (see setMerchantCustomTerms / toggleMerchantCustomTermsVisible).
  if (!m.theme.customTerms) m.theme.customTerms = { text: '', visible: false };
  if (typeof m.theme.customTerms.text !== 'string') m.theme.customTerms.text = '';
  if (typeof m.theme.customTerms.visible !== 'boolean') m.theme.customTerms.visible = false;
  // Store sections/categories — entirely optional; products with no categoryId (or one that
  // no longer exists) just render together at the end, so nothing breaks for merchants who
  // never set any up.
  if (!Array.isArray(m.categories)) m.categories = [];
  m.categories.forEach(c => { if (!('image' in c)) c.image = null; });
  // "الأكثر مبيعاً" cache — see recomputeMerchantBestSellers() in 09-merchant-store-products.js.
  if (!Array.isArray(m.bestSellerProductIds)) m.bestSellerProductIds = [];
  // Coupons: { id, code, type: 'percent'|'fixed', value, minOrder (0 = no minimum), active,
  // expiryDate ('YYYY-MM-DD' or null = never), maxUses (number or null = unlimited),
  // usedCount (how many times it's actually been used so far), maxDiscount (optional cap in
  // دينار on the discount amount — mainly useful for 'percent' coupons so "20% off" can't
  // blow out on a huge order; null/0 = no cap).
  if (!Array.isArray(m.coupons)) m.coupons = [];
  m.coupons.forEach(c => {
    if (typeof c.expiryDate !== 'string') c.expiryDate = null;
    if (typeof c.maxUses !== 'number' || c.maxUses <= 0) c.maxUses = null;
    if (typeof c.usedCount !== 'number' || c.usedCount < 0) c.usedCount = 0;
    if (typeof c.maxDiscount !== 'number' || c.maxDiscount <= 0) c.maxDiscount = null;
  });
  if (!Array.isArray(m.products)) m.products = [];
  m.products.forEach(ensureProductImages);
  m.products.forEach(ensureProductVariants);
  return m;
}

// Products used to have a single `image` field; now they hold an `images` array (multiple
// photos, first one = the thumbnail/primary photo everywhere it's shown small). This upgrades
// any older product record the first time it's loaded, and keeps `image` in sync afterward
// too, in case anything else still reads it.
function ensureProductImages(p) {
  if (!Array.isArray(p.images)) p.images = p.image ? [p.image] : [];
  p.image = p.images[0] || null;
  return p;
}

// ---- Variants model ----
// Each COLOR now carries its own list of sizes, each with its own quantity:
//   colors: [{ name, hex, stock, sizes: [{ value, stock }] }]
// so the merchant adds a product once and, for every color, lists the sizes it comes in and
// how many pieces exist of that exact color+size. A color with an empty `sizes` list falls back
// to its own `stock` number. `p.sizes` (top level) is only used by products that have NO colors.
// Older products stored sizes and colors as two independent lists — the first time such a
// product loads, every color receives a copy of the old sizes (quantity = the smaller of the
// old size/color numbers, so nothing becomes more available than it was) and the old
// top-level list is emptied.
function ensureProductVariants(p) {
  if (!Array.isArray(p.sizes)) p.sizes = [];
  p.sizes = p.sizes.map(s => (typeof s === 'string') ? { value: s, stock: null } : s);
  if (!Array.isArray(p.colors)) p.colors = [];
  if (p.colors.length) {
    const legacySizes = p.sizes;
    p.colors.forEach(c => {
      if (!Array.isArray(c.sizes)) {
        c.sizes = legacySizes.map(s => {
          let stock = (typeof s.stock === 'number') ? s.stock : null;
          if (typeof c.stock === 'number') stock = (stock === null) ? c.stock : Math.min(stock, c.stock);
          return { value: s.value, stock };
        });
        if (c.sizes.length) c.stock = null;
      }
      c.sizes = c.sizes.map(s => (typeof s === 'string') ? { value: s, stock: null } : s);
    });
    p.sizes = [];
  }
  // Ratings & reviews — each entry is { id, name, stars(1-5), comment, date }. Kept on the
  // product itself (not a separate top-level collection) since reviews always belong to,
  // and are only ever shown alongside, exactly one product.
  if (!Array.isArray(p.reviews)) p.reviews = [];
  return p;
}

// The sizes a customer can pick for the currently selected color (or the product's own sizes
// when it has no colors at all).
function sizesForColor(p, colorVal) {
  if (p.colors && p.colors.length) {
    const c = p.colors.find(x => x.name === colorVal) || p.colors[0];
    return (c && Array.isArray(c.sizes)) ? c.sizes : [];
  }
  return p.sizes || [];
}

// The stock box that governs one exact color+size choice (a size box, or the color itself when
// it has no sizes, or the product's own size box when it has no colors). null = no box at all.
function variantBox(p, sizeVal, colorVal) {
  if (p.colors && p.colors.length) {
    const c = p.colors.find(x => x.name === colorVal);
    if (!c) return null;
    if (c.sizes && c.sizes.length) return c.sizes.find(x => x.value === sizeVal) || null;
    return c;
  }
  if (p.sizes && p.sizes.length) return p.sizes.find(x => x.value === sizeVal) || null;
  return null;
}

function variantDepleted(v) { return typeof v.stock === 'number' && v.stock <= 0; }
function colorDepleted(c) {
  return (c.sizes && c.sizes.length) ? c.sizes.every(variantDepleted) : variantDepleted(c);
}
// Total pieces left for a color (null = unlimited somewhere inside it).
function colorTotalStock(c) {
  if (!c.sizes || !c.sizes.length) return typeof c.stock === 'number' ? c.stock : null;
  let total = 0;
  for (const s of c.sizes) { if (typeof s.stock !== 'number') return null; total += s.stock; }
  return total;
}

// Average star rating for a product, rounded to 1 decimal — null when it has no reviews yet
// (so callers can show "لا يوجد تقييمات بعد" instead of a misleading "0.0 ").
function productAvgRating(p) {
  if (!p.reviews || p.reviews.length === 0) return null;
  const sum = p.reviews.reduce((s, r) => s + (r.stars || 0), 0);
  return Math.round((sum / p.reviews.length) * 10) / 10;
}

// Renders a row of filled/empty stars for a given rating (rounds to the nearest whole star
// for display purposes only — the stored average itself stays precise to 1 decimal).
function starsHtml(rating) {
  const rounded = Math.round(rating || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= rounded ? '★' : '☆';
  return out;
}

// Available stock for the exact color+size combination a customer picked (null = unlimited).
// Products with no colors/sizes at all fall back to the product's overall stock field.
function variantStock(p, sizeVal, colorVal) {
  const hasVariants = (p.colors && p.colors.length) || (p.sizes && p.sizes.length);
  if (!hasVariants) return typeof p.stock === 'number' ? p.stock : null;
  const box = variantBox(p, sizeVal, colorVal);
  return (box && typeof box.stock === 'number') ? box.stock : null;
}

// A product counts as "نفدت الكمية" when every color (and every size inside it) is at 0, or (for
// products with no colors) every size is at 0, or (no variants at all) its own stock is 0.
function productOutOfStock(p) {
  if (p.colors && p.colors.length) return p.colors.every(colorDepleted);
  if (p.sizes && p.sizes.length) return p.sizes.every(variantDepleted);
  return typeof p.stock === 'number' && p.stock <= 0;
}

// Restores one piece after a rejected/cancelled/removed order line — puts it back on the exact
// color+size box it came from (or the overall product stock if the product has no variants).
function restoreVariantStock(p, sizeVal, colorVal) {
  const hasVariants = (p.colors && p.colors.length) || (p.sizes && p.sizes.length);
  if (!hasVariants) { if (typeof p.stock === 'number') p.stock += 1; return; }
  const box = variantBox(p, sizeVal, colorVal);
  if (box && typeof box.stock === 'number') box.stock += 1;
}

// Deducts one piece for an order — the mirror image of restoreVariantStock above. The
// authoritative call site is acceptInvoice() (runs in the merchant's own logged-in session,
// which has real write access to their own document) — NOT at guest checkout time, since an
// unauthenticated visitor's browser has no write access to the merchant's document per
// firestore.rules. See the comment where newOrders are built in the checkout flow.
function deductVariantStock(p, sizeVal, colorVal) {
  const hasVariants = (p.colors && p.colors.length) || (p.sizes && p.sizes.length);
  if (!hasVariants) { if (typeof p.stock === 'number') p.stock = Math.max(0, p.stock - 1); return; }
  const box = variantBox(p, sizeVal, colorVal);
  if (box && typeof box.stock === 'number') box.stock = Math.max(0, box.stock - 1);
}

