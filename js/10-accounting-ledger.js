// ---------- MERCHANT ACCOUNTING (isolated strictly to this merchant's own orders) ----------
function filteredMerchantAccountingOrders(merchantId) {
  const fromEl = document.getElementById(`macc-from-${merchantId}`);
  const toEl = document.getElementById(`macc-to-${merchantId}`);
  const from = fromEl ? fromEl.value : '';
  const to = toEl ? toEl.value : '';
  return data.orders.filter(o => {
    if (o.merchantId !== merchantId) return false; // hard isolation: never another merchant's data
    const d = o.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).slice().reverse();
}

function resetMerchantAccountingFilters(merchantId) {
  const fromEl = document.getElementById(`macc-from-${merchantId}`);
  const toEl = document.getElementById(`macc-to-${merchantId}`);
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  renderMerchantAccounting(merchantId);
}

function renderMerchantAccounting(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const summaryEl = document.getElementById(`macc-summary-${merchantId}`);
  const summary2El = document.getElementById(`macc-summary2-${merchantId}`);
  const ordersEl = document.getElementById(`macc-orders-${merchantId}`);
  if (!m || !summaryEl || !ordersEl) return;

  const orders = filteredMerchantAccountingOrders(merchantId);
  const accepted = orders.filter(o => o.status === 'accepted' && !o.cancelled);
  const totalSales = accepted.reduce((s, o) => s + o.price, 0);
  const totalFeeDeducted = accepted.reduce((s, o) => s + (o.feeFromMerchant || 0), 0);
  const totalItemDeduction = accepted.reduce((s, o) => s + (o.itemDeduction || 0), 0);
  const totalCouponDiscount = accepted.reduce((s, o) => s + (o.couponDiscount || 0), 0);
  const netProfit = totalSales - totalFeeDeducted - totalItemDeduction - totalCouponDiscount;
  const totalShipping = accepted.reduce((s, o) => s + (o.shippingFee || 0), 0);

  summaryEl.innerHTML = `
    <div class="stat"><div class="stat-num">${accepted.length}</div><div class="stat-label">طلبات مقبولة</div></div>
    <div class="stat"><div class="stat-num">${totalSales.toLocaleString()}</div><div class="stat-label">إجمالي مبيعاتي (د)</div></div>
    <div class="stat"><div class="stat-num">${totalFeeDeducted.toLocaleString()}</div><div class="stat-label">رسوم المنصة المستقطعة (د)</div></div>
  `;
  summary2El.innerHTML = `
    <div class="stat"><div class="stat-num">${totalItemDeduction.toLocaleString()}</div><div class="stat-label">استقطاع ثابت للقطع (د)</div></div>
    <div class="stat"><div class="stat-num">${totalCouponDiscount.toLocaleString()}</div><div class="stat-label">خصومات الكوبونات (د)</div></div>
    <div class="stat"><div class="stat-num">${netProfit.toLocaleString()}</div><div class="stat-label">صافي ربحي (د)</div></div>
    <div class="stat"><div class="stat-num">${totalShipping.toLocaleString()}</div><div class="stat-label">أجور توصيل زبائني (د)</div></div>
  `;

  if (orders.length === 0) {
    ordersEl.innerHTML = '<div class="empty">ما فيه عمليات مطابقة للفلاتر</div>';
    return;
  }
  ordersEl.innerHTML = orders.map(o => {
    const dateStr = orderDateTimeLabel(o.date);
    const net = o.status === 'accepted' && !o.cancelled ? (o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0)) : 0;
    return `<div class="list-item" style="align-items:flex-start;">
      <span>${esc(o.productName)}${o.size ? ' (مقاس ' + esc(o.size) + ')' : ''}${o.color ? ' — ' + esc(o.color) : ''} ${o.cancelled ? '<span class="badge rejected">ملغي</span>' : `<span class="badge ${o.status}">${orderStatusLabel(o.status)}</span>`}<br>
      <span style="color:var(--text-mute); font-size:11px;">${dateStr}</span><br>
      <span style="color:var(--text-mute); font-size:11px;">السعر: ${o.price.toLocaleString()} د — رسم منصة مستقطع مني: ${(o.feeFromMerchant || 0).toLocaleString()} د${o.itemDeduction ? ' — استقطاع القطعة: ' + o.itemDeduction.toLocaleString() + ' د' : ''}${o.couponDiscount ? ' — خصم كوبون ' + esc(o.couponCode || '') + ': ' + o.couponDiscount.toLocaleString() + ' د' : ''} — توصيل الزبون: ${(o.shippingFee || 0).toLocaleString()} د</span></span>
      <span style="text-align:left; white-space:nowrap;">${o.status === 'accepted' && !o.cancelled ? 'صافيّ: ' + net.toLocaleString() + ' د' : '—'}</span>
    </div>`;
  }).join('');
}

