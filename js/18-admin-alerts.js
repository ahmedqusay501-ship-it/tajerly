// ---------- ADMIN ALERT CENTER ----------
// A single, strict/loud notification system covering everything the admin needs to act on:
// new merchant join requests, product-removal requests, delivery-ready orders, customer
// cancellation requests, and unread merchant support messages. Mirrors the merchant-side
// new-order alarm pattern (see 05-alerts-inbox.js): we "seed" a snapshot of whatever is
// already sitting in the queues the moment an admin session starts (so we never alarm for
// old backlog), then any item that shows up AFTER that triggers a loud, looping sound +
// a blocking modal the admin has to actively dismiss, plus live numbered badges on the
// sidebar and a topbar bell — all refreshed on every renderAll() (i.e. every 5s poll tick).

function isAdminAlertRole() {
  return currentRole === 'admin' || (currentRole === 'employee' && currentEmployee() && currentEmployee().ownerType === 'admin');
}

// ---- Raw queues (kept in one place so the badges, the summary card, and the alarm diff
// below always agree with each other and with the actual admin screens that list them) ----
function pendingJoinRequests() { return data.merchants.filter(m => m.status === 'pending'); }
function pendingRemovalRequests() { return data.orders.filter(o => o.removalStatus === 'requested'); }
function pendingCancelRequestGroupIds() {
  const items = data.orders.filter(o => !o.cancelled && (o.cancelStage === 'customer_requested' || o.cancelStage === 'merchant_approved'));
  return groupOrders(items).map(g => g.groupId);
}
function pendingDeliveryRequestGroupIds() {
  // "جاهزة للتوصيل" — the merchant packed it and it's sitting with the platform's shipping
  // team, waiting for the admin to hand it over. Once it's already been picked up
  // (received_by_shipping) or resolved (delivered/returned) it's no longer a fresh "request".
  const items = data.orders.filter(o => o.deliveryStatus === 'with_shipping' && !o.cancelled);
  return groupOrders(items).map(g => g.groupId);
}
function unreadSupportChatUids() { return (data.supportChats || []).filter(c => c.unreadForAdmin).map(c => c.authUid); }

let adminAlertSeeded = false;
let adminAlertSeen = { join: new Set(), removal: new Set(), cancel: new Set(), delivery: new Set(), support: new Set() };
let adminAlertSoundEnabled = (localStorage.getItem('adminAlertSoundEnabled') === '1');
let adminAlertAutoStopHandle = null;

function currentAdminAlertSnapshot() {
  return {
    join: pendingJoinRequests().map(m => m.id),
    removal: pendingRemovalRequests().map(o => o.id),
    cancel: pendingCancelRequestGroupIds(),
    delivery: pendingDeliveryRequestGroupIds(),
    support: unreadSupportChatUids()
  };
}

function seedAdminAlertTracking() {
  const snap = currentAdminAlertSnapshot();
  adminAlertSeen = {
    join: new Set(snap.join), removal: new Set(snap.removal), cancel: new Set(snap.cancel),
    delivery: new Set(snap.delivery), support: new Set(snap.support)
  };
  adminAlertSeeded = true;
}

// Called on logout (see platformLogout) so the NEXT admin session seeds fresh instead of
// silently carrying over stale "seen" state from a completely different login.
function resetAdminAlertTracking() {
  adminAlertSeeded = false;
  stopAdminAlertAlarm();
  const bellBtn = document.getElementById('admin-alert-bell-btn');
  if (bellBtn) { bellBtn.style.display = 'none'; bellBtn.classList.remove('alert-pulse'); }
}

const ADMIN_ALERT_SINGULAR = {
  join: 'طلب انضمام تاجر جديد', removal: 'طلب حذف قطعة من فاتورة', cancel: 'طلب إلغاء من زبون',
  delivery: 'طلب جاهز للتوصيل', support: 'رسالة دعم جديدة من تاجر'
};
const ADMIN_ALERT_PLURAL = {
  join: 'طلبات انضمام تجار جدد', removal: 'طلبات حذف قطع', cancel: 'طلبات إلغاء',
  delivery: 'طلبات جاهزة للتوصيل', support: 'رسائل دعم جديدة'
};
function adminAlertLabel(key, n) { return n === 1 ? ADMIN_ALERT_SINGULAR[key] : ADMIN_ALERT_PLURAL[key]; }

