// ---------- ROUTING: public store link vs login screen ----------
// A merchant's unique store link looks like: yourdomain.com/page.html?store=SLUG
// Anyone opening that link goes straight to that merchant's storefront — no login, no nav, nothing else.
//
// A merchant with a custom domain assigned by the admin (see assignCustomDomain) is reached
// a different way: their domain's DNS is pointed (by whoever controls that domain — the admin
// or the merchant, outside this app) straight at wherever this same file is hosted, so the
// visitor's browser sends no ?store= parameter at all — just the bare domain. We detect that
// case by matching location.hostname against every merchant's customDomain here, before
// falling through to the normal ?store= check. Nothing else about the merchant (products,
// orders, slug link) changes — this is purely an alternate way to reach the exact same store.
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
  const slug = params.get('store');
  if (slug) {
    openPublicStore(decodeURIComponent(slug));
    return;
  }
  if (params.get('join') === '1') {
    showJoinScreen();
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
  document.getElementById('public-store-screen').style.display = 'block';
  const m = data.merchants.find(x => x.linkSlug === slug && x.status === 'active');
  const brandEl = document.getElementById('public-store-brand');
  const content = document.getElementById('public-storefront-content');
  if (!m) {
    brandEl.textContent = 'المتجر غير متاح';
    content.innerHTML = '<div class="card"><div class="empty">هذا الرابط غير صحيح أو المتجر غير متاح حالياً</div></div>';
    return;
  }
  publicStoreMerchantId = m.id;
  updateBootMerchantLogo(m);
  brandEl.textContent = m.shop;
  m.visits = (m.visits || 0) + 1;
  saveData();
  renderStorefrontInto(m.id, content);
}