function exportMerchantAccountingExcel(merchantId) {
  if (typeof XLSX === 'undefined') { showToast('تعذر تحميل مكتبة تصدير الإكسل — تأكد من اتصالك بالإنترنت'); return; }
  const m = data.merchants.find(x => x.id === merchantId);
  const orders = filteredMerchantAccountingOrders(merchantId);
  if (!m || orders.length === 0) { showToast('ما فيه عمليات مطابقة للفلاتر الحالية لتصديرها'); return; }

  const rows = orders.map(o => ({
    'اليوم': new Date(o.date).toLocaleDateString('ar-IQ', { weekday: 'long' }),
    'التاريخ': new Date(o.date).toLocaleDateString('ar-IQ'),
    'الوقت': new Date(o.date).toLocaleTimeString('ar-IQ'),
    'المنتج': o.productName,
    'المقاس': o.size || '',
    'اللون': o.color || '',
    'السعر (د)': o.price,
    'رسم المنصة المستقطع مني (د)': o.feeFromMerchant || 0,
    'استقطاع ثابت للقطعة (د)': o.itemDeduction || 0,
    'كود الكوبون': o.couponCode || '',
    'خصم الكوبون (د)': o.couponDiscount || 0,
    'صافي المستحق لي (د)': o.status === 'accepted' && !o.cancelled ? (o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0)) : 0,
    'أجرة توصيل الزبون (د)': o.shippingFee || 0,
    'الحالة النهائية': orderFullStatusLabel(o),
    'مين ألغى': o.cancelled ? cancelByLabel(o.cancelBy) : '',
    'سبب الإلغاء': o.cancelReason || ''
  }));
  const accepted = orders.filter(o => o.status === 'accepted' && !o.cancelled);
  const totalSales = accepted.reduce((s, o) => s + o.price, 0);
  const totalFee = accepted.reduce((s, o) => s + (o.feeFromMerchant || 0), 0);
  const totalItemDeduction = accepted.reduce((s, o) => s + (o.itemDeduction || 0), 0);
  const totalCouponDiscount = accepted.reduce((s, o) => s + (o.couponDiscount || 0), 0);
  const totalPlatformDeduction = totalFee + totalItemDeduction;
  const netDue = totalSales - totalFee - totalItemDeduction - totalCouponDiscount;
  const summaryRows = [
    { 'البند': 'المحل', 'القيمة': m.shop },
    { 'البند': 'عدد الطلبات المقبولة (غير الملغية)', 'القيمة': accepted.length },
    { 'البند': 'عدد الطلبات الملغية', 'القيمة': orders.filter(o => o.cancelled).length },
    { 'البند': 'إجمالي مبيعاتي (د)', 'القيمة': totalSales },
    { 'البند': 'رسوم المنصة المستقطعة (د)', 'القيمة': totalFee },
    { 'البند': 'الاستقطاع الثابت للقطع (د)', 'القيمة': totalItemDeduction },
    { 'البند': 'إجمالي المستقطع للمنصة (رسوم + استقطاع القطع) (د)', 'القيمة': totalPlatformDeduction },
    { 'البند': 'إجمالي خصومات الكوبونات (د)', 'القيمة': totalCouponDiscount },
    { 'البند': 'المبلغ المستحق لي من المنصة (صافي) (د)', 'القيمة': netDue },
    { 'البند': 'عدد زيارات متجري', 'القيمة': m.visits || 0 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ملخص حساباتي');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'تفاصيل طلباتي');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `حسابات-${m.shop}-${stamp}.xlsx`);
  showToast('تم تحميل تقرير الإكسل ');
}

// PDF export uses the browser's own print dialog ("حفظ كـ PDF") instead of a PDF-generation
// library, so the Arabic text renders correctly (client-side PDF libraries don't shape Arabic well).
function exportMerchantAccountingPDF(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  const orders = filteredMerchantAccountingOrders(merchantId);
  if (!m || orders.length === 0) { showToast('ما فيه عمليات مطابقة للفلاتر الحالية لتصديرها'); return; }

  const accepted = orders.filter(o => o.status === 'accepted' && !o.cancelled);
  const totalSales = accepted.reduce((s, o) => s + o.price, 0);
  const totalFee = accepted.reduce((s, o) => s + (o.feeFromMerchant || 0), 0);
  const totalItemDeduction = accepted.reduce((s, o) => s + (o.itemDeduction || 0), 0);
  const totalCouponDiscount = accepted.reduce((s, o) => s + (o.couponDiscount || 0), 0);
  const netProfit = totalSales - totalFee - totalItemDeduction - totalCouponDiscount;
  const totalShipping = accepted.reduce((s, o) => s + (o.shippingFee || 0), 0);

  const rowsHtml = orders.map(o => {
    const dayStr = new Date(o.date).toLocaleDateString('ar-IQ', { weekday: 'long' });
    const dateStr = new Date(o.date).toLocaleDateString('ar-IQ');
    const timeStr = new Date(o.date).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
    const net = o.status === 'accepted' && !o.cancelled ? (o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0)) : 0;
    return `<tr>
      <td>${dayStr}</td>
      <td>${dateStr}</td>
      <td>${timeStr}</td>
      <td>${esc(o.productName)}${o.size ? ' (' + esc(o.size) + ')' : ''}${o.color ? ' — ' + esc(o.color) : ''}</td>
      <td>${o.price.toLocaleString()}</td>
      <td>${(o.feeFromMerchant || 0).toLocaleString()}</td>
      <td>${(o.itemDeduction || 0).toLocaleString()}</td>
      <td>${(o.couponDiscount || 0).toLocaleString()}</td>
      <td>${net.toLocaleString()}</td>
      <td>${orderStatusLabel(o.status)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>تقرير حسابات — ${esc(m.shop)}</title>
    <style>
      body { font-family: 'Cairo', Tahoma, Arial, sans-serif; padding: 24px; color:#1E293B; }
      h1 { font-size: 18px; margin-bottom: 2px; }
      .sub { color:#64748B; font-size:12px; margin-bottom:18px; }
      .summary { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px; }
      .summary div { border:1px solid #E2E8F0; border-radius:8px; padding:10px 14px; min-width:140px; }
      .summary b { display:block; font-size:16px; margin-bottom:2px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th, td { border:1px solid #E2E8F0; padding:6px 8px; text-align:center; }
      th { background:#D1FAE5; }
      /* This report window can get opened straight into a phone browser tab before the person
         taps "print" (popup blocked, or they just want to look first) — the 10-column table is
         wider than a phone screen, so it needs its own horizontal scroller instead of forcing
         the whole page to scroll sideways. Doesn't affect the printed/PDF output either way. */
      .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      @media (max-width: 480px) { table { font-size: 10.5px; } th, td { padding: 5px 5px; } }
      @media print { body { padding: 8px; } .table-scroll { overflow-x: visible; } }
    </style></head><body>
      <h1>تقرير حسابات — ${esc(m.shop)}</h1>
      <div class="sub">تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')} — عدد زيارات المتجر: ${m.visits || 0}</div>
      <div class="summary">
        <div><b>${accepted.length}</b>طلبات مقبولة</div>
        <div><b>${totalSales.toLocaleString()} د</b>إجمالي المبيعات</div>
        <div><b>${totalFee.toLocaleString()} د</b>رسوم المنصة المستقطعة</div>
        <div><b>${totalItemDeduction.toLocaleString()} د</b>استقطاع ثابت للقطع</div>
        <div><b>${totalCouponDiscount.toLocaleString()} د</b>خصومات الكوبونات</div>
        <div><b>${netProfit.toLocaleString()} د</b>صافي ربحي</div>
        <div><b>${totalShipping.toLocaleString()} د</b>أجور توصيل الزبائن</div>
      </div>
      <div class="table-scroll">
      <table>
        <thead><tr><th>اليوم</th><th>التاريخ</th><th>الوقت</th><th>المنتج</th><th>السعر (د)</th><th>رسم مستقطع (د)</th><th>استقطاع القطعة (د)</th><th>خصم الكوبون (د)</th><th>صافي (د)</th><th>الحالة</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      </div>
    </body></html>`;

  const printWin = window.open('', '_blank');
  if (!printWin) { showToast('المتصفح منع فتح نافذة الطباعة — فعّل النوافذ المنبثقة واعد المحاولة'); return; }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  setTimeout(() => { try { printWin.focus(); printWin.print(); } catch (e) {} }, 350);
  showToast('اختر "حفظ كـ PDF" من نافذة الطباعة اللي فتحت');
}

// ---------- ACCOUNTING / FINANCIAL REPORTS ----------
function getAccountingFilters() {
  const from = document.getElementById('acc-from').value;
  const to = document.getElementById('acc-to').value;
  const merchantId = document.getElementById('acc-merchant').value;
  const status = document.getElementById('acc-status').value;
  return { from, to, merchantId, status };
}

function filteredAccountingOrders() {
  const f = getAccountingFilters();
  return data.orders.filter(o => {
    const d = new Date(o.date);
    if (f.from && d < new Date(f.from + 'T00:00:00')) return false;
    if (f.to && d > new Date(f.to + 'T23:59:59')) return false;
    if (f.merchantId !== 'all' && String(o.merchantId) !== f.merchantId) return false;
    if (f.status !== 'all' && o.status !== f.status) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function resetAccountingFilters() {
  document.getElementById('acc-from').value = '';
  document.getElementById('acc-to').value = '';
  document.getElementById('acc-merchant').value = 'all';
  document.getElementById('acc-status').value = 'all';
  renderAccounting();
}

// ---------- LIVE PER-MERCHANT STATS (dashboard merchant list boxes) ----------
// Recomputed fresh from data.orders on every call, so it's naturally 100% live: it changes the
// instant an order is accepted/cancelled, and gets a fresh read on every 5s live-refresh tick
// (renderDashboard → this) with no caching to go stale.
// "قطع مباعة" = count of accepted&non-cancelled order records (each cart unit is its own order
// record — see the checkout code). "عدد الطلبات" = distinct customer checkouts (orderGroupId),
// so a single customer buying 3 pieces in one checkout counts as 1 order / 3 pieces, and the
// average pieces-per-order divides one by the other.
function computeMerchantLiveStats(merchantId) {
  const paid = data.orders.filter(o => o.merchantId === merchantId && o.status === 'accepted' && !o.cancelled);
  const sales = paid.reduce((s, o) => s + o.price, 0);
  const merchantDue = paid.reduce((s, o) => s + orderDueSplit(o).merchantDue, 0);
  const platformDue = paid.reduce((s, o) => s + orderDueSplit(o).platformDue, 0);
  const piecesSold = paid.length;
  const orderGroups = new Set(paid.map(o => o.orderGroupId || o.id));
  const ordersCount = orderGroups.size;
  const avgPieces = ordersCount > 0 ? piecesSold / ordersCount : 0;
  return { sales, merchantDue, platformDue, piecesSold, ordersCount, avgPieces };
}

function accountingMerchantBreakdown(orders) {
  const byMerchant = {};
  orders.forEach(o => {
    if (!byMerchant[o.merchantId]) {
      byMerchant[o.merchantId] = {
        count: 0, accepted: 0, sales: 0, feeCustomer: 0, feeMerchant: 0, itemDeduction: 0,
        couponDiscount: 0, shipping: 0, netPayout: 0,
        cancelledCount: 0, withCommissionCount: 0, withoutCommissionCount: 0
      };
    }
    const b = byMerchant[o.merchantId];
    b.count++;
    // "ملغاة" تحسب بغض النظر عن حالتها الأصلية (مقبولة كانت أو لا) — أي طلب انلغى فعلاً.
    if (o.cancelled) b.cancelledCount++;
    // Financial totals only count orders that actually generated revenue (accepted &
    // not cancelled) — pending/rejected/cancelled orders never got paid, so they
    // shouldn't inflate sales, fees, or payout figures even though they still count
    // toward "count" (total submitted orders in the current filter).
    if (o.status === 'accepted' && !o.cancelled) {
      b.accepted++;
      b.sales += o.price;
      b.feeCustomer += o.feeFromCustomer;
      b.feeMerchant += o.feeFromMerchant;
      b.itemDeduction += (o.itemDeduction || 0);
      b.couponDiscount += (o.couponDiscount || 0);
      b.shipping += (o.shippingFee || 0);
      b.netPayout += (o.price - o.feeFromMerchant - (o.itemDeduction || 0) - (o.couponDiscount || 0));
      // "عليها عمولة" = فعلياً انخصم منها رسم منصة (من الزبون أو من التاجر) — لو الاثنين
      // صفر فهذي قطعة معفاة من العمولة (سعرها تحت حد الإعفاء، أو منتج معفى بالاسم).
      if ((o.feeFromCustomer || 0) > 0 || (o.feeFromMerchant || 0) > 0) b.withCommissionCount++;
      else b.withoutCommissionCount++;
    }
  });
  return byMerchant;
}

// ---------- ACCOUNTING: PER-MERCHANT DUES BY PERIOD (اليوم / آخر أسبوع / آخر شهر) ----------
// Independent of the date-range filters above — always reflects "right now" relative to the
// three fixed windows, so the admin can check today/this-week/this-month payouts without
// having to touch the filter fields. Only accepted & not-cancelled orders count (same rule
// as accountingMerchantBreakdown), since pending/rejected/cancelled orders never generated
// any real money owed in either direction.
function computeMerchantPeriodDues() {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);   // اليوم + آخر 6 أيام = 7 أيام
  const startMonth = new Date(startToday); startMonth.setDate(startMonth.getDate() - 29); // اليوم + آخر 29 يوم = 30 يوم

  const periods = [
    { key: 'today', from: startToday },
    { key: 'week', from: startWeek },
    { key: 'month', from: startMonth },
  ];

  const byMerchant = {};
  data.merchants.forEach(m => {
    byMerchant[m.id] = {
      merchant: m,
      today: { merchantDue: 0, platformDue: 0 },
      week: { merchantDue: 0, platformDue: 0 },
      month: { merchantDue: 0, platformDue: 0 },
    };
  });

  data.orders.forEach(o => {
    if (o.status !== 'accepted' || o.cancelled) return;
    const bucket = byMerchant[o.merchantId];
    if (!bucket) return; // تاجر محذوف — نتجاهله بنفس منطق accountingMerchantBreakdown
    const d = new Date(o.date);
    const merchantDue = o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0);
    const platformDue = (o.feeFromCustomer || 0) + (o.feeFromMerchant || 0) + (o.itemDeduction || 0);
    periods.forEach(p => {
      if (d >= p.from) {
        bucket[p.key].merchantDue += merchantDue;
        bucket[p.key].platformDue += platformDue;
      }
    });
  });

  return byMerchant;
}

// ---------- DAILY LEDGER (per-day settlement pages) ----------
// Groups orders into calendar-day "pages" (newest first) so admin/merchant never need to pick
// a date range just to see today's or yesterday's dues — they just page through days with the
// arrows. Each page's footer shows that single day's "مستحق التاجر" / "مستحق المنصة" totals.
function ledgerDayKey(dateVal) {
  const d = new Date(dateVal);
  const y = d.getFullYear(), mo = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
function ledgerDayLabel(dateKey) {
  // Reconstruct a local midday Date from the key (avoids UTC day-shift near midnight).
  const [y, mo, da] = dateKey.split('-').map(Number);
  const d = new Date(y, mo - 1, da, 12, 0, 0);
  const weekday = d.toLocaleDateString('ar-IQ', { weekday: 'long' });
  const dateStr = d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${weekday} — ${dateStr}`;
}
// Each ledger page is numbered by its day-of-month — يوم 1 بالشهر = صفحة رقم 1، يوم 2 = صفحة رقم 2،
// وهكذا لباقي أيام الشهر — بغض النظر عن ترتيبها ضمن قائمة الصفحات المعروضة.
function ledgerPageNumber(dateKey) {
  return Number(dateKey.split('-')[2]);
}
function ledgerPageLabel(dateKey) {
  return `صفحة رقم ${ledgerPageNumber(dateKey)} — ${ledgerDayLabel(dateKey)}`;
}
function orderDueSplit(o) {
  if (o.status !== 'accepted' || o.cancelled) return { merchantDue: 0, platformDue: 0 };
  return {
    merchantDue: o.price - (o.feeFromMerchant || 0) - (o.itemDeduction || 0) - (o.couponDiscount || 0),
    platformDue: (o.feeFromCustomer || 0) + (o.feeFromMerchant || 0) + (o.itemDeduction || 0)
  };
}
// true when a (merchant, day) page was closed by the admin in a way that hides it from `role`
// ('admin' or 'merchant'). scope 'both' is handled by actually deleting the orders (see
// closeLedgerDay), so it never needs to be checked here — this only covers one-sided hides.
function isLedgerDayHiddenFor(merchantId, dateKey, role) {
  return (data.ledgerClosures || []).some(c => c.merchantId === merchantId && c.dateKey === dateKey && (c.scope === 'both' || c.scope === role));
}
// Builds day-by-day pages for a set of orders, newest day first. `role` controls which
// one-sided closures apply — 'admin' when building the combined admin ledger, 'merchant' when
// building one merchant's own ledger (merchantId is passed in that case).
function buildLedgerDays(orders, role, merchantId) {
  const byDay = new Map();
  orders.forEach(o => {
    const dateKey = ledgerDayKey(o.date);
    const ownerId = merchantId != null ? merchantId : o.merchantId;
    if (isLedgerDayHiddenFor(ownerId, dateKey, role)) return;
    if (!byDay.has(dateKey)) byDay.set(dateKey, { dateKey, orders: [], byMerchant: {} });
    const bucket = byDay.get(dateKey);
    bucket.orders.push(o);
    if (!bucket.byMerchant[o.merchantId]) bucket.byMerchant[o.merchantId] = { merchantId: o.merchantId, orders: [], merchantDue: 0, platformDue: 0 };
    const mb = bucket.byMerchant[o.merchantId];
    mb.orders.push(o);
    const split = orderDueSplit(o);
    mb.merchantDue += split.merchantDue;
    mb.platformDue += split.platformDue;
  });
  const days = Array.from(byDay.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  days.forEach(day => {
    day.orders.sort((a, b) => new Date(b.date) - new Date(a.date));
    day.totalMerchantDue = Object.values(day.byMerchant).reduce((s, mb) => s + mb.merchantDue, 0);
    day.totalPlatformDue = Object.values(day.byMerchant).reduce((s, mb) => s + mb.platformDue, 0);
  });
  return days;
}

// ---------- ADMIN-ONLY: CLOSE/DELETE A DAY'S LEDGER PAGE ----------
// A merchant never gets any control here — only the admin decides to close a day's page, and
// picks whether that closes it for both sides (permanently deletes the orders), just their
// own admin-side view, or just the merchant's view. See the modal in the page body.
let closeLedgerTarget = null; // { dateKey, merchantIds }
function openCloseLedgerDayModal(dateKey, merchantIds) {
  closeLedgerTarget = { dateKey, merchantIds };
  const shops = merchantIds.map(id => { const m = data.merchants.find(x => x.id === id); return m ? m.shop : 'تاجر محذوف'; });
  document.getElementById('close-ledger-text').textContent =
    `راح تسكّر ${ledgerPageLabel(dateKey)} لـ: ${shops.join('، ')}. اختر الجهة اللي تريد تسكّر الصفحة عندها:`;
  document.querySelectorAll('input[name="close-ledger-scope"]').forEach(r => { r.checked = r.value === 'both'; });
  document.getElementById('close-ledger-modal').classList.add('show');
}
function closeLedgerModalHide() {
  document.getElementById('close-ledger-modal').classList.remove('show');
  closeLedgerTarget = null;
}
document.getElementById('close-ledger-confirm-btn').addEventListener('click', async () => {
  if (!closeLedgerTarget) return;
  const scopeInput = document.querySelector('input[name="close-ledger-scope"]:checked');
  const scope = scopeInput ? scopeInput.value : 'both';
  const { dateKey, merchantIds } = closeLedgerTarget;
  closeLedgerModalHide();
  await closeLedgerDay(dateKey, merchantIds, scope);
});

async function closeLedgerDay(dateKey, merchantIds, scope) {
  const shops = merchantIds.map(id => { const m = data.merchants.find(x => x.id === id); return m ? m.shop : `#${id}`; }).join('، ');
  if (scope === 'both') {
    // Real, permanent deletion — same pattern as deleteSelectedAccountingOrders().
    const removedOrders = data.orders.filter(o => merchantIds.includes(o.merchantId) && ledgerDayKey(o.date) === dateKey);
    data.orders = data.orders.filter(o => !(merchantIds.includes(o.merchantId) && ledgerDayKey(o.date) === dateKey));
    await saveData();
    if (window.authApi && removedOrders.length > 0) {
      const results = await Promise.allSettled(removedOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) showToast(`تعذر حذف ${failCount} من ${removedOrders.length} عملية من قاعدة البيانات — راح ترجع تظهر عند أول تحديث`);
    }
    await logAudit('إغلاق سجل يومي (حذف نهائي)', `اليوم ${dateKey} — ${shops} — ${removedOrders.length} عملية`);
    showToast('تم حذف سجل هذا اليوم نهائياً من عند الطرفين');
  } else {
    merchantIds.forEach(merchantId => {
      data.ledgerClosures.push({
        id: Date.now() + '-' + merchantId + '-' + Math.random().toString(36).slice(2, 6),
        dateKey, merchantId, scope,
        closedAt: new Date().toISOString(),
        closedBy: currentActorLabel()
      });
    });
    await saveData();
    await logAudit('إغلاق سجل يومي', `اليوم ${dateKey} — ${shops} — إخفاء من عند ${scope === 'admin' ? 'الأدمن فقط' : 'التاجر فقط'}`);
    showToast(scope === 'admin' ? 'تم إخفاء سجل هذا اليوم من صفحتك — يبقى ظاهر عند التاجر' : 'تم إخفاء سجل هذا اليوم من صفحة التاجر — يبقى ظاهر عندك');
  }
  renderAll();
}

// ---------- ADMIN DAILY LEDGER (dashboard "التسويات اليومية" tab) ----------
let adminLedgerDayIndex = 0; // 0 = most recent day with data
function renderAdminLedgerMerchantFilter() {
  const sel = document.getElementById('ledger-admin-merchant');
  if (!sel) return;
  const current = sel.value || 'all';
  sel.innerHTML = '<option value="all">كل التجار</option>' + data.merchants.map(m => `<option value="${m.id}">${esc(m.shop)}</option>`).join('');
  sel.value = Array.from(sel.options).some(o => o.value === current) ? current : 'all';
}
function changeAdminLedgerMerchant() {
  adminLedgerDayIndex = 0; // switching merchant restarts at their latest day
  selectedLedgerPageKeys.clear(); // switching merchant/filter invalidates any in-progress page selection
  renderAdminLedger();
}
function navAdminLedgerDay(delta) {
  adminLedgerDayIndex = Math.max(0, adminLedgerDayIndex + delta);
  renderAdminLedger();
}
function renderAdminLedger() {
  const container = document.getElementById('d-settlements');
  const navEl = document.getElementById('ledger-admin-nav');
  if (!container) return;
  renderAdminLedgerMerchantFilter();
  const merchantSel = document.getElementById('ledger-admin-merchant');
  const merchantId = merchantSel && merchantSel.value !== 'all' ? Number(merchantSel.value) : null;
  const orders = merchantId != null ? data.orders.filter(o => o.merchantId === merchantId) : data.orders;
  const days = buildLedgerDays(orders, 'admin', merchantId);

  if (days.length === 0) {
    container.innerHTML = '<div class="empty">ما فيه عمليات بيع مسجلة</div>';
    if (navEl) navEl.innerHTML = '';
    return;
  }
  if (adminLedgerDayIndex > days.length - 1) adminLedgerDayIndex = days.length - 1;
  const day = days[adminLedgerDayIndex];

  if (navEl) {
    navEl.innerHTML = `
      <button class="btn secondary small" ${adminLedgerDayIndex >= days.length - 1 ? 'disabled' : ''} onclick="navAdminLedgerDay(1)">◀ يوم أسبق</button>
      <b style="font-size:13px;">${ledgerPageLabel(day.dateKey)}</b>
      <button class="btn secondary small" ${adminLedgerDayIndex <= 0 ? 'disabled' : ''} onclick="navAdminLedgerDay(-1)">يوم أحدث ▶</button>
    `;
  }

  const merchantBlocks = Object.values(day.byMerchant).map(mb => {
    const m = data.merchants.find(x => x.id === mb.merchantId);
    const shop = m ? esc(m.shop) : 'تاجر محذوف';
    const ordersHtml = mb.orders.map(o => `
      <div class="list-item" style="align-items:flex-start;">
        <span>${esc(o.productName)} ${o.cancelled ? '<span class="badge rejected">ملغي</span>' : `<span class="badge ${o.status}">${orderStatusLabel(o.status)}</span>`}${orderCustomerLine(o)}<br>
        <span style="color:var(--text-mute); font-size:11px;">${orderDateTimeLabel(o.date)}</span></span>
        <span>${(o.feeFromCustomer + o.feeFromMerchant + (o.itemDeduction || 0)).toLocaleString()} د</span>
      </div>`).join('');
    return `
      <div class="card" style="box-shadow:none; border-style:dashed; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
          <b style="font-size:13px;">${shop}</b>
          <button class="btn danger small" style="padding:4px 10px; font-size:11px;" onclick="openCloseLedgerDayModal('${day.dateKey}', [${mb.merchantId}])">إغلاق سجل هذا اليوم لهذا التاجر</button>
        </div>
        ${ordersHtml}
        <div style="display:flex; justify-content:space-between; gap:8px; font-size:12px; padding-top:6px; margin-top:4px; border-top:1px dashed var(--border);">
          <span>مستحق التاجر: <b>${mb.merchantDue.toLocaleString()} د</b></span>
          <span>مستحق المنصة: <b>${mb.platformDue.toLocaleString()} د</b></span>
        </div>
      </div>`;
  }).join('');

  const allMerchantIds = Object.keys(day.byMerchant).map(Number);
  container.innerHTML = `
    ${merchantBlocks}
    <div class="card" style="background:var(--accent-soft); border:none;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <div style="font-size:13px;">
          إجمالي مستحقات التجار هذا اليوم: <b>${day.totalMerchantDue.toLocaleString()} د</b><br>
          إجمالي مستحقات المنصة هذا اليوم: <b>${day.totalPlatformDue.toLocaleString()} د</b>
        </div>
        ${allMerchantIds.length > 1 ? `<button class="btn danger small" onclick='openCloseLedgerDayModal("${day.dateKey}", ${JSON.stringify(allMerchantIds)})'>إغلاق سجل كل تجار هذا اليوم</button>` : ''}
      </div>
    </div>
  `;
  renderLedgerPagesManager();
}

// ---------- ADMIN: SELECT-AND-DELETE LEDGER PAGES (per merchant) ----------
// Separate from closeLedgerDay's one-page-at-a-time "إغلاق" flow above — this lets the admin
// pick a specific merchant, see ALL of that merchant's day-pages in one list, and permanently
// delete one page, several picked pages, or literally every page — always scoped to that one
// merchant, never mixed across merchants in a single action.
let selectedLedgerPageKeys = new Set();
function pruneLedgerPageSelection(days) {
  const validKeys = new Set(days.map(d => d.dateKey));
  selectedLedgerPageKeys.forEach(k => { if (!validKeys.has(k)) selectedLedgerPageKeys.delete(k); });
}
function toggleLedgerPageSelection(dateKey, checked) {
  if (checked) selectedLedgerPageKeys.add(dateKey); else selectedLedgerPageKeys.delete(dateKey);
  renderLedgerPagesManager();
}
function toggleSelectAllLedgerPages(checked) {
  const merchantSel = document.getElementById('ledger-admin-merchant');
  const merchantId = merchantSel && merchantSel.value !== 'all' ? Number(merchantSel.value) : null;
  if (merchantId == null) return;
  const days = buildLedgerDays(data.orders.filter(o => o.merchantId === merchantId), 'admin', merchantId);
  if (checked) days.forEach(d => selectedLedgerPageKeys.add(d.dateKey));
  else days.forEach(d => selectedLedgerPageKeys.delete(d.dateKey));
  renderLedgerPagesManager();
}
function deleteSelectedLedgerPages(merchantId) {
  const dateKeys = Array.from(selectedLedgerPageKeys);
  if (dateKeys.length === 0) return;
  confirmDeleteLedgerPages(merchantId, dateKeys);
}
function confirmDeleteLedgerPages(merchantId, dateKeys) {
  if (!dateKeys || dateKeys.length === 0) return;
  const m = data.merchants.find(x => x.id === merchantId);
  const shop = m ? m.shop : `تاجر #${merchantId}`;
  const sortedKeys = [...dateKeys].sort();
  const label = sortedKeys.length === 1
    ? ledgerPageLabel(sortedKeys[0])
    : `${sortedKeys.length} صفحة (${sortedKeys.map(k => 'رقم ' + ledgerPageNumber(k)).join('، ')})`;
  openConfirmModal('حذف صفحات السجل', `متأكد راح تحذف ${label} نهائياً لمحل "${shop}"؟ هذا يحذف كل عمليات البيع المسجلة بهذي الصفحة/الصفحات من عند الطرفين (التاجر والأدمن) نهائياً ولا يمكن التراجع عنه.`, async () => {
    const keySet = new Set(dateKeys);
    const removedOrders = data.orders.filter(o => o.merchantId === merchantId && keySet.has(ledgerDayKey(o.date)));
    data.orders = data.orders.filter(o => !(o.merchantId === merchantId && keySet.has(ledgerDayKey(o.date))));
    dateKeys.forEach(k => selectedLedgerPageKeys.delete(k));
    await saveData();
    // Same reasoning as closeLedgerDay's 'both' branch: without an explicit remote delete these
    // orders would still exist in Firestore and silently reappear on the next 5s live-refresh.
    if (window.authApi && removedOrders.length > 0) {
      const results = await Promise.allSettled(removedOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) showToast(`تعذر حذف ${failCount} من ${removedOrders.length} عملية من قاعدة البيانات — راح ترجع تظهر عند أول تحديث`);
    }
    await logAudit('حذف صفحات سجل يومي', `${shop} — ${dateKeys.length} صفحة (${sortedKeys.join('، ')}) — ${removedOrders.length} عملية`);
    showToast(`تم حذف ${dateKeys.length === 1 ? 'الصفحة' : dateKeys.length + ' صفحة'} نهائياً`);
    renderAll();
  });
}
function renderLedgerPagesManager() {
  const el = document.getElementById('ledger-pages-manager');
  if (!el) return;
  const merchantSel = document.getElementById('ledger-admin-merchant');
  const merchantId = merchantSel && merchantSel.value !== 'all' ? Number(merchantSel.value) : null;
  if (merchantId == null) {
    el.innerHTML = '<div class="empty">اختر تاجر معين من القائمة فوق عشان تكدر تدير وتحذف صفحات سجله (كل الصفحات، صفحة وحدة، أو عدة صفحات) — هذا الإجراء يصير لكل تاجر لحاله</div>';
    return;
  }
  const m = data.merchants.find(x => x.id === merchantId);
  const shopName = m ? esc(m.shop) : `تاجر #${merchantId}`;
  const days = buildLedgerDays(data.orders.filter(o => o.merchantId === merchantId), 'admin', merchantId);
  pruneLedgerPageSelection(days);
  if (days.length === 0) {
    el.innerHTML = `<div class="empty">ما فيه صفحات سجل لمحل ${shopName}</div>`;
    return;
  }
  const rows = days.map(day => {
    const checked = selectedLedgerPageKeys.has(day.dateKey) ? 'checked' : '';
    return `
    <div class="list-item" style="align-items:flex-start;">
      <input type="checkbox" style="width:auto; margin-top:3px;" ${checked} onchange="toggleLedgerPageSelection('${day.dateKey}', this.checked)">
      <span>${ledgerPageLabel(day.dateKey)}<br>
      <span style="color:var(--text-mute); font-size:11px;">${day.orders.length} عملية — مستحق التاجر: ${day.totalMerchantDue.toLocaleString()} د — مستحق المنصة: ${day.totalPlatformDue.toLocaleString()} د</span></span>
      <button class="btn danger small" onclick='confirmDeleteLedgerPages(${merchantId}, ["${day.dateKey}"])'>حذف هذي الصفحة</button>
    </div>`;
  }).join('');
  const allSelected = days.every(d => selectedLedgerPageKeys.has(d.dateKey));
  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; cursor:pointer;">
        <input type="checkbox" style="width:auto;" ${allSelected ? 'checked' : ''} onchange="toggleSelectAllLedgerPages(this.checked)"> تحديد كل صفحات ${shopName} (${days.length})
      </label>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn danger small" ${selectedLedgerPageKeys.size === 0 ? 'disabled' : ''} onclick="deleteSelectedLedgerPages(${merchantId})">حذف المحدد (${selectedLedgerPageKeys.size})</button>
        <button class="btn danger small" onclick='confirmDeleteLedgerPages(${merchantId}, ${JSON.stringify(days.map(d => d.dateKey))})'>حذف كل الصفحات (${days.length})</button>
      </div>
    </div>
    ${rows}
  `;
}

// ---------- MERCHANT DAILY LEDGER (inside "الأرباح والحسابات" tab) ----------
// Merchant-facing mirror of the admin's daily ledger — same day-by-day pages, same
// merchant/platform due split at the bottom of each page. No delete/close control here on
// purpose: only the admin can close a day's page (see closeLedgerDay), so a merchant can never
// tamper with or erase their own settlement history.
let merchantLedgerDayIndex = 0;
function navMerchantLedgerDay(merchantId, delta) {
  merchantLedgerDayIndex = Math.max(0, merchantLedgerDayIndex + delta);
  renderMerchantLedger(merchantId);
}
function renderMerchantLedger(merchantId) {
  const container = document.getElementById(`macc-ledger-${merchantId}`);
  const navEl = document.getElementById(`macc-ledger-nav-${merchantId}`);
  const footEl = document.getElementById(`macc-ledger-total-${merchantId}`);
  if (!container) return;
  const orders = data.orders.filter(o => o.merchantId === merchantId);
  const days = buildLedgerDays(orders, 'merchant', merchantId);

  if (days.length === 0) {
    container.innerHTML = '<div class="empty">ما فيه عمليات بيع مسجلة بعد</div>';
    if (navEl) navEl.innerHTML = '';
    if (footEl) footEl.innerHTML = '';
    return;
  }
  if (merchantLedgerDayIndex > days.length - 1) merchantLedgerDayIndex = days.length - 1;
  const day = days[merchantLedgerDayIndex];

  if (navEl) {
    navEl.innerHTML = `
      <button class="btn secondary small" ${merchantLedgerDayIndex >= days.length - 1 ? 'disabled' : ''} onclick="navMerchantLedgerDay(${merchantId}, 1)">◀ يوم أسبق</button>
      <b style="font-size:13px;">${ledgerPageLabel(day.dateKey)}</b>
      <button class="btn secondary small" ${merchantLedgerDayIndex <= 0 ? 'disabled' : ''} onclick="navMerchantLedgerDay(${merchantId}, -1)">يوم أحدث ▶</button>
    `;
  }

  container.innerHTML = day.orders.map(o => {
    const split = orderDueSplit(o);
    return `<div class="list-item" style="align-items:flex-start;">
      <span>${esc(o.productName)}${o.size ? ' (مقاس ' + esc(o.size) + ')' : ''}${o.color ? ' — ' + esc(o.color) : ''} ${o.cancelled ? '<span class="badge rejected">ملغي</span>' : `<span class="badge ${o.status}">${orderStatusLabel(o.status)}</span>`}<br>
      <span style="color:var(--text-mute); font-size:11px;">${orderDateTimeLabel(o.date)}</span></span>
      <span style="text-align:left; white-space:nowrap;">${o.status === 'accepted' && !o.cancelled ? 'صافيّ: ' + split.merchantDue.toLocaleString() + ' د' : '—'}</span>
    </div>`;
  }).join('');

  if (footEl) {
    footEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; flex-wrap:wrap;">
        <span>مستحق لي هذا اليوم: <b>${day.totalMerchantDue.toLocaleString()} د</b></span>
        <span>مستحق للمنصة هذا اليوم: <b>${day.totalPlatformDue.toLocaleString()} د</b></span>
      </div>
      <div class="subtitle" style="margin-top:6px; margin-bottom:0;">سجل هذا اليوم ما يقدر يحذفه إلا الأدمن — ما عندك صلاحية حذف أو تعديل هنا</div>
    `;
  }
}

function renderMerchantPeriodDues() {
  const el = document.getElementById('acc-merchant-periods');
  if (!el) return;

  // فلتر التاجر الخاص بهاي الصفحة (مستقل عن فلتر صفحة الحسابات acc-merchant)
  const merchantSelect = document.getElementById('dues-merchant');
  let selectedMerchantId = 'all';
  if (merchantSelect) {
    const currentSel = merchantSelect.value || 'all';
    merchantSelect.innerHTML = '<option value="all">كل التجار</option>' +
      data.merchants.map(m => `<option value="${m.id}">${esc(m.shop)}</option>`).join('');
    merchantSelect.value = Array.from(merchantSelect.options).some(o => o.value === currentSel) ? currentSel : 'all';
    selectedMerchantId = merchantSelect.value;
  }

  const byMerchant = computeMerchantPeriodDues();
  let rows = Object.values(byMerchant);
  if (selectedMerchantId !== 'all') rows = rows.filter(b => String(b.merchant.id) === selectedMerchantId);
  // نعرض بس تجار عندهم نشاط بأي فترة من الثلاثة — عشان ما تطول القائمة بتجار ما بيعوا شي أبداً
  rows = rows.filter(b =>
    b.today.merchantDue || b.today.platformDue ||
    b.week.merchantDue || b.week.platformDue ||
    b.month.merchantDue || b.month.platformDue
  ).sort((a, b) => b.month.merchantDue - a.month.merchantDue);

  // إجمالي كل التجار مجتمعين (بعد الفلتر)، لبطاقات الملخص فوق الجدول
  const totalsEl = document.getElementById('dues-totals');
  if (totalsEl) {
    const totals = rows.reduce((acc, b) => {
      acc.today.merchantDue += b.today.merchantDue; acc.today.platformDue += b.today.platformDue;
      acc.week.merchantDue += b.week.merchantDue; acc.week.platformDue += b.week.platformDue;
      acc.month.merchantDue += b.month.merchantDue; acc.month.platformDue += b.month.platformDue;
      return acc;
    }, { today: { merchantDue: 0, platformDue: 0 }, week: { merchantDue: 0, platformDue: 0 }, month: { merchantDue: 0, platformDue: 0 } });
    const statBlock = (label, bucket) => `
      <div class="stat">
        <div class="stat-num" style="font-size:15px;">${bucket.merchantDue.toLocaleString()} د</div>
        <div class="stat-num" style="font-size:15px; color:#0EA5E9;">${bucket.platformDue.toLocaleString()} د</div>
        <div class="stat-label">${label}</div>
      </div>`;
    totalsEl.innerHTML = statBlock('اليوم', totals.today) + statBlock('آخر أسبوع', totals.week) + statBlock('آخر شهر', totals.month);
  }

  if (rows.length === 0) {
    el.innerHTML = '<div class="empty">ما فيه مستحقات بهاي الفترات</div>';
    return;
  }

  const periodRow = (label, bucket) => `
    <div style="display:flex; justify-content:space-between; gap:8px; font-size:11.5px; padding:3px 0; border-top:1px dashed #EEE;">
      <span style="color:var(--text-mute); min-width:64px;">${label}</span>
      <span>له: <b>${bucket.merchantDue.toLocaleString()} د</b></span>
      <span>للمنصة: <b>${bucket.platformDue.toLocaleString()} د</b></span>
    </div>`;

  el.innerHTML = rows.map(b => `
    <div class="list-item" style="align-items:flex-start; flex-direction:column;">
      <b>${esc(b.merchant.shop)}</b>
      ${periodRow('اليوم', b.today)}
      ${periodRow('آخر أسبوع', b.week)}
      ${periodRow('آخر شهر', b.month)}
    </div>`).join('');
}

function renderAccounting() {
  const merchantSelect = document.getElementById('acc-merchant');
  const currentSel = merchantSelect.value || 'all';
  merchantSelect.innerHTML = '<option value="all">كل التجار</option>' +
    data.merchants.map(m => `<option value="${m.id}">${m.shop}</option>`).join('');
  merchantSelect.value = Array.from(merchantSelect.options).some(o => o.value === currentSel) ? currentSel : 'all';

  const orders = filteredAccountingOrders();
  // Only orders that actually generated revenue (accepted & not cancelled) count toward
  // the financial totals below — pending/rejected/cancelled orders were never paid, so
  // including them would overstate real sales and platform profit. The detail table
  // further down still lists every order regardless of status, for review purposes.
  const paidOrders = orders.filter(o => o.status === 'accepted' && !o.cancelled);

  const totalSales = paidOrders.reduce((s, o) => s + o.price, 0);
  const totalFeeCustomer = paidOrders.reduce((s, o) => s + o.feeFromCustomer, 0);
  const totalFeeMerchant = paidOrders.reduce((s, o) => s + o.feeFromMerchant, 0);
  const totalItemDeduction = paidOrders.reduce((s, o) => s + (o.itemDeduction || 0), 0);
  const totalCouponDiscount = paidOrders.reduce((s, o) => s + (o.couponDiscount || 0), 0);
  const totalShipping = paidOrders.reduce((s, o) => s + (o.shippingFee || 0), 0);
  // Coupons are a merchant-funded promotion, not a platform expense, so they don't touch
  // the platform's own profit line — only the merchant's net payout below.
  const totalPlatformProfit = totalFeeCustomer + totalFeeMerchant + totalItemDeduction;

  document.getElementById('acc-summary').innerHTML = `
    <div class="stat"><div class="stat-num">${orders.length}</div><div class="stat-label">عدد العمليات</div></div>
    <div class="stat"><div class="stat-num">${totalSales.toLocaleString()}</div><div class="stat-label">إجمالي المبيعات (د)</div></div>
    <div class="stat"><div class="stat-num">${totalPlatformProfit.toLocaleString()}</div><div class="stat-label">أرباح المنصة (د)</div></div>
  `;
  document.getElementById('acc-summary2').innerHTML = `
    <div class="stat"><div class="stat-num">${totalFeeCustomer.toLocaleString()}</div><div class="stat-label">محصّل من الزبائن (د)</div></div>
    <div class="stat"><div class="stat-num">${totalFeeMerchant.toLocaleString()}</div><div class="stat-label">محصّل من التجار (د)</div></div>
    <div class="stat"><div class="stat-num">${totalItemDeduction.toLocaleString()}</div><div class="stat-label">استقطاع ثابت للقطع (د)</div></div>
    <div class="stat"><div class="stat-num">${totalCouponDiscount.toLocaleString()}</div><div class="stat-label">خصومات الكوبونات (د)</div></div>
    <div class="stat"><div class="stat-num">${totalShipping.toLocaleString()}</div><div class="stat-label">إجمالي الشحن (د)</div></div>
  `;

  const byMerchant = accountingMerchantBreakdown(orders);
  const merchantSummaryEl = document.getElementById('acc-merchant-summary');
  const merchantIds = Object.keys(byMerchant);
  if (merchantIds.length === 0) {
    merchantSummaryEl.innerHTML = '<div class="empty">ما فيه بيانات</div>';
  } else {
    merchantSummaryEl.innerHTML = merchantIds.map(id => {
      const m = data.merchants.find(x => String(x.id) === id);
      const b = byMerchant[id];
      return `<div class="list-item" style="align-items:flex-start;">
        <span>${m ? m.shop : 'تاجر محذوف'} — ${b.count} عملية (${b.accepted} مقبولة)<br>
        <span style="color:var(--text-mute); font-size:11px;">قطع مباعة: ${b.accepted} — ملغاة: ${b.cancelledCount} — عليها عمولة: ${b.withCommissionCount} — بدون عمولة: ${b.withoutCommissionCount}</span><br>
        <span style="color:var(--text-mute); font-size:11px;">مبيعات: ${b.sales.toLocaleString()} د — رسوم منصة: ${(b.feeCustomer + b.feeMerchant).toLocaleString()} د${b.itemDeduction ? ' — استقطاع قطع: ' + b.itemDeduction.toLocaleString() + ' د' : ''}${b.couponDiscount ? ' — خصومات كوبونات: ' + b.couponDiscount.toLocaleString() + ' د' : ''} — شحن: ${b.shipping.toLocaleString()} د</span></span>
        <span style="text-align:left; white-space:nowrap;">صافي مستحقاته: ${b.netPayout.toLocaleString()} د</span>
      </div>`;
    }).join('');
  }

  const ordersEl = document.getElementById('acc-orders-table');
  pruneAccountingSelection();
  if (orders.length === 0) {
    ordersEl.innerHTML = '<div class="empty">ما فيه عمليات مطابقة للفلاتر</div>';
  } else {
    ordersEl.innerHTML = orders.map(o => {
      const m = data.merchants.find(x => x.id === o.merchantId);
      const dateStr = orderDateTimeLabel(o.date);
      const checked = selectedAccountingOrderIds.has(o.id) ? 'checked' : '';
      return `<div class="list-item" style="align-items:flex-start;">
        <input type="checkbox" style="width:auto; margin-top:3px;" ${checked} onchange="toggleAccountingOrderSelection(${o.id}, this.checked)">
        <span>${m ? m.shop : '—'} — ${o.productName} ${o.cancelled ? '<span class="badge rejected">ملغي</span>' : `<span class="badge ${o.status}">${orderStatusLabel(o.status)}</span>`}<br>
        <span style="color:var(--text-mute); font-size:11px;">${dateStr}</span><br>
        <span style="color:var(--text-mute); font-size:11px;">السعر: ${o.price.toLocaleString()} د — رسم زبون: ${o.feeFromCustomer.toLocaleString()} د — رسم تاجر: ${o.feeFromMerchant.toLocaleString()} د${o.itemDeduction ? ' — استقطاع قطعة: ' + o.itemDeduction.toLocaleString() + ' د' : ''}${o.couponDiscount ? ' — خصم كوبون ' + esc(o.couponCode || '') + ': ' + o.couponDiscount.toLocaleString() + ' د' : ''} — شحن: ${(o.shippingFee || 0).toLocaleString()} د — ${o.governorate || ''}</span></span>
      </div>`;
    }).join('');
  }
  updateAccountingSelectionUI(orders);
}

// ---------- ACCOUNTING: SELECT-AND-DELETE ORDERS ----------
// Lets the admin tick specific orders in the "تفاصيل العمليات" table (or use
// "تحديد الكل" to grab everything matching the current filters) and permanently
// remove them from the record. Selection persists across the 5-second auto-refresh
// and filter changes, and is only pruned if an order it points to no longer exists.
let selectedAccountingOrderIds = new Set();

function pruneAccountingSelection() {
  const validIds = new Set(data.orders.map(o => o.id));
  selectedAccountingOrderIds.forEach(id => { if (!validIds.has(id)) selectedAccountingOrderIds.delete(id); });
}

function toggleAccountingOrderSelection(id, checked) {
  if (checked) selectedAccountingOrderIds.add(id); else selectedAccountingOrderIds.delete(id);
  updateAccountingSelectionUI(filteredAccountingOrders());
}

function toggleSelectAllAccountingOrders(checked) {
  const orders = filteredAccountingOrders();
  if (checked) orders.forEach(o => selectedAccountingOrderIds.add(o.id));
  else orders.forEach(o => selectedAccountingOrderIds.delete(o.id));
  renderAccounting();
}

function updateAccountingSelectionUI(orders) {
  const countEl = document.getElementById('acc-selected-count');
  const btn = document.getElementById('acc-delete-selected-btn');
  const selectAllBox = document.getElementById('acc-select-all');
  if (!countEl || !btn) return;
  const selectedInView = orders.filter(o => selectedAccountingOrderIds.has(o.id)).length;
  countEl.textContent = selectedAccountingOrderIds.size;
  btn.disabled = selectedAccountingOrderIds.size === 0;
  if (selectAllBox) selectAllBox.checked = orders.length > 0 && selectedInView === orders.length;
}

function deleteSelectedAccountingOrders() {
  const count = selectedAccountingOrderIds.size;
  if (count === 0) return;
  openConfirmModal('حذف العمليات المحددة', `متأكد من حذف ${count} عملية نهائياً من السجل؟ هذا الإجراء لا يمكن التراجع عنه.`, async () => {
    const removedOrders = data.orders.filter(o => selectedAccountingOrderIds.has(o.id));
    data.orders = data.orders.filter(o => !selectedAccountingOrderIds.has(o.id));
    selectedAccountingOrderIds.clear();
    await saveData();
    // saveData() only re-uploads orders that are still in data.orders — it never deletes
    // remote docs for orders removed from the array. Without this, the "deleted" orders
    // stay in Firestore and come right back on the next 5-second live-refresh tick.
    let failCount = 0;
    if (window.authApi && removedOrders.length > 0) {
      const results = await Promise.allSettled(removedOrders.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('order delete failed for', failCount, 'of', removedOrders.length, 'orders', results);
    }
    if (failCount > 0) {
      showToast(`تعذر حذف ${failCount} من ${removedOrders.length} عملية من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else {
      showToast('تم حذف العمليات المحددة');
    }
    renderAll();
  });
}

// ---------- ACCOUNTING: RESET RECORD UP TO A DATE ----------
// Permanently deletes every order dated on or before the chosen date, so the
// accounting page stops accumulating old totals and starts fresh from the next day.
// Merchant balances are untouched — use "تصفير أرصدة التجار" separately for those.
function resetAccountingUntilDate() {
  const dateInput = document.getElementById('reset-until-date');
  const dateVal = dateInput.value;
  if (!dateVal) { showToast('اختر تاريخ أولاً'); return; }
  const cutoff = new Date(dateVal + 'T23:59:59');
  const toDelete = data.orders.filter(o => new Date(o.date) <= cutoff);
  if (toDelete.length === 0) { showToast('ما فيه عمليات بهذا التاريخ أو قبله'); return; }
  const dateLabel = new Date(dateVal + 'T00:00:00').toLocaleDateString('ar-IQ');
  openConfirmModal('تصفير سجل المحاسبة', `متأكد راح تحذف ${toDelete.length} عملية نهائياً (كل العمليات لغاية ${dateLabel})؟ هذا الإجراء لا يمكن التراجع عنه — يُفضّل تصدّر تقرير Excel قبل المتابعة.`, async () => {
    data.orders = data.orders.filter(o => new Date(o.date) > cutoff);
    await saveData();
    // Same reason as deleteSelectedAccountingOrders() above: without an explicit remote
    // delete, these orders would still exist in Firestore and reappear on the next refresh.
    let failCount = 0;
    if (window.authApi && toDelete.length > 0) {
      const results = await Promise.allSettled(toDelete.map(o =>
        window.authApi.deleteDoc('orders', String(o.id)).then(() => { lastSyncedOrderSnapshots.delete(o.id); })
      ));
      failCount = results.filter(r => r.status === 'rejected').length;
      if (failCount > 0) console.error('order delete failed for', failCount, 'of', toDelete.length, 'orders', results);
    }
    dateInput.value = '';
    if (failCount > 0) {
      showToast(`تعذر حذف ${failCount} من ${toDelete.length} عملية من قاعدة البيانات (صلاحيات؟) — راح ترجع تظهر عند أول تحديث`);
    } else {
      showToast('تم تصفير سجل المحاسبة لغاية ' + dateLabel);
    }
    renderAll();
  });
}

// Builds and downloads a multi-sheet Excel workbook of the currently filtered accounting data
// Excel sheet names can't exceed 31 chars, can't contain \ / ? * [ ] : , and must be
// unique within the workbook — this sanitizes a merchant's shop name into a safe, unique
// sheet name (falling back to appending the merchant id on collision).
function safeExcelSheetName(rawName, usedNames) {
  let name = String(rawName || 'تاجر').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'تاجر';
  let candidate = name;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const tail = ` (${suffix})`;
    candidate = name.slice(0, 31 - tail.length) + tail;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

function exportAccountingExcel() {
  if (typeof XLSX === 'undefined') { showToast('تعذر تحميل مكتبة تصدير الإكسل — تأكد من اتصالك بالإنترنت'); return; }
  const orders = filteredAccountingOrders();
  if (orders.length === 0) { showToast('ما فيه عمليات مطابقة للفلاتر الحالية لتصديرها'); return; }

  const ordersRows = orders.map(o => {
    const m = data.merchants.find(x => x.id === o.merchantId);
    const isAccepted = o.status === 'accepted' && !o.cancelled;
    const hasCommission = isAccepted && ((o.feeFromCustomer || 0) > 0 || (o.feeFromMerchant || 0) > 0);
    return {
      'اليوم': new Date(o.date).toLocaleDateString('ar-IQ', { weekday: 'long' }),
      'التاريخ': new Date(o.date).toLocaleDateString('ar-IQ'),
      'الوقت': new Date(o.date).toLocaleTimeString('ar-IQ'),
      'التاجر': m ? m.shop : 'تاجر محذوف',
      'المنتج': o.productName,
      'المقاس': o.size || '',
      'اللون': o.color || '',
      'سعر القطعة (د)': o.price,
      'عليها عمولة؟': isAccepted ? (hasCommission ? 'نعم' : 'لا (معفاة)') : '—',
      'رسم من الزبون (د)': o.feeFromCustomer,
      'رسم من التاجر (د)': o.feeFromMerchant,
      'استقطاع ثابت للقطعة (د)': o.itemDeduction || 0,
      'رسوم المنصة الإجمالية (د)': o.feeFromCustomer + o.feeFromMerchant + (o.itemDeduction || 0),
      'كود الكوبون': o.couponCode || '',
      'خصم الكوبون (د)': o.couponDiscount || 0,
      'أجرة الشحن (د)': o.shippingFee || 0,
      'صافي مستحق التاجر (د)': o.status === 'accepted' && !o.cancelled ? (o.price - o.feeFromMerchant - (o.itemDeduction || 0) - (o.couponDiscount || 0)) : 0,
      'المحافظة': o.governorate || '',
      'نوع الشحن': o.shippingSpeed === 'fast' ? 'سريع' : (o.shippingSpeed === 'slow' ? 'بطيء' : ''),
      'الحالة النهائية': orderFullStatusLabel(o),
      'مين ألغى': o.cancelled ? cancelByLabel(o.cancelBy) : '',
      'سبب الإلغاء': o.cancelReason || '',
      'اسم الزبون': o.customerName || '',
      'هاتف الزبون': o.customerPhone || '',
      'عنوان الزبون': o.customerAddress || ''
    };
  });

  const byMerchant = accountingMerchantBreakdown(orders);
  const merchantRows = Object.keys(byMerchant).map(id => {
    const m = data.merchants.find(x => String(x.id) === id);
    const b = byMerchant[id];
    return {
      'التاجر': m ? m.shop : 'تاجر محذوف',
      'عدد العمليات': b.count,
      'عمليات مقبولة (مباعة)': b.accepted,
      'قطع ملغاة': b.cancelledCount,
      'قطع عليها عمولة': b.withCommissionCount,
      'قطع بدون عمولة (معفاة)': b.withoutCommissionCount,
      'إجمالي المبيعات (د)': b.sales,
      'رسوم من الزبائن (د)': b.feeCustomer,
      'رسوم من التاجر (د)': b.feeMerchant,
      'استقطاع ثابت للقطع (د)': b.itemDeduction,
      'خصومات الكوبونات (د)': b.couponDiscount,
      'إجمالي الشحن (د)': b.shipping,
      'إجمالي المستقطع للمنصة (د)': b.feeCustomer + b.feeMerchant + b.itemDeduction,
      'صافي المستحق للتاجر (د)': b.netPayout
    };
  });

  // Same rule as the on-screen summary: only accepted & non-cancelled orders were ever
  // actually paid, so only those count toward the financial totals here.
  const paidOrders = orders.filter(o => o.status === 'accepted' && !o.cancelled);
  const totalSales = paidOrders.reduce((s, o) => s + o.price, 0);
  const totalFeeCustomer = paidOrders.reduce((s, o) => s + o.feeFromCustomer, 0);
  const totalFeeMerchant = paidOrders.reduce((s, o) => s + o.feeFromMerchant, 0);
  const totalItemDeduction = paidOrders.reduce((s, o) => s + (o.itemDeduction || 0), 0);
  const totalCouponDiscount = paidOrders.reduce((s, o) => s + (o.couponDiscount || 0), 0);
  const totalShipping = paidOrders.reduce((s, o) => s + (o.shippingFee || 0), 0);
  const f = getAccountingFilters();
  const summaryRows = [
    { 'البند': 'الفترة', 'القيمة': (f.from || '—') + ' إلى ' + (f.to || '—') },
    { 'البند': 'عدد العمليات', 'القيمة': orders.length },
    { 'البند': 'إجمالي المبيعات (د)', 'القيمة': totalSales },
    { 'البند': 'رسوم محصّلة من الزبائن (د)', 'القيمة': totalFeeCustomer },
    { 'البند': 'رسوم محصّلة من التجار (د)', 'القيمة': totalFeeMerchant },
    { 'البند': 'استقطاع ثابت للقطع (د)', 'القيمة': totalItemDeduction },
    { 'البند': 'إجمالي خصومات الكوبونات (د)', 'القيمة': totalCouponDiscount },
    { 'البند': 'إجمالي أرباح المنصة (د)', 'القيمة': totalFeeCustomer + totalFeeMerchant + totalItemDeduction },
    { 'البند': 'إجمالي أجور الشحن (د)', 'القيمة': totalShipping }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'الملخص العام');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(merchantRows), 'ملخص التجار');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersRows), 'تفاصيل الطلبات');

  // ورقة مستقلة لكل تاجر — نفس أعمدة "تفاصيل الطلبات" لكن مفلترة لهذا التاجر بس، مع
  // سطر إجمالي بالأسفل يوضح شكد المستقطع للمنصة وشكد المستحق له (نفس الفكرة الموجودة
  // بتصدير التاجر لحساباته هو، لكن من منظور الأدمن ولكل التجار دفعة وحدة).
  const usedSheetNames = new Set(['الملخص العام', 'ملخص التجار', 'تفاصيل الطلبات']);
  Object.keys(byMerchant).forEach(id => {
    const m = data.merchants.find(x => String(x.id) === id);
    const merchantOrders = orders.filter(o => String(o.merchantId) === id);
    const merchantOrdersRows = merchantOrders.map(o => {
      const isAccepted = o.status === 'accepted' && !o.cancelled;
      const platformTotal = o.feeFromCustomer + o.feeFromMerchant + (o.itemDeduction || 0);
      const netDue = isAccepted ? (o.price - o.feeFromMerchant - (o.itemDeduction || 0) - (o.couponDiscount || 0)) : 0;
      const hasCommission = isAccepted && ((o.feeFromCustomer || 0) > 0 || (o.feeFromMerchant || 0) > 0);
      return {
        'التاريخ': new Date(o.date).toLocaleDateString('ar-IQ'),
        'الوقت': new Date(o.date).toLocaleTimeString('ar-IQ'),
        'المنتج': o.productName,
        'المقاس': o.size || '',
        'اللون': o.color || '',
        'سعر القطعة (د)': o.price,
        'عليها عمولة؟': isAccepted ? (hasCommission ? 'نعم' : 'لا (معفاة)') : '—',
        'المستقطع للمنصة (د)': platformTotal,
        'المستحق للتاجر (د)': netDue,
        'أجرة الشحن (د)': o.shippingFee || 0,
        'الحالة النهائية': orderFullStatusLabel(o),
        'اسم الزبون': o.customerName || '',
        'هاتف الزبون': o.customerPhone || ''
      };
    });
    const b = byMerchant[id];
    merchantOrdersRows.push({
      'التاريخ': '', 'الوقت': '', 'المنتج': 'الإجمالي', 'المقاس': '', 'اللون': '', 'سعر القطعة (د)': b.sales,
      'عليها عمولة؟': `مباعة: ${b.accepted} — ملغاة: ${b.cancelledCount} — بعمولة: ${b.withCommissionCount} — بدونها: ${b.withoutCommissionCount}`,
      'المستقطع للمنصة (د)': b.feeCustomer + b.feeMerchant + b.itemDeduction,
      'المستحق للتاجر (د)': b.netPayout,
      'أجرة الشحن (د)': b.shipping, 'الحالة النهائية': '', 'اسم الزبون': '', 'هاتف الزبون': ''
    });
    const sheetName = safeExcelSheetName(m ? m.shop : `تاجر-${id}`, usedSheetNames);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(merchantOrdersRows), sheetName);
  });

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `tajerly-accounting-${stamp}.xlsx`);
  showToast('تم تحميل تقرير الإكسل ');
}



// ---------- DELIVERY AGENT ACCOUNTS ("حسابات المندوبين") — admin-only screen ----------
// Same daily-page idea as the merchant ledger above (reuses ledgerDayKey/ledgerDayLabel/
// ledgerPageLabel as-is — a calendar day is a calendar day either way), but grouped by
// delivery agent instead of merchant, and with a THIRD number the merchant ledger doesn't
// need: the platform's own commission taken FROM the agent on every delivered order, which
// then reduces what's still owed to the merchant (see orderAgentDueSplit below).
//
// Money only ever flows through here for orders that actually reached this agent
// (o.deliveryAgentId === agent.id) and finished one way or another (delivered/returned) —
// still-in-transit orders (with_shipping/received_by_shipping) don't count toward any total
// yet, same principle as the merchant ledger only counting 'accepted' orders.
function orderAgentDueSplit(o) {
  if (o.deliveryStatus !== 'delivered') return { shippingDue: 0, merchantDue: 0, platformCommission: 0, merchantNetDue: 0 };
  const shippingDue = o.agentFeeSnapshot || 0;
  const merchantDue = o.price || 0;
  const platformCommission = o.agentCommissionTypeSnapshot === 'percentage'
    ? Math.round(merchantDue * (o.agentCommissionValueSnapshot || 0) / 100)
    : (o.agentCommissionValueSnapshot || 0);
  return { shippingDue, merchantDue, platformCommission, merchantNetDue: merchantDue - platformCommission };
}

// true when an agent's (agentId, day) page was closed/reset by the admin. Unlike the
// merchant ledger's three-way scope ('both'/'admin'/'merchant'), an agent never has their own
// login view of this screen at all, so there's nothing to keep separately visible for them —
// closing a day here always just means "hide it from the admin's agent-accounts screen from
// now on". The underlying orders are NEVER deleted or altered — a merchant's own accounting
// (renderMerchantAccounting) and the admin's general accounting screen keep counting them
// exactly as before. scope 'reset' is used by resetAgentAccount() below to hide every day at
// once (a full "تصفير الحسابات") without a separate data shape.
function isAgentLedgerDayHiddenFor(agentId, dateKey) {
  return (data.agentLedgerClosures || []).some(c => c.agentId === agentId && (c.dateKey === dateKey || c.scope === 'reset'));
}

function buildAgentLedgerDays(agentId) {
  const orders = data.orders.filter(o => o.deliveryAgentId === agentId && (o.deliveryStatus === 'delivered' || o.deliveryStatus === 'returned'));
  const byDay = new Map();
  orders.forEach(o => {
    const dateKey = ledgerDayKey(o.date);
    if (isAgentLedgerDayHiddenFor(agentId, dateKey)) return;
    if (!byDay.has(dateKey)) byDay.set(dateKey, { dateKey, delivered: [], returned: [], byMerchant: {}, adjustments: [] });
    const bucket = byDay.get(dateKey);
    if (o.deliveryStatus === 'returned') { bucket.returned.push(o); return; }
    bucket.delivered.push(o);
    if (!bucket.byMerchant[o.merchantId]) bucket.byMerchant[o.merchantId] = { merchantId: o.merchantId, count: 0, merchantDue: 0, platformCommission: 0, merchantNetDue: 0 };
    const mb = bucket.byMerchant[o.merchantId];
    const split = orderAgentDueSplit(o);
    mb.count += 1;
    mb.merchantDue += split.merchantDue;
    mb.platformCommission += split.platformCommission;
    mb.merchantNetDue += split.merchantNetDue;
  });
  // Fold in manual adjustments even for a day with zero real orders (e.g. a pure correction
  // entry) — so it still shows up as its own page instead of being silently unreachable.
  (data.agentAdjustments || []).filter(adj => adj.agentId === agentId && !isAgentLedgerDayHiddenFor(agentId, adj.dateKey)).forEach(adj => {
    if (!byDay.has(adj.dateKey)) byDay.set(adj.dateKey, { dateKey: adj.dateKey, delivered: [], returned: [], byMerchant: {}, adjustments: [] });
    byDay.get(adj.dateKey).adjustments.push(adj);
  });
  const days = Array.from(byDay.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  days.forEach(day => {
    day.deliveredCount = day.delivered.length;
    day.returnedCount = day.returned.length;
    day.totalShipping = day.delivered.reduce((s, o) => s + orderAgentDueSplit(o).shippingDue, 0);
    day.totalMerchantDue = day.delivered.reduce((s, o) => s + orderAgentDueSplit(o).merchantDue, 0);
    day.totalAdjustments = day.adjustments.reduce((s, adj) => s + adj.amount, 0);
    day.totalPlatformCommission = day.delivered.reduce((s, o) => s + orderAgentDueSplit(o).platformCommission, 0) + day.totalAdjustments;
    day.totalMerchantNetDue = day.totalMerchantDue - day.totalPlatformCommission;
  });
  return days;
}

// ---- Manual per-day adjustment (+/-) with a mandatory reason. Folds straight into
// totalPlatformCommission above (a positive adjustment = agent owes the platform more that
// day, a negative one = a discount) — never touches the underlying orders.
let adjustmentTargetAgentId = null, adjustmentTargetDateKey = null;
function openAgentAdjustmentModal(agentId, dateKey) {
  adjustmentTargetAgentId = agentId;
  adjustmentTargetDateKey = dateKey;
  document.getElementById('agent-adjustment-day-label').textContent = ledgerPageLabel(dateKey);
  document.getElementById('agent-adjustment-amount').value = '';
  document.getElementById('agent-adjustment-reason').value = '';
  document.getElementById('agent-adjustment-modal').classList.add('show');
}
function closeAgentAdjustmentModal() {
  adjustmentTargetAgentId = null; adjustmentTargetDateKey = null;
  document.getElementById('agent-adjustment-modal').classList.remove('show');
}
async function submitAgentAdjustment() {
  if (adjustmentTargetAgentId == null) return;
  const amount = parseInt(document.getElementById('agent-adjustment-amount').value, 10);
  const reason = document.getElementById('agent-adjustment-reason').value.trim();
  if (isNaN(amount) || amount === 0) { showToast('عبي مبلغ التعديل (موجب للزيادة، سالب للخصم)'); return; }
  if (!reason) { showToast('لازم تكتب سبب التعديل'); return; }
  data.agentAdjustments.push({
    id: Date.now() + '-' + adjustmentTargetAgentId + '-' + Math.random().toString(36).slice(2, 6),
    agentId: adjustmentTargetAgentId, dateKey: adjustmentTargetDateKey, amount, reason,
    at: new Date().toISOString(), by: currentActorLabel()
  });
  await saveData();
  const a = data.employees.find(x => x.id === adjustmentTargetAgentId);
  await logAudit('تعديل يدوي بحساب مندوب', `${a ? a.name : adjustmentTargetAgentId} — ${adjustmentTargetDateKey} — ${amount > 0 ? '+' : ''}${amount.toLocaleString()} د — ${reason}`);
  showToast('تم تسجيل التعديل');
  closeAgentAdjustmentModal();
  renderAll();
}
function deleteAgentAdjustment(id) {
  openConfirmModal('حذف تعديل يدوي', 'متأكد تريد تحذف هذا التعديل؟ هذا الإجراء يخص الأدمن بس.', async () => {
    data.agentAdjustments = (data.agentAdjustments || []).filter(adj => adj.id !== id);
    await saveData();
    showToast('تم حذف التعديل');
    renderAll();
  });
}

// ---- Admin-only: delete one day's page, or reset the whole agent account ----
let closeAgentLedgerTarget = null; // { agentId, dateKey } | { agentId, reset: true }
function openCloseAgentLedgerDayModal(agentId, dateKey) {
  closeAgentLedgerTarget = { agentId, dateKey };
  const a = data.employees.find(x => x.id === agentId);
  const day = buildAgentLedgerDays(agentId).find(d => d.dateKey === dateKey);
  const settled = isAgentDaySettled(agentId, dateKey);
  let text = `راح تحذف ${ledgerPageLabel(dateKey)} من حسابات المندوب "${esc(a ? a.name : '')}". الطلبات نفسها ما تنحذف — تبقى موجودة بمحاسبة التاجر والمحاسبة العامة، بس هذي الصفحة تختفي من هذا التقرير. بس الأدمن يقدر يسوي هذا الإجراء.`;
  if (!settled && day && (day.totalPlatformCommission > 0 || day.totalMerchantNetDue > 0)) {
    text += `<br><br><b style="color:#B3261E;">⚠️ تنبيه:</b> هذا اليوم لسا "غير مسدَّد" — فيه ${day.totalPlatformCommission.toLocaleString()} د مستحقة للمنصة و${day.totalMerchantNetDue.toLocaleString()} د صافي مستحق للتجار. حذف الصفحة قبل التسديد يخليك تنسى هذا المبلغ. الأفضل تسجل "تم التسديد" أول.`;
  }
  document.getElementById('close-agent-ledger-text').innerHTML = text;
  document.getElementById('close-agent-ledger-modal').classList.add('show');
}
function closeAgentLedgerModalHide() {
  document.getElementById('close-agent-ledger-modal').classList.remove('show');
  closeAgentLedgerTarget = null;
}
async function confirmCloseAgentLedgerDay() {
  if (!closeAgentLedgerTarget) return;
  const { agentId, dateKey } = closeAgentLedgerTarget;
  const a = data.employees.find(x => x.id === agentId);
  data.agentLedgerClosures.push({
    id: Date.now() + '-' + agentId + '-' + Math.random().toString(36).slice(2, 6),
    dateKey, agentId, scope: 'day',
    closedAt: new Date().toISOString(),
    closedBy: currentActorLabel()
  });
  await saveData();
  await logAudit('حذف صفحة يومية من حسابات مندوب', `${a ? a.name : agentId} — ${dateKey}`);
  closeAgentLedgerModalHide();
  showToast('تم حذف صفحة هذا اليوم من حسابات المندوب');
  renderAll();
}

function resetAgentAccount(agentId) {
  const a = data.employees.find(x => x.id === agentId);
  if (!a) return;
  openConfirmModal(
    'تصفير حسابات المندوب',
    `راح يختفي كل سجل الحسابات السابق للمندوب "${a.name}" من هذا التقرير (الطلبات نفسها ما تنحذف، تبقى بمحاسبة التاجر والمحاسبة العامة). بس الأدمن يقدر يسوي هذا الإجراء، وما ينرجع.`,
    async () => {
      data.agentLedgerClosures.push({
        id: Date.now() + '-' + agentId + '-reset-' + Math.random().toString(36).slice(2, 6),
        dateKey: ledgerDayKey(new Date()), agentId, scope: 'reset',
        closedAt: new Date().toISOString(),
        closedBy: currentActorLabel()
      });
      await saveData();
      await logAudit('تصفير حسابات مندوب توصيل', a.name);
      showToast('تم تصفير حسابات المندوب');
      renderAll();
    }
  );
}

// ---- Admin screen: pick an agent, see their daily pages ----
let selectedAgentAccountId = null;
function renderAgentAccountsFilter() {
  const sel = document.getElementById('agent-accounts-select');
  if (!sel) return;
  const agents = data.employees.filter(e => e.ownerType === 'delivery_agent');
  sel.innerHTML = agents.map(a => `<option value="${a.id}">${esc(a.name)}${a.companyName ? ' — ' + esc(a.companyName) : ''}</option>`).join('');
  if (selectedAgentAccountId == null && agents.length > 0) selectedAgentAccountId = agents[0].id;
  if (sel.value != selectedAgentAccountId && selectedAgentAccountId != null) sel.value = selectedAgentAccountId;
}
function onAgentAccountsSelectChange() {
  const sel = document.getElementById('agent-accounts-select');
  selectedAgentAccountId = sel ? parseInt(sel.value, 10) : null;
  renderAgentAccounts();
}
function renderAgentAccounts() {
  const el = document.getElementById('agent-accounts-days');
  if (!el) return;
  renderAgentAccountsFilter();
  const agents = data.employees.filter(e => e.ownerType === 'delivery_agent');
  if (agents.length === 0) { el.innerHTML = '<div class="empty">ما فيه مندوبين توصيل بعد</div>'; return; }
  const agentId = selectedAgentAccountId != null ? selectedAgentAccountId : agents[0].id;
  const agent = data.employees.find(x => x.id === agentId);
  if (!agent) { el.innerHTML = '<div class="empty">اختر مندوب</div>'; return; }

  const days = buildAgentLedgerDays(agentId);
  const summaryEl = document.getElementById('agent-accounts-summary');
  if (summaryEl) {
    const totalDelivered = days.reduce((s, d) => s + d.deliveredCount, 0);
    const totalReturned = days.reduce((s, d) => s + d.returnedCount, 0);
    const totalShipping = days.reduce((s, d) => s + d.totalShipping, 0);
    const totalMerchantDue = days.reduce((s, d) => s + d.totalMerchantDue, 0);
    const totalCommission = days.reduce((s, d) => s + d.totalPlatformCommission, 0);
    const totalNetDue = days.reduce((s, d) => s + d.totalMerchantNetDue, 0);
    const pendingCount = agentPendingCustodyOrders(agentId).length;
    const unsettled = agentUnsettledCommissionTotal(agentId);
    summaryEl.innerHTML = `
      <div class="stat"><div class="stat-num">${pendingCount}</div><div class="stat-label">طلبات بعهدته حالياً</div></div>
      <div class="stat"><div class="stat-num">${totalDelivered}</div><div class="stat-label">طلبات موصلة</div></div>
      <div class="stat"><div class="stat-num">${totalReturned}</div><div class="stat-label">طلبات راجعة</div></div>
      <div class="stat"><div class="stat-num">${totalShipping.toLocaleString()}</div><div class="stat-label">مجموع أجور الشحن (د)</div></div>
      <div class="stat"><div class="stat-num">${totalMerchantDue.toLocaleString()}</div><div class="stat-label">مجموع مبالغ التجار (د)</div></div>
      <div class="stat"><div class="stat-num">${totalCommission.toLocaleString()}</div><div class="stat-label">مستحقات المنصة من المندوب (د)</div></div>
      <div class="stat"><div class="stat-num">${totalNetDue.toLocaleString()}</div><div class="stat-label">صافي مستحقات التجار (د)</div></div>
      <div class="stat"><div class="stat-num" style="color:${unsettled > 0 ? '#B3261E' : 'inherit'};">${unsettled.toLocaleString()}</div><div class="stat-label">غير مسدَّد بعد (د)</div></div>
    `;
  }
  const actionsEl = document.getElementById('agent-accounts-actions');
  if (actionsEl) {
    actionsEl.innerHTML = `
      <button class="btn secondary small" onclick="copyAgentStatement(${agentId})">نسخ كشف الحساب</button>
      <button class="btn secondary small" onclick="openAgentCashLogModal(${agentId})">+ تسجيل استلام نقدي</button>
      <button class="btn danger small" onclick="resetAgentAccount(${agentId})">تصفير حسابات هذا المندوب</button>
    `;
  }
  const cashLogEl = document.getElementById('agent-cash-log-list');
  if (cashLogEl) cashLogEl.innerHTML = renderAgentCashLogs(agentId);

  if (days.length === 0) { el.innerHTML = '<div class="empty">ما فيه عمليات مسجلة لهذا المندوب</div>'; return; }

  el.innerHTML = days.map(day => {
    const settled = isAgentDaySettled(agentId, day.dateKey);
    const merchantRows = Object.values(day.byMerchant).map(mb => {
      const m = data.merchants.find(x => x.id === mb.merchantId);
      return `<div style="font-size:11.5px; color:var(--ink-2); padding:4px 0; border-top:1px dashed #EEE;">
        ${esc(m ? m.shop : 'تاجر محذوف')} — عدد الطلبات: ${mb.count} — مستحق التاجر: ${mb.merchantDue.toLocaleString()} د —
        عمولة المنصة: ${mb.platformCommission.toLocaleString()} د — صافي المستحق للتاجر: <b>${mb.merchantNetDue.toLocaleString()} د</b>
      </div>`;
    }).join('');
    const returnedRows = day.returned.map(o => {
      const m = data.merchants.find(x => x.id === o.merchantId);
      return `<div style="font-size:11.5px; color:#92400E; padding:4px 0; border-top:1px dashed #FDE68A;">
        ${esc(m ? m.shop : '—')} — ${esc(o.productName)} — سبب الإرجاع: ${esc(o.returnReason || '—')}
      </div>`;
    }).join('');
    const adjustmentRows = (day.adjustments || []).map(adj => `<div style="font-size:11.5px; color:${adj.amount >= 0 ? '#92400E' : '#065F46'}; padding:4px 0; border-top:1px dashed #E2E8F0; display:flex; justify-content:space-between; align-items:center; gap:6px;">
        <span>تعديل يدوي: <b>${adj.amount > 0 ? '+' : ''}${adj.amount.toLocaleString()} د</b> — ${esc(adj.reason)} <span style="color:var(--text-mute);">(${esc(adj.by)})</span></span>
        <button class="btn danger small" style="padding:2px 8px; font-size:10px;" onclick="deleteAgentAdjustment('${adj.id}')">حذف</button>
      </div>`).join('');
    return `<div class="card" style="margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <b style="font-size:13px;">${ledgerPageLabel(day.dateKey)}</b>
        <span class="badge ${settled ? 'active' : 'pending'}">${settled ? 'مسدَّد' : 'غير مسدَّد'}</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${settled
            ? `<button class="btn secondary small" style="padding:4px 10px; font-size:11px;" onclick="unmarkAgentDaySettled(${agentId}, '${day.dateKey}')">إلغاء التسديد</button>`
            : `<button class="btn small" style="padding:4px 10px; font-size:11px;" onclick="markAgentDaySettled(${agentId}, '${day.dateKey}')">تسجيل تسديد هذا اليوم</button>`}
          <button class="btn secondary small" style="padding:4px 10px; font-size:11px;" onclick="openAgentAdjustmentModal(${agentId}, '${day.dateKey}')">+ تعديل يدوي</button>
          <button class="btn danger small" style="padding:4px 10px; font-size:11px;" onclick="openCloseAgentLedgerDayModal(${agentId}, '${day.dateKey}')">حذف صفحة هذا اليوم</button>
        </div>
      </div>
      <div style="font-size:12px; color:var(--text-mute); margin-top:6px;">
        موصلة: ${day.deliveredCount} — راجعة: ${day.returnedCount} — أجور شحن: ${day.totalShipping.toLocaleString()} د —
        مستحق المنصة: ${day.totalPlatformCommission.toLocaleString()} د${day.totalAdjustments ? ` (منها ${day.totalAdjustments > 0 ? '+' : ''}${day.totalAdjustments.toLocaleString()} د تعديل يدوي)` : ''} —
        صافي مستحق التجار: <b>${day.totalMerchantNetDue.toLocaleString()} د</b>
      </div>
      ${merchantRows ? `<div style="margin-top:6px;">${merchantRows}</div>` : ''}
      ${returnedRows ? `<div style="margin-top:6px;">${returnedRows}</div>` : ''}
      ${adjustmentRows ? `<div style="margin-top:6px;">${adjustmentRows}</div>` : ''}
    </div>`;
  }).join('');
}

// ==================== ADDITIONAL AGENT-ACCOUNTS TOOLS ====================
// Everything below builds on buildAgentLedgerDays()/orderAgentDueSplit() above. All of it is
// admin-only (agent_accounts is excluded from ADMIN_EMPLOYEE_PERMS — see 07-nav-auth.js).

// ---------- 1) SETTLEMENT — did the money for this day actually change hands? ----------
// A day can be visible in the report AND settled at once — settling never hides anything
// (that's what "حذف صفحة هذا اليوم" / closeAgentLedgerDay is for). This is purely a
// paid/unpaid flag layered on top.
function isAgentDaySettled(agentId, dateKey) {
  return (data.agentSettlements || []).some(s => s.agentId === agentId && s.dateKey === dateKey);
}
async function markAgentDaySettled(agentId, dateKey) {
  if (isAgentDaySettled(agentId, dateKey)) return;
  data.agentSettlements.push({
    id: Date.now() + '-' + agentId + '-' + Math.random().toString(36).slice(2, 6),
    agentId, dateKey, settledAt: new Date().toISOString(), settledBy: currentActorLabel()
  });
  await saveData();
  const a = data.employees.find(x => x.id === agentId);
  await logAudit('تسديد يوم من حساب مندوب', `${a ? a.name : agentId} — ${dateKey}`);
  showToast('تم تسجيل هذا اليوم كمسدَّد');
  renderAll();
}
async function unmarkAgentDaySettled(agentId, dateKey) {
  openConfirmModal('إلغاء التسديد', 'متأكد تريد ترجع هذا اليوم "غير مسدَّد"؟ هذا الإجراء يخص الأدمن بس.', async () => {
    data.agentSettlements = (data.agentSettlements || []).filter(s => !(s.agentId === agentId && s.dateKey === dateKey));
    await saveData();
    const a = data.employees.find(x => x.id === agentId);
    await logAudit('إلغاء تسديد يوم من حساب مندوب', `${a ? a.name : agentId} — ${dateKey}`);
    showToast('تم إلغاء التسديد لهذا اليوم');
    renderAll();
  });
}

// ---------- 2) PENDING CUSTODY — orders currently WITH this agent, not yet finalized ----------
// Not part of any daily page (they haven't been delivered or returned yet, so there's nothing
// to settle) — shown as a live running count in the summary instead.
function agentPendingCustodyOrders(agentId) {
  return data.orders.filter(o => o.deliveryAgentId === agentId && !o.cancelled &&
    (o.deliveryStatus === 'with_shipping' || o.deliveryStatus === 'received_by_shipping'));
}

// ---------- 3) MANUAL CASH-HANDOVER LOG ----------
let cashLogAgentId = null;
function openAgentCashLogModal(agentId) {
  cashLogAgentId = agentId;
  document.getElementById('agent-cash-amount').value = '';
  document.getElementById('agent-cash-note').value = '';
  document.getElementById('agent-cash-log-modal').classList.add('show');
}
function closeAgentCashLogModal() {
  cashLogAgentId = null;
  document.getElementById('agent-cash-log-modal').classList.remove('show');
}
async function submitAgentCashLog() {
  if (cashLogAgentId == null) return;
  const amount = parseInt(document.getElementById('agent-cash-amount').value, 10);
  const note = document.getElementById('agent-cash-note').value.trim();
  if (isNaN(amount) || amount <= 0) { showToast('عبي مبلغ صحيح'); return; }
  data.agentCashLogs.push({
    id: Date.now() + '-' + cashLogAgentId + '-' + Math.random().toString(36).slice(2, 6),
    agentId: cashLogAgentId, amount, note, at: new Date().toISOString(), by: currentActorLabel()
  });
  await saveData();
  const a = data.employees.find(x => x.id === cashLogAgentId);
  await logAudit('تسجيل استلام نقدي من مندوب', `${a ? a.name : cashLogAgentId} — ${amount.toLocaleString()} د`);
  showToast('تم تسجيل الاستلام');
  closeAgentCashLogModal();
  renderAll();
}
function deleteAgentCashLog(id) {
  openConfirmModal('حذف سجل استلام نقدي', 'متأكد تريد تحذف هذا السجل؟ هذا الإجراء يخص الأدمن بس.', async () => {
    data.agentCashLogs = (data.agentCashLogs || []).filter(l => l.id !== id);
    await saveData();
    showToast('تم حذف السجل');
    renderAll();
  });
}
function renderAgentCashLogs(agentId) {
  const logs = (data.agentCashLogs || []).filter(l => l.agentId === agentId).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  if (logs.length === 0) return '<div class="empty">ما فيه أي استلام نقدي مسجل يدوياً لهذا المندوب</div>';
  return logs.map(l => `<div class="list-item">
    <span>${new Date(l.at).toLocaleString('ar-IQ')} — <b>${l.amount.toLocaleString()} د</b>${l.note ? ' — ' + esc(l.note) : ''} <span style="color:var(--text-mute); font-size:11px;">(${esc(l.by)})</span></span>
    <button class="btn danger small" onclick="deleteAgentCashLog('${l.id}')">حذف</button>
  </div>`).join('');
}

// ---------- 4) SHAREABLE STATEMENT — copies a plain-text summary to the clipboard ----------
// Covers every VISIBLE unsettled day for this agent (settled or hidden days are left out —
// this is meant to be "here's what's still open", not a full historical dump).
function copyAgentStatement(agentId) {
  const a = data.employees.find(x => x.id === agentId);
  if (!a) return;
  const days = buildAgentLedgerDays(agentId).filter(d => !isAgentDaySettled(agentId, d.dateKey));
  const pending = agentPendingCustodyOrders(agentId).length;
  let text = `كشف حساب مندوب التوصيل: ${a.name}${a.companyName ? ' — ' + a.companyName : ''}\n`;
  text += `تاريخ الكشف: ${new Date().toLocaleDateString('ar-IQ')}\n`;
  text += `عدد الطلبات بعهدته حالياً (لسا ما وصلت/رجعت): ${pending}\n\n`;
  if (days.length === 0) {
    text += 'ما فيه أيام غير مسدَّدة حالياً.';
  } else {
    days.forEach(d => {
      text += `${ledgerPageLabel(d.dateKey)}:\n`;
      text += `  موصلة: ${d.deliveredCount} — راجعة: ${d.returnedCount}\n`;
      text += `  أجور شحن: ${d.totalShipping.toLocaleString()} د\n`;
      text += `  مستحق المنصة منه: ${d.totalPlatformCommission.toLocaleString()} د\n`;
      text += `  صافي مستحق التجار: ${d.totalMerchantNetDue.toLocaleString()} د\n\n`;
    });
    const totalCommission = days.reduce((s, d) => s + d.totalPlatformCommission, 0);
    const totalNet = days.reduce((s, d) => s + d.totalMerchantNetDue, 0);
    text += `-----\nالإجمالي غير المسدَّد — مستحق المنصة: ${totalCommission.toLocaleString()} د — صافي مستحق التجار: ${totalNet.toLocaleString()} د`;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('تم نسخ كشف الحساب — تكدر تلصقه بواتساب أو أي مكان'),
      () => showToast('تعذر النسخ التلقائي')
    );
  } else {
    showToast('تعذر النسخ التلقائي — متصفحك ما يدعمه');
  }
}

// ---------- 5) THRESHOLD ALERT — how much does an agent currently owe, unsettled ----------
// Used by 18-admin-alerts.js. Threshold itself lives in data.settings.agentDueAlertThreshold
// (0 = disabled), editable from the settings screen like any other platform setting.
function agentUnsettledCommissionTotal(agentId) {
  return buildAgentLedgerDays(agentId)
    .filter(d => !isAgentDaySettled(agentId, d.dateKey))
    .reduce((s, d) => s + d.totalPlatformCommission, 0);
}

// ---------- 6) ALL-TIME TOTALS (settled + unsettled) — used in the admin's delivery-agents
// management list so the admin sees, next to every agent, exactly how much platform
// commission that agent has generated in total from the merchants assigned to them, and how
// much of that is still unpaid. Unlike agentUnsettledCommissionTotal above, this counts every
// visible day regardless of settlement status. ----------
function agentAllTimeTotals(agentId) {
  const days = buildAgentLedgerDays(agentId);
  return {
    deliveredCount: days.reduce((s, d) => s + d.deliveredCount, 0),
    returnedCount: days.reduce((s, d) => s + d.returnedCount, 0),
    totalShipping: days.reduce((s, d) => s + d.totalShipping, 0),
    totalCommission: days.reduce((s, d) => s + d.totalPlatformCommission, 0),
    totalMerchantNetDue: days.reduce((s, d) => s + d.totalMerchantNetDue, 0),
    unsettled: agentUnsettledCommissionTotal(agentId)
  };
}

// ---------- 7) DETAILED PER-AGENT EXCEL EXPORT ----------
// Every number here is derived from orderAgentDueSplit()/buildAgentLedgerDays() — the exact
// same source of truth as the admin's "حسابات المندوبين" screen and the agent's own "حسابي مع
// التجار" tab — so the exported file always matches what's on screen, order by order, down to
// the dinar. Five sheets: an overall summary, one row per merchant, one row per delivered/
// returned order (full detail), one row per daily settlement page, and the manual adjustments/
// cash-log entries (if any) so nothing about this agent's account is left out of the file.
function exportAgentAccountingExcel(agentId) {
  if (typeof XLSX === 'undefined') { showToast('تعذر تحميل مكتبة تصدير الإكسل — تأكد من اتصالك بالإنترنت'); return; }
  const a = data.employees.find(x => x.id === agentId && x.ownerType === 'delivery_agent');
  if (!a) return;
  const days = buildAgentLedgerDays(agentId);
  if (days.length === 0) { showToast('ما فيه أي حسابات مسجلة لهذا المندوب لتصديرها'); return; }

  const totals = agentAllTimeTotals(agentId);
  const pendingCount = agentPendingCustodyOrders(agentId).length;
  const commissionLabel = a.commissionType === 'percentage' ? `${a.commissionValue}% من كل طلب` : `${a.commissionValue.toLocaleString()} د لكل طلب`;

  const summaryRows = [
    { 'البند': 'اسم المندوب', 'القيمة': a.name },
    { 'البند': 'الشركة/الجهة', 'القيمة': a.companyName || '—' },
    { 'البند': 'يوزر الدخول', 'القيمة': a.username || '—' },
    { 'البند': 'الحالة', 'القيمة': a.status === 'active' ? 'نشط' : 'موقوف مؤقتاً' },
    { 'البند': 'عدد التجار المسؤول عنهم حالياً', 'القيمة': a.merchantIds.length },
    { 'البند': 'أجرة التوصيل الأساسية له', 'القيمة': a.deliveryFee },
    { 'البند': 'نوع/قيمة عمولة المنصة منه', 'القيمة': commissionLabel },
    { 'البند': 'طلبات بعهدته حالياً (لم تُسلَّم/تُرجَع بعد)', 'القيمة': pendingCount },
    { 'البند': 'إجمالي الطلبات الموصلة (كل الوقت)', 'القيمة': totals.deliveredCount },
    { 'البند': 'إجمالي الطلبات الراجعة (كل الوقت)', 'القيمة': totals.returnedCount },
    { 'البند': 'إجمالي مستحقات التوصيل له (د)', 'القيمة': totals.totalShipping },
    { 'البند': 'إجمالي مستحقات المنصة عليه من عمولته (د)', 'القيمة': totals.totalCommission },
    { 'البند': 'إجمالي صافي مستحقات التجار (د)', 'القيمة': totals.totalMerchantNetDue },
    { 'البند': 'غير المسدَّد حالياً من مستحقات المنصة (د)', 'القيمة': totals.unsettled },
    { 'البند': 'تاريخ التصدير', 'القيمة': new Date().toLocaleString('ar-IQ') }
  ];

  const merchantRows = buildAgentSelfMerchantTotals(agentId).map(r => {
    const m = data.merchants.find(x => x.id === r.merchantId);
    return {
      'التاجر': m ? m.shop : 'تاجر محذوف',
      'عدد الطلبات': r.count,
      'مستحقات التوصيل (د)': r.shippingDue,
      'مستحقات المنصة منه (د)': r.platformCommission,
      'إجمالي مبلغ التاجر (د)': r.merchantDue,
      'صافي مستحق التاجر (د)': r.merchantNetDue
    };
  });

  const orderRows = [];
  days.forEach(day => {
    day.delivered.forEach(o => {
      const m = data.merchants.find(x => x.id === o.merchantId);
      const split = orderAgentDueSplit(o);
      orderRows.push({
        'اليوم (صفحة الحساب)': ledgerPageLabel(day.dateKey),
        'التاريخ والوقت': orderDateTimeLabel(o.date),
        'التاجر': m ? m.shop : 'تاجر محذوف',
        'المنتج': o.productName,
        'الحالة': 'واصل',
        'سعر الفاتورة (د)': o.price,
        'مستحق التوصيل (د)': split.shippingDue,
        'عمولة المنصة (د)': split.platformCommission,
        'صافي مستحق التاجر (د)': split.merchantNetDue,
        'مسدَّد هذا اليوم؟': isAgentDaySettled(agentId, day.dateKey) ? 'نعم' : 'لا'
      });
    });
    day.returned.forEach(o => {
      const m = data.merchants.find(x => x.id === o.merchantId);
      orderRows.push({
        'اليوم (صفحة الحساب)': ledgerPageLabel(day.dateKey),
        'التاريخ والوقت': orderDateTimeLabel(o.date),
        'التاجر': m ? m.shop : 'تاجر محذوف',
        'المنتج': o.productName,
        'الحالة': 'راجع — ' + (o.returnReason || '—'),
        'سعر الفاتورة (د)': o.price,
        'مستحق التوصيل (د)': 0,
        'عمولة المنصة (د)': 0,
        'صافي مستحق التاجر (د)': 0,
        'مسدَّد هذا اليوم؟': isAgentDaySettled(agentId, day.dateKey) ? 'نعم' : 'لا'
      });
    });
  });

  const dayRows = days.map(day => ({
    'اليوم': ledgerPageLabel(day.dateKey),
    'واصلة': day.deliveredCount,
    'راجعة': day.returnedCount,
    'مستحقات التوصيل (د)': day.totalShipping,
    'مستحقات المنصة (د)': day.totalPlatformCommission,
    'منها تعديل يدوي (د)': day.totalAdjustments,
    'صافي مستحق التجار (د)': day.totalMerchantNetDue,
    'الحالة': isAgentDaySettled(agentId, day.dateKey) ? 'مسدَّد' : 'غير مسدَّد'
  }));

  const adjustmentRows = (data.agentAdjustments || []).filter(adj => adj.agentId === agentId).map(adj => ({
    'اليوم': ledgerPageLabel(adj.dateKey),
    'المبلغ (د)': adj.amount,
    'السبب': adj.reason,
    'بواسطة': adj.by,
    'التاريخ': new Date(adj.at).toLocaleString('ar-IQ')
  }));

  const cashLogRows = (data.agentCashLogs || []).filter(l => l.agentId === agentId).map(l => ({
    'المبلغ المستلم (د)': l.amount,
    'ملاحظة': l.note || '—',
    'بواسطة': l.by,
    'التاريخ': new Date(l.at).toLocaleString('ar-IQ')
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ملخص عام');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(merchantRows), 'حسب التاجر');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), 'تفصيل كل طلب');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dayRows), 'حسب اليوم');
  if (adjustmentRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(adjustmentRows), 'تعديلات يدوية');
  if (cashLogRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cashLogRows), 'استلام نقدي يدوي');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `حسابات-مندوب-${a.name}-${stamp}.xlsx`);
  showToast('تم تحميل تقرير حسابات المندوب بالتفصيل');
}