// Re-checked on every renderAll() (admin/admin-employee only — see isAdminAlertRole). Cheap:
// just array filters + set lookups over data already in memory, no extra network calls.
function checkAdminAlertsAndNotify() {
  if (!isAdminAlertRole()) return;
  if (!adminAlertSeeded) { seedAdminAlertTracking(); renderAdminAlertUI(); return; }

  const snap = currentAdminAlertSnapshot();
  const newCounts = {};
  let totalNew = 0;
  Object.keys(snap).forEach(key => {
    const newOnes = snap[key].filter(id => !adminAlertSeen[key].has(id));
    newCounts[key] = newOnes.length;
    totalNew += newOnes.length;
    adminAlertSeen[key] = new Set(snap[key]);
  });

  renderAdminAlertUI();
  if (totalNew > 0) playAdminAlertAlarm(newCounts);
}

function playAdminAlertAlarm(newCounts) {
  const lines = Object.keys(newCounts).filter(k => newCounts[k] > 0).map(k => `• ${newCounts[k]} ${adminAlertLabel(k, newCounts[k])}`);
  const body = document.getElementById('admin-alert-modal-body');
  if (body) body.innerHTML = lines.join('<br>');
  const modal = document.getElementById('admin-alert-modal');
  if (modal) modal.classList.add('show');
  if (adminAlertSoundEnabled) {
    const audio = document.getElementById('admin-alert-audio');
    if (audio) { audio.loop = true; audio.currentTime = 0; audio.play().catch(() => {}); }
  }
  // Safety net, same reasoning as the merchant order alarm: never rings forever unattended.
  clearTimeout(adminAlertAutoStopHandle);
  adminAlertAutoStopHandle = setTimeout(stopAdminAlertAlarm, 120000);
}
function stopAdminAlertAlarm() {
  const audio = document.getElementById('admin-alert-audio');
  if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
  const modal = document.getElementById('admin-alert-modal');
  if (modal) modal.classList.remove('show');
  clearTimeout(adminAlertAutoStopHandle);
}
function acknowledgeAdminAlert() { stopAdminAlertAlarm(); }

function toggleAdminAlertSound() {
  adminAlertSoundEnabled = !adminAlertSoundEnabled;
  localStorage.setItem('adminAlertSoundEnabled', adminAlertSoundEnabled ? '1' : '0');
  if (adminAlertSoundEnabled) {
    // Same "unlock autoplay" trick as toggleNewOrderSound — play+immediately pause right on
    // the click itself, so a later automatic play() (no fresh user gesture) isn't blocked.
    const audio = document.getElementById('admin-alert-audio');
    if (audio) { audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {}); }
    showToast('تفعّل — رح يرن إنذار صوتي فور وصول أي طلب أو رسالة جديدة تحتاج انتباهك');
  } else {
    stopAdminAlertAlarm();
    showToast('تم إيقاف الإنذار الصوتي لتنبيهات الإدارة');
  }
  renderAdminAlertUI();
}

// ---- Live UI: numbered nav badges, topbar bell, and the dashboard summary card ----
function setNavBadgeCount(viewId, count) {
  const btn = document.querySelector(`#nav button[data-view="${viewId}"]`);
  if (!btn) return; // hidden for this role/permission set — nothing to badge
  let badge = btn.querySelector('.nav-badge-count');
  if (count > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge-count'; btn.appendChild(badge); }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (badge) {
    badge.remove();
  }
}

