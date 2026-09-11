// ---------- GENERAL MARKET (السوق العام) ----------
// A public, no-login page that lists every product from every ACTIVE merchant together in
// one place — reached either from a link on the home screen or directly via ?market=1 — and
// lives alongside each merchant's own individual store link (?store=SLUG). It reuses the
// exact same product-detail modal and cart/checkout flow as an individual storefront: tapping
// a card calls openProductDetail(merchantId, productId) exactly like a normal store page does,
// so "أضف للسلة" and the whole checkout pipeline need zero changes to work here. The cart
// still only ever holds items from one merchant at a time — see addToCart() in
// 13-cart-checkout.js, which already clears the cart automatically when the customer adds a
// product from a different store than what's already in it.
let generalMarketActive = false;
let marketFilter = { query: '', category: 'all', offerId: null };

// Offers whose admin-set active flag is on AND (if it has dates at all) today falls inside
// [startDate, endDate] — see offerStatusLabel() in 15-admin-tools.js for the same date logic
// used on the admin's own list. A permanent offer (no dates at all) is always included here
// as long as it's active.
function activeOffers() {
  const now = new Date();
  return data.offers.filter(o => {
    if (!o.active) return false;
    if (o.startDate && now < new Date(o.startDate)) return false;
    if (o.endDate) {
      const end = new Date(o.endDate);
      end.setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
    return true;
  });
}

function openGeneralMarket() {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('restaurants-screen').style.display = 'none';
  restaurantsMarketActive = false;
  document.getElementById('general-market-screen').style.display = 'block';
  generalMarketActive = true;
  publicStoreMerchantId = null; // not scoped to any single merchant here
  // يُحسب حتى وهي معطّلة (marketPageEnabled=false) — الأدمن يحتاج يعرف كم زيارة توصل
  // للصفحة أصلاً، بما فيها المحاولات وقت التعطيل. شوف "إدارة صفحات السوق" بلوحة الأدمن.
  data.settings.marketVisits = (data.settings.marketVisits || 0) + 1;
  saveData();
  renderGeneralMarket();
}

// All products from every active merchant, each tagged with its own merchant object so the
// card can show/link back to the right store. Backfills each merchant via ensureMerchantTheme
// first (same as every other place merchants get read from) so old-data merchants (missing
// category, products array, etc.) never break this page.
function allMarketProducts() {
  const items = [];
  // hiddenFromMarket is an admin-only switch (see toggleMerchantMarketVisibility in
  // 15-admin-tools.js and its matching firestore.rules lock): a merchant can be fully
  // active and sell fine on their own store link while still being left out of this
  // combined page specifically. m.type === 'restaurant' is excluded here on purpose —
  // restaurants get their own separate combined page (see 20-restaurants-market.js),
  // kept apart from this general (non-restaurant) market entirely.
  data.merchants.filter(m => m.status === 'active' && !m.hiddenFromMarket && m.type !== 'restaurant').forEach(m => {
    ensureMerchantTheme(m);
    m.products.forEach(p => items.push({ p, m }));
  });
  return items;
}

function renderMarketFilterChips() {
  const chip = (id, label) => `<span class="store-filter-chip${marketFilter.category === id ? ' selected' : ''}" onclick="setMarketFilterCategory('${id}')">${esc(label)}</span>`;
  return `<div class="store-filter-chips-row">${chip('all', t('market_filter_all') || 'الكل')}${STORE_CATEGORIES.map(c => chip(c, c)).join('')}</div>`;
}

// A horizontal row of offer "banners" above the search bar — each one a clickable card
// (image + name + how many stores) that narrows the whole page down to just that offer's
// merchants when tapped. Renders nothing at all if there are no currently-active offers, so
// a market with none set up looks exactly like it did before this feature existed.
function renderMarketOffers() {
  const offers = activeOffers();
  if (!offers.length) return '';
  return `<div class="market-offers-row" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; margin-bottom:10px;">
    ${offers.map(o => `
      <div class="market-offer-card" onclick="setMarketOfferFilter('${o.id}')" style="flex:0 0 auto; width:150px; cursor:pointer; border-radius:10px; overflow:hidden; border:2px solid ${marketFilter.offerId === o.id ? 'var(--accent)' : 'var(--border)'}; background:var(--card-bg);">
        ${o.image ? `<img src="${o.image}" style="width:100%; height:70px; object-fit:cover; display:block;">` : `<div style="width:100%; height:70px; background:var(--accent-soft); display:flex; align-items:center; justify-content:center; font-size:24px;">🎉</div>`}
        <div style="padding:6px 8px; font-size:12px; font-weight:700;">${esc(o.name)}</div>
        <div style="padding:0 8px 6px; font-size:10.5px; color:var(--text-mute);">${o.merchantIds.length} محل</div>
      </div>
    `).join('')}
  </div>`;
}
function setMarketOfferFilter(offerId) {
  // Tapping the same offer again clears the filter — an easy toggle instead of needing a
  // separate "×" button just to go back to browsing everything.
  marketFilter.offerId = marketFilter.offerId === offerId ? null : offerId;
  renderGeneralMarket();
}

function onMarketSearchInput() {
  const input = document.getElementById('market-search');
  if (!input) return;
  marketFilter.query = input.value;
  updateMarketProductsArea();
}

function setMarketFilterCategory(cat) {
  marketFilter.category = cat;
  const chipsEl = document.getElementById('market-filter-chips');
  if (chipsEl) chipsEl.innerHTML = renderMarketFilterChips();
  updateMarketProductsArea();
}

// Redraws only the grid area (not the search input itself) so typing never loses focus —
// same pattern as updateStoreProductsArea() for a single merchant's storefront.
function updateMarketProductsArea() {
  const area = document.getElementById('market-products-area');
  if (area) area.innerHTML = renderMarketProducts();
  const cartArea = document.getElementById('market-cart-bar-area');
  if (cartArea) cartArea.innerHTML = renderMarketCartBar();
}

function renderMarketCartBar() {
  if (!cart.length) return '';
  return `
    <div class="cart-bar" onclick="openCartModal()">
      <span>السلة (${cartCount()} قطعة)</span>
      <span>${cartSubtotal().toLocaleString()} د — إتمام الشراء ›</span>
    </div>
  `;
}

// Same compact grid card as a normal store listing, plus a small line naming which store the
// product belongs to (and a quick link straight to that store's own page) — the one visual
// difference a combined, multi-merchant grid actually needs.
function renderMarketProductCard(p, m) {
  ensureProductImages(p);
  ensureProductVariants(p);
  const outOfStock = productOutOfStock(p);
  const img = p.images[0];
  const avg = productAvgRating(p);
  return `
    <div class="store-product-card" onclick="openProductDetail(${m.id}, ${p.id})">
      <div class="store-product-card-img">
        ${img ? `<img src="${img}">` : `<div class="thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#94A3B8" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.5" fill="#94A3B8"/><path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L4 19" stroke="#94A3B8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}
        ${outOfStock ? `<span class="badge rejected">نفدت الكمية</span>` : ''}
      </div>
      <div class="store-product-card-info">
        <div class="store-product-card-name">${esc(p.name)}</div>
        <div class="store-product-card-price">${p.price.toLocaleString()} د</div>
        ${avg !== null ? `<div class="store-product-card-rating"><span class="stars-row">${starsHtml(avg)}</span> ${avg} (${p.reviews.length})</div>` : ''}
        <div class="store-product-card-shop" onclick="event.stopPropagation(); location.href='${storeLinkUrl(m)}'">🏬 ${esc(m.shop)}</div>
      </div>
    </div>
  `;
}

function renderMarketProducts() {
  let items = allMarketProducts();

  if (marketFilter.offerId) {
    const offer = data.offers.find(o => String(o.id) === String(marketFilter.offerId));
    if (offer) items = items.filter(({ m }) => offer.merchantIds.includes(m.id));
  }
  const q = (marketFilter.query || '').trim().toLowerCase();
  if (q) items = items.filter(({ p, m }) => (p.name || '').toLowerCase().includes(q) || (m.shop || '').toLowerCase().includes(q));
  if (marketFilter.category && marketFilter.category !== 'all') {
    items = items.filter(({ m }) => m.category === marketFilter.category);
  }

  if (items.length === 0) {
    return `<div class="empty">${t('market_empty') || 'ما فيه منتجات مطابقة حالياً'}</div>`;
  }

  const grid = (list) => `<div class="store-products-grid">${list.map(({ p, m }) => renderMarketProductCard(p, m)).join('')}</div>`;

  // "الأكثر مبيعاً بالسوق" — cached market-wide, across every merchant, in
  // data.settings.marketBestSellers (see recomputeMarketBestSellers() in
  // 15-admin-tools.js). Only shown in the plain default view — the moment the customer
  // searches, filters by category, or taps an offer, this shelf steps aside for the flat
  // filtered grid below, same as the merchant-storefront version of this idea.
  if (!q && marketFilter.category === 'all' && !marketFilter.offerId && data.settings.marketBestSellers && data.settings.marketBestSellers.length) {
    const rankIndex = new Map(data.settings.marketBestSellers.map((e, i) => [`${e.merchantId}:${e.productId}`, i]));
    const bestSellers = items.filter(({ p, m }) => rankIndex.has(`${m.id}:${p.id}`))
      .sort((a, b) => rankIndex.get(`${a.m.id}:${a.p.id}`) - rankIndex.get(`${b.m.id}:${b.p.id}`));
    if (bestSellers.length) {
      return `<div class="store-section-title">🔥 الأكثر مبيعاً بالسوق</div>${grid(bestSellers)}<div class="store-section-title">كل المنتجات</div>${grid(items)}`;
    }
  }
  return grid(items);
}

function renderGeneralMarket() {
  const cartArea = document.getElementById('market-cart-bar-area');
  if (cartArea) cartArea.innerHTML = renderMarketCartBar();
  const offersArea = document.getElementById('market-offers-area');
  if (offersArea) offersArea.innerHTML = renderMarketOffers();
  const searchInput = document.getElementById('market-search');
  if (searchInput) searchInput.value = marketFilter.query;
  const chipsEl = document.getElementById('market-filter-chips');
  if (chipsEl) chipsEl.innerHTML = renderMarketFilterChips();
  const area = document.getElementById('market-products-area');
  if (!area) return;
  // إيقاف كامل للصفحة من الأدمن (نوع مختلف عن hiddenFromMarket تبع تاجر وحد — شوف
  // toggleMarketPageEnabled بـ 15-admin-tools.js). لما تكون معطّلة، ما نعرض شريط بحث ولا
  // فلاتر ولا شريط عروض حتى — رسالة واحدة بس.
  if (data.settings.marketPageEnabled === false) {
    if (searchInput) searchInput.closest('.store-search-bar').style.display = 'none';
    if (chipsEl) chipsEl.innerHTML = '';
    if (offersArea) offersArea.innerHTML = '';
    area.innerHTML = '<div class="empty">🛒 صفحة السوق العام غير متوفرة حالياً — نعمل على تحسينها، رجعلها بعد شوي</div>';
    return;
  }
  if (searchInput) searchInput.closest('.store-search-bar').style.display = 'block';
  area.innerHTML = renderMarketProducts();
}
