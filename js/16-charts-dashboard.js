// ---------- CHARTS ----------
let chartInstances = {};
function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = chartInstances[canvasId];
  // If a chart already exists on this canvas, just feed it the new numbers instead of
  // destroying and rebuilding the whole chart (cheaper, and avoids a visible re-draw flash
  // every time the 5s live-refresh or a tab switch triggers a re-render).
  if (existing) {
    existing.data.labels = config.data.labels;
    existing.data.datasets.forEach((ds, i) => {
      if (config.data.datasets[i]) Object.assign(ds, config.data.datasets[i]);
    });
    existing.update();
    return;
  }
  // Chart.js measures the canvas's on-screen box the moment it's created and locks that size
  // in. renderDashboard()/renderMerchantPanel() run on every re-render — including the 5s
  // live-refresh poll — no matter which tab is actually open, so without this check a chart
  // often got FIRST created while its tab was still hidden (display:none), got sized 0×0, and
  // stayed blank forever afterwards — later .update() calls only push new data in, they never
  // re-measure the canvas. So: don't create it until it's actually on screen. The tab-switch
  // handlers (showDashboardTab / applyMerchantDashTab) already make the tab visible and THEN
  // call this function again, so the chart still gets created correctly the first time anyone
  // actually looks at it.
  if (canvas.offsetParent === null) return;
  chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
}
function last7Days() {
  const dayNames = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ dateStr: d.toDateString(), label: dayNames[d.getDay()] });
  }
  return days;
}
function baseChartOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { font: { size: 10 }, precision: 0 }, grid: { color: '#E2E8F0' } },
      x: { ticks: { font: { size: 10 } }, grid: { display: false } }
    }
  };
}
// Keeps the merchant dropdown above the charts in sync with the real, current merchant list
// (so it's "تفاعلية حسب الموجود" — reflects whoever actually exists right now — instead of a
// fixed, hardcoded set) without wiping out whichever merchant the admin already had selected.
function populateChartMerchantFilter() {
  const sel = document.getElementById('chart-merchant-filter');
  if (!sel) return;
  const current = sel.value || 'all';
  const active = activeMerchants();
  sel.innerHTML = '<option value="all">كل المنصة</option>' +
    active.map(m => `<option value="${m.id}">${esc(m.shop)}</option>`).join('');
  sel.value = active.some(m => String(m.id) === current) ? current : 'all';
}
function changeChartMerchantFilter() {
  renderDashboardCharts();
}
function renderDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  populateChartMerchantFilter();
  const filterEl = document.getElementById('chart-merchant-filter');
  const filterId = filterEl ? filterEl.value : 'all';
  const isAll = !filterId || filterId === 'all';
  const m = isAll ? null : data.merchants.find(x => String(x.id) === String(filterId));

  const relevantOrders = isAll ? data.orders : data.orders.filter(o => o.merchantId === m.id);

  const titleOrders = document.getElementById('chart-orders-title');
  const titleFees = document.getElementById('chart-fees-title');
  if (titleOrders) titleOrders.textContent = isAll ? 'الطلبات آخر 7 أيام' : `طلبات "${m.shop}" آخر 7 أيام`;
  if (titleFees) titleFees.textContent = isAll ? 'رسوم المنصة المحصّلة آخر 7 أيام (دينار)' : `رسوم المنصة من "${m.shop}" آخر 7 أيام (دينار)`;

  const days = last7Days();
  const labels = days.map(d => d.label);
  const ordersPerDay = days.map(d => relevantOrders.filter(o => new Date(o.date).toDateString() === d.dateStr).length);
  const feesPerDay = days.map(d => relevantOrders.filter(o => new Date(o.date).toDateString() === d.dateStr)
    .reduce((s,o) => s + o.feeFromCustomer + o.feeFromMerchant + (o.itemDeduction || 0), 0));

  upsertChart('chart-orders-trend', {
    type: 'line',
    data: { labels, datasets: [{ label: 'عدد الطلبات', data: ordersPerDay, borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.18)', fill: true, tension: 0.3, pointRadius: 3 }] },
    options: baseChartOptions()
  });
  upsertChart('chart-fees-trend', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'الرسوم (د)', data: feesPerDay, backgroundColor: '#1E293B', borderRadius: 4, maxBarThickness: 28 }] },
    options: baseChartOptions()
  });
}
function renderMerchantCharts(m) {
  if (typeof Chart === 'undefined') return;
  const days = last7Days();
  const labels = days.map(d => d.label);
  const myOrders = data.orders.filter(o => o.merchantId === m.id && o.status === 'accepted' && !o.cancelled);
  const salesPerDay = days.map(d => myOrders.filter(o => new Date(o.date).toDateString() === d.dateStr).length);

  upsertChart('chart-merchant-sales', {
    type: 'line',
    data: { labels, datasets: [{ label: 'عمليات البيع', data: salesPerDay, borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,0.15)', fill: true, tension: 0.3, pointRadius: 3 }] },
    options: baseChartOptions()
  });

  const productTotals = {};
  myOrders.forEach(o => { productTotals[o.productName] = (productTotals[o.productName] || 0) + 1; });
  const sortedProducts = Object.entries(productTotals).sort((a,b) => b[1]-a[1]).slice(0, 5);
  upsertChart('chart-merchant-products', {
    type: 'bar',
    data: { labels: sortedProducts.map(p => p[0]), datasets: [{ label: 'مرات البيع', data: sortedProducts.map(p => p[1]), backgroundColor: '#10B981', borderRadius: 4, maxBarThickness: 22 }] },
    options: { ...baseChartOptions(), indexAxis: 'y' }
  });
}

// ---------- DATA INTEGRITY: leftover id collisions from the old shared-counter bug ----------
// Before genId() (see near the top of the file), two sessions creating a product/category/
// coupon at nearly the same moment could end up with the exact same id inside one merchant's
// own lists — new records can no longer collide, but anything created before this fix is still
// sitting in the data with a duplicate id if it happened. This scans for any of those so the
// admin can see and fix them (delete/recreate the duplicate) instead of it silently causing
// "tapped one product, a different one opened" for a customer.
function findDuplicateIds() {
  const issues = [];
  data.merchants.forEach(m => {
    const checkArray = (arr, label) => {
      if (!Array.isArray(arr)) return;
      const byId = new Map();
      arr.forEach(item => {
        if (!byId.has(item.id)) byId.set(item.id, []);
        byId.get(item.id).push(item);
      });
      byId.forEach((items, id) => {
        if (items.length > 1) {
          issues.push({ merchant: m.shop, type: label, id, names: items.map(i => i.name || i.code || ('#' + i.id)) });
        }
      });
    };
    checkArray(m.products, 'منتج');
    checkArray(m.categories, 'قسم');
    checkArray(m.coupons, 'كوبون');
  });
  return issues;
}
function renderIdCollisionWarning() {
  const box = document.getElementById('id-collision-warning');
  if (!box) return;
  const issues = findDuplicateIds();
  if (issues.length === 0) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="card" style="border-color:#F0C879; background:#FFF9EC; margin-bottom:14px;">
      <div class="card-title" style="color:#8A5A00;">تصادم بالأرقام التعريفية — ${issues.length} حالة (بيانات قديمة قبل الإصلاح)</div>
      <div class="subtitle" style="margin-bottom:8px;">هذي عناصر أخذت نفس الرقم بالغلط لأنها انسوت بنفس اللحظة من جهازين مختلفين. افتح متجر التاجر، وتأكد وحدة وحدة من العناصر تحت، واحذف الأقدم/المكرر منها يدوياً (الإصلاح الجديد يمنع صار هذا بالمستقبل، بس ما يعدّل عناصر قديمة انسوت من زمان).</div>
      ${issues.map(i => `<div class="list-item"><span>${esc(i.merchant)} — ${esc(i.type)} (#${i.id})</span><span>${i.names.map(esc).join(' | ')}</span></div>`).join('')}
    </div>
  `;
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  renderIdCollisionWarning();
  const today = new Date().toDateString();
  const todayOrders = data.orders.filter(o => new Date(o.date).toDateString() === today);
  const todayFees = todayOrders.reduce((sum, o) => sum + o.feeFromCustomer + o.feeFromMerchant + (o.itemDeduction || 0), 0);

  document.getElementById('d-orders').textContent = todayOrders.length;
  document.getElementById('d-fees').textContent = todayFees.toLocaleString();
  document.getElementById('d-active').textContent = data.merchants.filter(m => m.status === 'active').length;

  const list = document.getElementById('d-merchant-list');
  const active = activeMerchants();
  list.innerHTML = active.length === 0 ? '<div class="empty">ما فيه محلات مسجلة بعد</div>' :
    active.map(m => {
      const s = computeMerchantLiveStats(m.id);
      return `
      <div class="list-item" style="flex-direction:column; align-items:stretch;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>${esc(m.shop)}${needsReviewBadgeHtml(m.id)} <button class="btn secondary small" style="margin-right:6px;" onclick="exportMerchantAccountingExcel(${m.id})">تصدير حسابه Excel</button></span>
          <span><span class="badge ${m.status==='active'?'active':'disabled'}">${m.status==='active'?'نشط':'معطل'}</span> — ${m.salesCount} عملية</span>
        </div>
        <div class="grid3" style="margin:8px 0 0; gap:6px;">
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.sales.toLocaleString()}</div><div class="stat-label">رصيد المبيعات (د)</div></div>
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.merchantDue.toLocaleString()}</div><div class="stat-label">مستحقات التاجر (د)</div></div>
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.platformDue.toLocaleString()}</div><div class="stat-label">مستحقات المنصة (د)</div></div>
        </div>
        <div class="grid3" style="margin:6px 0 0; gap:6px;">
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.ordersCount}</div><div class="stat-label">عدد الطلبات</div></div>
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.piecesSold}</div><div class="stat-label">قطع مباعة</div></div>
          <div class="stat" style="padding:8px 4px;"><div class="stat-num" style="font-size:14px;">${s.avgPieces.toFixed(1)}</div><div class="stat-label">متوسط قطع/طلب</div></div>
        </div>
      </div>
    `;
    }).join('');

  renderAdminLedger();
  renderMerchantRanking();

  renderDashboardCharts();
}

function renderAll() {
  renderDashboard();
  renderRequests();
  renderCommissionRequests();
  renderAnnouncementsAdmin();
  renderEmployees();
  renderAccounting();
  renderMerchantPeriodDues();
  if (loggedInMerchantId) renderMerchantPanel();
  renderStoreSelect();
  renderSettings();
  renderMerchantActions();
  renderAdminShippingControl();
  renderAuditLog();
  renderAdminSupportList();
  updateSupportNavBadge();
  updateSupportFab();
}
