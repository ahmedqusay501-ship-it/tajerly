// ---------- RESTAURANTS MARKET (صفحة المطاعم) ----------
// A second, separate public no-login page — same idea as GENERAL MARKET (19-general-market.js)
// but scoped ONLY to merchants tagged type === 'restaurant' (see setMerchantType in
// 15-admin-tools.js). Deliberately kept as its own page/route (?restaurants=1) instead of a
// filter chip on the general market, per spec: a restaurant market that's separate from the
// first (general) market. It reuses the exact same product-detail modal and cart/checkout
// flow as everywhere else — tapping a card calls openProductDetail(merchantId, productId)
// exactly like a normal store page does.
let restaurantsMarketActive = false;
let restaurantFilter = { query: '', category: 'all' };

function openRestaurantsMarket() {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('general-market-screen').style.display = 'none';
  generalMarketActive = false;
  document.getElementById('restaurants-screen').style.display = 'block';
  restaurantsMarketActive = true;
  publicStoreMerchantId = null; // not scoped to any single merchant here
  // نفس فكرة marketVisits بصفحة السوق العام — تُحسب حتى وهي معطّلة، شوف
  // renderRestaurantsMarket تحت وrenderMarketVisitsCard بـ 15-admin-tools.js.
  data.settings.restaurantsVisits = (data.settings.restaurantsVisits || 0) + 1;
  saveData();
  renderRestaurantsMarket();
}

// All products from every active restaurant-type merchant not hidden from this page —
// hiddenFromMarket is the SAME admin-only field the general market uses (see
// toggleMerchantMarketVisibility in 15-admin-tools.js); since a merchant is either
// type 'market' or 'restaurant', one shared flag safely controls visibility on whichever
// one of the two combined pages that merchant actually belongs to.
function allRestaurantProducts() {
  const items = [];
  data.merchants.filter(m => m.status === 'active' && !m.hiddenFromMarket && m.type === 'restaurant').forEach(m => {
    ensureMerchantTheme(m);
    m.products.forEach(p => items.push({ p, m }));
  });
  return items;
}

function renderRestaurantFilterChips() {
  const chip = (id, label) => `<span class="store-filter-chip${restaurantFilter.category === id ? ' selected' : ''}" onclick="setRestaurantFilterCategory('${id}')">${esc(label)}</span>`;
  return `<div class="store-filter-chips-row">${chip('all', t('market_filter_all') || 'الكل')}${STORE_CATEGORIES.map(c => chip(c, c)).join('')}</div>`;
}

function onRestaurantSearchInput() {
  const input = document.getElementById('restaurant-search');
  if (!input) return;
  restaurantFilter.query = input.value;
  updateRestaurantProductsArea();
}

function setRestaurantFilterCategory(cat) {
  restaurantFilter.category = cat;
  const chipsEl = document.getElementById('restaurant-filter-chips');
  if (chipsEl) chipsEl.innerHTML = renderRestaurantFilterChips();
  updateRestaurantProductsArea();
}

// Redraws only the grid area (not the search input itself) so typing never loses focus —
// same pattern as updateMarketProductsArea() for the general market.
function updateRestaurantProductsArea() {
  const area = document.getElementById('restaurant-products-area');
  if (area) area.innerHTML = renderRestaurantProducts();
  const cartArea = document.getElementById('restaurant-cart-bar-area');
  if (cartArea) cartArea.innerHTML = renderRestaurantCartBar();
}

function renderRestaurantCartBar() {
  if (!cart.length) return '';
  return `
    <div class="cart-bar" onclick="openCartModal()">
      <span>السلة (${cartCount()} قطعة)</span>
      <span>${cartSubtotal().toLocaleString()} د — إتمام الشراء ›</span>
    </div>
  `;
}

// Same compact grid card as the general market's, plus a small line naming which restaurant
// the item belongs to (and a quick link straight to that restaurant's own page).
function renderRestaurantProductCard(p, m) {
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
        <div class="store-product-card-shop" onclick="event.stopPropagation(); location.href='${storeLinkUrl(m)}'">🍽️ ${esc(m.shop)}</div>
      </div>
    </div>
  `;
}

function renderRestaurantProducts() {
  let items = allRestaurantProducts();

  const q = (restaurantFilter.query || '').trim().toLowerCase();
  if (q) items = items.filter(({ p, m }) => (p.name || '').toLowerCase().includes(q) || (m.shop || '').toLowerCase().includes(q));
  if (restaurantFilter.category && restaurantFilter.category !== 'all') {
    items = items.filter(({ m }) => m.category === restaurantFilter.category);
  }

  if (items.length === 0) {
    return `<div class="empty">${t('restaurants_empty') || 'ما فيه مطاعم أو أطباق مطابقة حالياً'}</div>`;
  }
  return `<div class="store-products-grid">${items.map(({ p, m }) => renderRestaurantProductCard(p, m)).join('')}</div>`;
}

function renderRestaurantsMarket() {
  const cartArea = document.getElementById('restaurant-cart-bar-area');
  if (cartArea) cartArea.innerHTML = renderRestaurantCartBar();
  const searchInput = document.getElementById('restaurant-search');
  if (searchInput) searchInput.value = restaurantFilter.query;
  const chipsEl = document.getElementById('restaurant-filter-chips');
  if (chipsEl) chipsEl.innerHTML = renderRestaurantFilterChips();
  const area = document.getElementById('restaurant-products-area');
  if (!area) return;
  if (data.settings.restaurantsPageEnabled === false) {
    if (searchInput) searchInput.closest('.store-search-bar')?.style.setProperty('display', 'none');
    if (chipsEl) chipsEl.innerHTML = '';
    area.innerHTML = '<div class="empty">🍽️ صفحة المطاعم غير متوفرة حالياً — نعمل على تحسينها، رجعلها بعد شوي</div>';
    return;
  }
  if (searchInput) searchInput.closest('.store-search-bar')?.style.setProperty('display', 'block');
  area.innerHTML = renderRestaurantProducts();
}