function renderAdminAlertUI() {
  const isAdminSide = isAdminAlertRole();
  const bellBtn = document.getElementById('admin-alert-bell-btn');
  if (bellBtn) bellBtn.style.display = isAdminSide ? '' : 'none';
  const toggleInlineBtn = document.getElementById('admin-alert-toggle-inline-btn');
  if (!isAdminSide) return;

  const joinCount = pendingJoinRequests().length;
  const removalCount = pendingRemovalRequests().length;
  const cancelCount = pendingCancelRequestGroupIds().length;
  const deliveryCount = pendingDeliveryRequestGroupIds().length;
  const supportCount = unreadSupportChatUids().length;
  const requestsTotal = joinCount + removalCount + cancelCount;
  const grandTotal = requestsTotal + deliveryCount + supportCount;

  setNavBadgeCount('requests', requestsTotal);
  setNavBadgeCount('shipping', deliveryCount);
  setNavBadgeCount('support', supportCount);

  const bellIcon = document.getElementById('admin-alert-bell-icon');
  if (bellIcon) bellIcon.textContent = adminAlertSoundEnabled ? '🔔' : '🔕';
  const bellCount = document.getElementById('admin-alert-bell-count');
  if (bellCount) {
    if (grandTotal > 0) { bellCount.style.display = 'flex'; bellCount.textContent = grandTotal > 99 ? '99+' : String(grandTotal); }
    else bellCount.style.display = 'none';
  }
  if (bellBtn) bellBtn.classList.toggle('alert-pulse', grandTotal > 0);
  if (toggleInlineBtn) toggleInlineBtn.textContent = adminAlertSoundEnabled ? 'إيقاف الإنذار الصوتي' : 'تفعيل الإنذار الصوتي';

  const summaryEl = document.getElementById('admin-alert-summary-card');
  if (summaryEl) {
    const rows = [
      { count: joinCount, view: 'requests', label: 'طلبات انضمام تجار جدد' },
      { count: removalCount, view: 'requests', label: 'طلبات حذف قطع من الفواتير' },
      { count: cancelCount, view: 'requests', label: 'طلبات إلغاء من الزبائن' },
      { count: deliveryCount, view: 'shipping', label: 'طلبات جاهزة للتوصيل' },
      { count: supportCount, view: 'support', label: 'رسائل دعم جديدة من التجار' }
    ];
    const summaryParent = summaryEl.closest('.card');
    if (summaryParent) summaryParent.classList.toggle('alert-pulse', grandTotal > 0);
    summaryEl.innerHTML = grandTotal === 0
      ? '<div class="empty">تمام — ما فيه أي طلب أو رسالة تحتاج انتباهك حالياً 👍</div>'
      : rows.filter(r => r.count > 0).map(r => `
        <div class="list-item" style="cursor:pointer;" onclick="showView('${r.view}')">
          <span>${r.label}</span>
          <span class="nav-badge-count" style="margin:0;">${r.count}</span>
        </div>`).join('');
  }
}

// ---------- NEW-MERCHANT JOIN STATS (daily / weekly / monthly / average) ----------
// Every merchant id is minted as Date.now()*1000 + a small random offset (see submitRequest
// in 08-admin-requests-employees-creds.js), so the exact moment a merchant submitted their
// join request can be recovered straight from the id itself — no extra field or migration
// needed, and it works even for merchants created before this dashboard existed.
function merchantJoinDate(m) { return new Date(Math.floor(m.id / 1000)); }

function computeMerchantJoinStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 86400000);
  const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 86400000);
  // A merchant who was later rejected never lingers in data.merchants at all (rejectMerchant
  // removes them outright), so anyone still here — pending, active, or disabled — genuinely
  // did join at some point, making this list exactly "everyone who ever joined".
  const dates = data.merchants.map(merchantJoinDate);
  const daily = dates.filter(d => d >= startOfToday).length;
  const weekly = dates.filter(d => d >= sevenDaysAgo).length;
  const monthly = dates.filter(d => d >= thirtyDaysAgo).length;
  return { daily, weekly, monthly, avgPerDay: monthly / 30 };
}

function renderMerchantJoinStats() {
  const s = computeMerchantJoinStats();
  const dayEl = document.getElementById('join-stat-daily');
  const weekEl = document.getElementById('join-stat-weekly');
  const monthEl = document.getElementById('join-stat-monthly');
  const avgEl = document.getElementById('join-stat-avg');
  if (dayEl) dayEl.textContent = s.daily;
  if (weekEl) weekEl.textContent = s.weekly;
  if (monthEl) monthEl.textContent = s.monthly;
  if (avgEl) avgEl.textContent = s.avgPerDay.toFixed(1);
  renderMerchantJoinChart();
}

function renderMerchantJoinChart() {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('chart-merchant-joins');
  if (!canvas) return;
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ dateStr: d.toDateString(), label: `${dayNames[d.getDay()]} ${d.getDate()}` });
  }
  const counts = days.map(d => data.merchants.filter(m => merchantJoinDate(m).toDateString() === d.dateStr).length);
  upsertChart('chart-merchant-joins', {
    type: 'bar',
    data: { labels: days.map(d => d.label), datasets: [{ label: 'تجار جدد', data: counts, backgroundColor: '#10B981', borderRadius: 4, maxBarThickness: 20 }] },
    options: baseChartOptions()
  });
}