// Backfill theme/shipping fields for merchants created before these features existed
function ensureMerchantTheme(m) {
  if (!m.theme) m.theme = { primaryColor: '#C77B4A', logo: null, banner: null };
  if (typeof m.shippingAmount !== 'number') m.shippingAmount = data.settings.shippingAmount;
  // Merchants the admin has flagged as handling their own delivery (their own driver/service)
  // instead of the platform's. Default false so every existing merchant keeps behaving exactly
  // like before — only an explicit admin toggle (see openOwnDeliveryModal) turns it on.
  if (typeof m.ownDelivery !== 'boolean') m.ownDelivery = false;
  if (typeof m.ownDeliveryPrice !== 'number') m.ownDeliveryPrice = 0;
  // Which governorates this merchant is allowed to ship their own-delivery orders to — set by
  // the admin (see openOwnDeliveryModal). Empty array = no restriction (all governorates).
  if (!Array.isArray(m.ownDeliveryGovernorates)) m.ownDeliveryGovernorates = [];
  // Per-governorate, per-area delivery prices — set by the admin only, from inside the
  // "own delivery" modal (see renderOwnDeliveryAreaPricing / confirmOwnDelivery). The merchant
  // can't edit these themselves. Falls back to ownDeliveryPrice for any area without its own price.
  if (!m.ownDeliveryAreaPrices || typeof m.ownDeliveryAreaPrices !== 'object') m.ownDeliveryAreaPrices = {};
  if (!m.feeType) m.feeType = 'fixed';
  if (typeof m.itemDeduction !== 'number') m.itemDeduction = data.settings.itemDeduction || 0;
  // Admin-set exemption: items priced at or below this amount pay zero platform fee (and
  // zero fixed item deduction) for this merchant specifically — see calcFee(). 0 = no exemption.
  if (typeof m.feeExemptMaxPrice !== 'number') m.feeExemptMaxPrice = 0;
  // Custom domain the admin bought/assigned to this merchant as an official gift (see
  // assignCustomDomain). Purely additive — the merchant keeps their normal platform link
  // working too (see storeLinkUrl), so removing/changing this can never orphan their store,
  // products, or orders; it only changes which URL is treated as "the" official one.
  if (typeof m.customDomain !== 'string') m.customDomain = '';
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

// Sizes used to be plain strings ("42", "L"...) with only one overall stock number for the
// whole product. Now each size box and each color box carries its OWN stock count, so the
// merchant can say "L: 5 left, XL: 2 left" and "أحمر: 3 left, أزرق: 0 left" instead of one
// shared number. This upgrades any older product the first time it's loaded — a plain string
// size becomes {value, stock:null} (unlimited, same as before) — and makes sure `colors`
// always exists as an array so the rest of the code never has to guard for it being missing.
function ensureProductVariants(p) {
  if (!Array.isArray(p.sizes)) p.sizes = [];
  p.sizes = p.sizes.map(s => (typeof s === 'string') ? { value: s, stock: null } : s);
  if (!Array.isArray(p.colors)) p.colors = [];
  // Ratings & reviews — each entry is { id, name, stars(1-5), comment, date }. Kept on the
  // product itself (not a separate top-level collection) since reviews always belong to,
  // and are only ever shown alongside, exactly one product.
  if (!Array.isArray(p.reviews)) p.reviews = [];
  return p;
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

// Available stock for a specific size/color combination a customer picked. When the product
// has size or color boxes, each box's own stock is the limiting factor (the smaller of the
// two, if both are set); a box with stock === null means "unlimited" for that dimension.
// Products with no size/color boxes at all fall back to the product's overall stock field,
// exactly like before this feature existed.
function variantStock(p, sizeVal, colorVal) {
  let limit = null;
  if (p.sizes && p.sizes.length && sizeVal != null) {
    const s = p.sizes.find(x => x.value === sizeVal);
    if (s && typeof s.stock === 'number') limit = (limit === null) ? s.stock : Math.min(limit, s.stock);
  }
  if (p.colors && p.colors.length && colorVal != null) {
    const c = p.colors.find(x => x.name === colorVal);
    if (c && typeof c.stock === 'number') limit = (limit === null) ? c.stock : Math.min(limit, c.stock);
  }
  if (limit === null && (!p.sizes || !p.sizes.length) && (!p.colors || !p.colors.length) && typeof p.stock === 'number') {
    limit = p.stock;
  }
  return limit; // null = unlimited
}

// A product counts as "نفدت الكمية" when every one of its variant boxes is at 0, or (for
// products with no size/color boxes at all) when its own overall stock is 0.
function productOutOfStock(p) {
  const hasSizes = p.sizes && p.sizes.length;
  const hasColors = p.colors && p.colors.length;
  if (hasSizes || hasColors) {
    const sizesDepleted = !hasSizes || p.sizes.every(s => typeof s.stock === 'number' && s.stock <= 0);
    const colorsDepleted = !hasColors || p.colors.every(c => typeof c.stock === 'number' && c.stock <= 0);
    return sizesDepleted && colorsDepleted;
  }
  return typeof p.stock === 'number' && p.stock <= 0;
}

// Restores stock after a rejected/cancelled/removed piece — restocks the specific size box
// and/or color box the customer had picked (each independently), or the overall product
// stock if the product has neither.
function restoreVariantStock(p, sizeVal, colorVal) {
  let restoredSomething = false;
  if (p.sizes && p.sizes.length && sizeVal != null) {
    const s = p.sizes.find(x => x.value === sizeVal);
    if (s && typeof s.stock === 'number') { s.stock += 1; restoredSomething = true; }
  }
  if (p.colors && p.colors.length && colorVal != null) {
    const c = p.colors.find(x => x.name === colorVal);
    if (c && typeof c.stock === 'number') { c.stock += 1; restoredSomething = true; }
  }
  if (!restoredSomething && typeof p.stock === 'number') p.stock += 1;
}

// Deducts stock for an order — the mirror image of restoreVariantStock above. The
// authoritative call site is acceptInvoice() (runs in the merchant's own logged-in session,
// which has real write access to their own document) — NOT at guest checkout time, since an
// unauthenticated visitor's browser has no write access to the merchant's document per
// firestore.rules. See the comment where newOrders are built in the checkout flow.
function deductVariantStock(p, sizeVal, colorVal) {
  let deductedSomething = false;
  if (p.sizes && p.sizes.length && sizeVal != null) {
    const s = p.sizes.find(x => x.value === sizeVal);
    if (s && typeof s.stock === 'number') { s.stock = Math.max(0, s.stock - 1); deductedSomething = true; }
  }
  if (p.colors && p.colors.length && colorVal != null) {
    const c = p.colors.find(x => x.name === colorVal);
    if (c && typeof c.stock === 'number') { c.stock = Math.max(0, c.stock - 1); deductedSomething = true; }
  }
  if (!deductedSomething && typeof p.stock === 'number') p.stock = Math.max(0, p.stock - 1);
}

