// ---------- إحصائيات زيارات المتجر (يومية) ----------
// العدّاد القديم (m.visits داخل وثيقة التاجر) ما كان يحفظ فعلياً: كتابة وثيقة التاجر مقفولة على الزائر غير المسجّل.
// هذا البديل يكتب بمجموعة store_visits/{merchantAuthUid}_{YYYYMMDD} (القاعدة تسمح للزائر بزيادة 0 أو 1 فقط):
//   visits  = زيارة جديدة (مرة وحدة لكل جلسة متصفح)   |   uniques = زائر مميّز باليوم (مرة وحدة لكل متصفح باليوم)
// اليوم بتوقيت بغداد (UTC+3) حتى يطابق يوم التاجر. المتجر التجريبي وأي مستخدم مسجّل دخول لا يُحسبون.

function storeVisitDay(offsetDays) {
  const d = new Date(Date.now() + 3 * 3600 * 1000 - (offsetDays || 0) * 86400000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function recordStoreVisit(m) {
  try {
    if (!m || m.isDemo || !m.authUid || !window.authApi || !window.authApi.bumpCounter) return;
    if (typeof trackingBlocked === 'function' && trackingBlocked()) return;
    const day = storeVisitDay(0);
    const incs = { visits: 0, uniques: 0 };
    try {
      const sk = 'sv-' + m.authUid;
      if (!sessionStorage.getItem(sk)) { sessionStorage.setItem(sk, '1'); incs.visits = 1; }
      const uk = 'su-' + m.authUid + '-' + day;
      if (!localStorage.getItem(uk)) { localStorage.setItem(uk, '1'); incs.uniques = 1; }
    } catch (e) { incs.visits = 1; } // تخزين محجوب: نحسبها زيارة بدون تمييز
    if (!incs.visits && !incs.uniques) return;
    window.authApi.bumpCounter('store_visits', m.authUid + '_' + day, { m: m.authUid, day }, incs).catch(() => {});
  } catch (e) { /* القياس ما يكسر المتجر */ }
}

const storeVisitCache = {}; // authUid -> { at, rows }
async function loadStoreVisits(m, force) {
  const c = storeVisitCache[m.authUid];
  if (!force && c && Date.now() - c.at < 60000) return c.rows;
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(storeVisitDay(i));
  const rows = await Promise.all(days.map(async (day) => {
    try {
      const doc = await window.authApi.getPrivateDoc('store_visits', m.authUid + '_' + day);
      return { day, visits: (doc && doc.visits) || 0, uniques: (doc && doc.uniques) || 0 };
    } catch (e) { return { day, visits: null, uniques: null }; }
  }));
  storeVisitCache[m.authUid] = { at: Date.now(), rows };
  return rows;
}

async function renderMerchantVisitStats(m) {
  const sum = document.getElementById('merchant-visit-summary');
  if (!sum || !m || !m.authUid || !window.authApi) return;
  const rows = await loadStoreVisits(m);
  if (rows.every(r => r.visits === null)) { sum.innerHTML = '<div class="empty">إحصائيات الزيارات غير متاحة لهذا الحساب</div>'; return; }
  const totalVisits = rows.reduce((a, r) => a + (r.visits || 0), 0);
  const totalUniques = rows.reduce((a, r) => a + (r.uniques || 0), 0);
  const weekStart = new Date(Date.now() + 3 * 3600 * 1000 - 6 * 86400000).toISOString().slice(0, 10);
  const orders = data.orders.filter(o => o.merchantId === m.id && !o.cancelled && String(new Date(new Date(o.date).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10)) >= weekStart);
  const conv = totalVisits > 0 ? Math.round((orders.length / totalVisits) * 1000) / 10 : 0;
  sum.innerHTML = `<div class="grid3">
    <div class="stat"><div class="stat-num">${fmtNum(totalVisits)}</div><div class="stat-label">زيارات (٧ أيام)</div></div>
    <div class="stat"><div class="stat-num">${fmtNum(totalUniques)}</div><div class="stat-label">زوار مميّزون</div></div>
    <div class="stat"><div class="stat-num">${conv}%</div><div class="stat-label">نسبة التحويل (طلبات ÷ زيارات)</div></div>
  </div>
  <div class="subtitle" style="margin-top:6px;">الإحصائيات تبدأ من لحظة تحديث الموقع — الأيام السابقة تظهر صفر.</div>`;
  if (typeof Chart === 'undefined' || typeof upsertChart !== 'function') return;
  const labels = rows.map(r => r.day.slice(4, 6) + '/' + r.day.slice(6, 8));
  upsertChart('chart-merchant-visits', {
    type: 'line',
    data: { labels, datasets: [
      { label: 'زيارات', data: rows.map(r => r.visits || 0), borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.12)', fill: true, tension: 0.3, pointRadius: 3 },
      { label: 'زوار مميّزون', data: rows.map(r => r.uniques || 0), borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.10)', fill: false, tension: 0.3, pointRadius: 3 }
    ] },
    options: baseChartOptions()
  });
}
