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


