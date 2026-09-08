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
let marketFilter = { query: '', category: 'all' };

function openGeneralMarket() {
  document.getElementById('home-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('join-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('public-store-screen').style.display = 'none';
  document.getElementById('general-market-screen').style.display = 'block';
  generalMarketActive = true;
  publicStoreMerchantId = null; // not scoped to any single merchant here
  renderGeneralMarket();
}

// All products from every active merchant, each tagged with its own merchant object so the
// card can show/link back to the right store. Backfills each merchant via ensureMerchantTheme
// first (same as every other place merchants get read from) so old-data merchants (missing
// category, products array, etc.) never break this page.
function allMarketProducts() {
  const items = [];
  data.merchants.filter(m => m.status === 'active').forEach(m => {
    ensureMerchantTheme(m);
    m.products.forEach(p => items.push({ p, m }));
  });
  return items;
}

function renderMarketFilterChips() {
  const chip = (id, label) => `<span class="store-filter-chip${marketFilter.category === id ? ' selected' : ''}" onclick="setMarketFilterCategory('${id}')">${esc(label)}</span>`;
  return `<div class="store-filter-chips-row">${chip('all', t('market_filter_all') || 'الكل')}${STORE_CATEGORIES.map(c => chip(c, c)).join('')}</div>`;
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

  const q = (marketFilter.query || '').trim().toLowerCase();
  if (q) items = items.filter(({ p }) => (p.name || '').toLowerCase().includes(q));
  if (marketFilter.category && marketFilter.category !== 'all') {
    items = items.filter(({ m }) => m.category === marketFilter.category);
  }

  if (items.length === 0) {
    return `<div class="empty">${t('market_empty') || 'ما فيه منتجات مطابقة حالياً'}</div>`;
  }
  return `<div class="store-products-grid">${items.map(({ p, m }) => renderMarketProductCard(p, m)).join('')}</div>`;
}

function renderGeneralMarket() {
  const cartArea = document.getElementById('market-cart-bar-area');
  if (cartArea) cartArea.innerHTML = renderMarketCartBar();
  const searchInput = document.getElementById('market-search');
  if (searchInput) searchInput.value = marketFilter.query;
  const chipsEl = document.getElementById('market-filter-chips');
  if (chipsEl) chipsEl.innerHTML = renderMarketFilterChips();
  const area = document.getElementById('market-products-area');
  if (area) area.innerHTML = renderMarketProducts();
}
