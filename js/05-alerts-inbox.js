// ---------- LOW-STOCK ALERTS FOR THE MERCHANT ----------
// A merchant can set a "warn me at or below this quantity" threshold per store (defaults
// to 5 if they've never set one). Anything at or below that — down to and including fully
// out of stock — shows up as a low-stock alert, checked across every size box, color box,
// and plain (no-variant) stock field the merchant's products have.
function getLowStockThreshold(m) {
  return typeof m.lowStockThreshold === 'number' ? m.lowStockThreshold : 5;
}

function getLowStockItems(m) {
  const threshold = getLowStockThreshold(m);
  const items = [];
  (m.products || []).forEach(p => {
    if (p.sizes && p.sizes.length) {
      p.sizes.forEach(s => {
        if (typeof s.stock === 'number' && s.stock <= threshold) {
          items.push({ productName: p.name, label: `مقاس ${s.value}`, stock: s.stock });
        }
      });
    }
    if (p.colors && p.colors.length) {
      p.colors.forEach(c => {
        if (typeof c.stock === 'number' && c.stock <= threshold) {
          items.push({ productName: p.name, label: c.name, stock: c.stock });
        }
      });
    }
    if ((!p.sizes || !p.sizes.length) && (!p.colors || !p.colors.length) && typeof p.stock === 'number' && p.stock <= threshold) {
      items.push({ productName: p.name, label: null, stock: p.stock });
    }
  });
  // Most urgent (fully out of stock) first, then lowest quantity first.
  items.sort((a, b) => a.stock - b.stock);
  return items;
}

function renderLowStockAlerts(m) {
  const items = getLowStockItems(m);
  if (!items.length) return `<div class="subtitle" style="margin:0;">كل مخزونك بحالة جيدة حالياً ما فيه أي صنف قرب يخلص</div>`;
  return items.map(it => `
    <div class="low-stock-row">
      <span>${it.stock <= 0 ? '' : ''} ${esc(it.productName)}${it.label ? ' — ' + esc(it.label) : ''}</span>
      <span style="font-weight:700; color:${it.stock <= 0 ? 'var(--danger)' : 'var(--warn)'};">${it.stock <= 0 ? 'نفدت الكمية' : it.stock + ' متبقية'}</span>
    </div>
  `).join('');
}

// Small red counter badge shown next to the "المنتجات" tab so the merchant notices the
// alert even before opening that tab.
function lowStockBadgeHtml(m) {
  const count = getLowStockItems(m).length;
  return count > 0 ? `<span class="notify-dot">${count}</span>` : '';
}

// ---------- NEW-ORDER SOUND ALARM ----------
// A loud, hard-to-miss alert for the merchant (or their employee) when a fresh order lands
// while their dashboard is open — separate from the low-stock alerts above, which are about
// inventory, not incoming sales. Browsers block autoplay until the person has interacted
// with the page at least once, so this stays off until the merchant explicitly turns it on
// (toggleNewOrderSound), which also "unlocks" the audio element via that same click.
let newOrderSoundEnabled = (localStorage.getItem('newOrderSoundEnabled') === '1');
let newOrderTrackedMerchantId = null; // which merchant's pending orders we're currently watching
let seenPendingOrderIds = null;       // Set of order ids already known about — anything new triggers the alarm
let orderAlarmAutoStopHandle = null;

function currentPendingOrderIds(m) {
  return data.orders
    .filter(o => o.merchantId === m.id && o.status === 'pending' && (!o.cancelStage || o.cancelStage === 'none'))
    .map(o => o.id);
}

// Called once per merchant session (see renderMerchantPanel) so we never alarm for orders
// that were already sitting there before the dashboard was opened — only genuinely new ones.
function seedNewOrderTracking(m) {
  seenPendingOrderIds = new Set(currentPendingOrderIds(m));
  newOrderTrackedMerchantId = m.id;
}

function checkForNewOrdersAndAlert(m) {
  if (newOrderTrackedMerchantId !== m.id) { seedNewOrderTracking(m); return; } // ما زرنا هذا التاجر بعد بهذي الجلسة
  const currentIds = currentPendingOrderIds(m);
  const newIds = currentIds.filter(id => !seenPendingOrderIds.has(id));
  seenPendingOrderIds = new Set(currentIds);
  if (newIds.length > 0 && newOrderSoundEnabled) playOrderAlarm(newIds.length);
}

function toggleNewOrderSound() {
  newOrderSoundEnabled = !newOrderSoundEnabled;
  localStorage.setItem('newOrderSoundEnabled', newOrderSoundEnabled ? '1' : '0');
  if (newOrderSoundEnabled) {
    // تشغيل وإيقاف فوري بنفس لحظة ضغطة الزر — هذا "يفتح" صلاحية تشغيل الصوت بالمتصفح
    // لاحقاً تلقائياً من غير تفاعل جديد من المستخدم، لأن المتصفحات تمنع autoplay بدونها.
    const audio = document.getElementById('new-order-alarm-audio');
    if (audio) { audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {}); }
    showToast('تفعّل — رح تسمع صوت إنذار فور وصول أي طلب جديد وأنت فاتح لوحتك');
  } else {
    stopOrderAlarm();
    showToast('تم إيقاف التنبيه الصوتي للطلبات');
  }
  if (typeof renderMerchantPanel === 'function') renderMerchantPanel();
}

function playOrderAlarm(count) {
  const audio = document.getElementById('new-order-alarm-audio');
  const subtitleEl = document.getElementById('new-order-alarm-subtitle');
  if (subtitleEl) subtitleEl.textContent = count > 1 ? `عندك ${count} طلبات جديدة بانتظار المراجعة` : 'عندك طلب جديد بانتظار المراجعة';
  const modal = document.getElementById('new-order-alarm-modal');
  if (modal) modal.classList.add('show');
  if (audio) {
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(() => {}); // لو المتصفح رفض التشغيل التلقائي رغم كل شي، البانر المرئي يبقى كافي للتنبيه
  }
  // شبكة أمان: نوقف الرنين تلقائياً بعد دقيقتين حتى لو التاجر ترك الجهاز ولم يضغط "استلمت"،
  // حتى ما يضل يرن للأبد بصمت بخلفية المتصفح.
  clearTimeout(orderAlarmAutoStopHandle);
  orderAlarmAutoStopHandle = setTimeout(stopOrderAlarm, 120000);
}

function stopOrderAlarm() {
  const audio = document.getElementById('new-order-alarm-audio');
  if (audio) { audio.pause(); audio.currentTime = 0; audio.loop = false; }
  const modal = document.getElementById('new-order-alarm-modal');
  if (modal) modal.classList.remove('show');
  clearTimeout(orderAlarmAutoStopHandle);
}

// الزر بنافذة التنبيه نفسها — يوقف الرنين وينقل التاجر مباشرة لتبويب الطلبات ليراجعها
function acknowledgeOrderAlarm() {
  stopOrderAlarm();
  if (typeof showMerchantDashTab === 'function') showMerchantDashTab('orders');
}
// ---------- MERCHANT-SIDE ANNOUNCEMENTS (admin broadcast inbox) ----------
// Announcements addressed to this merchant: either a platform-wide 'all' message, or one
// where this merchant's id is explicitly in the target list. Newest first.
function announcementsForMerchant(m) {
  return (data.announcements || [])
    .filter(a => a.target === 'all' || (Array.isArray(a.target) && a.target.includes(m.id)))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function unreadAnnouncementsBadgeHtml(m) {
  const count = announcementsForMerchant(m).filter(a => !(a.readBy || []).includes(m.id)).length;
  return count > 0 ? `<span class="notify-dot">${count}</span>` : '';
}
function renderMerchantAnnouncements(m) {
  const items = announcementsForMerchant(m);
  if (!items.length) return '<div class="empty">ما وصلتك أي رسالة من الإدارة لحد الآن</div>';
  return items.map(a => {
    const unread = !(a.readBy || []).includes(m.id);
    const date = new Date(a.createdAt).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' });
    return `
      <div class="low-stock-row" style="align-items:flex-start; flex-direction:column; gap:4px; ${unread ? 'border-inline-start:3px solid var(--accent); padding-inline-start:8px;' : ''}">
        <div style="white-space:pre-wrap;">${unread ? '' : ''}${esc(a.text)}</div>
        <span class="subtitle" style="margin:0;">${date}</span>
      </div>`;
  }).join('');
}
// Called when the merchant (or their employee) actually opens the messages tab — marks every
// announcement addressed to them as read so the badge count clears.
async function markAnnouncementsRead(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  let changed = false;
  announcementsForMerchant(m).forEach(a => {
    if (!(a.readBy || []).includes(m.id)) { a.readBy = [...(a.readBy || []), m.id]; changed = true; }
  });
  if (changed) await saveData();
}

async function saveLowStockThreshold(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m) return;
  const input = document.getElementById(`low-stock-threshold-${merchantId}`);
  const raw = input ? input.value.trim() : '';
  m.lowStockThreshold = raw === '' ? 5 : Math.max(0, parseInt(raw) || 0);
  await saveData();
  renderMerchantPanel();
  showToast('تم حفظ حد التنبيه ');
}

// Pops a one-time toast the first time (per session) the low-stock count for this merchant
// changes, so they notice even if they're sitting on the "orders" tab instead of "products".
// Re-fires only when the count itself changes (not on every poll/re-render) to avoid spam.
let lowStockToastState = {};
function maybeShowLowStockToast(m) {
  const count = getLowStockItems(m).length;
  if (count > 0 && lowStockToastState[m.id] !== count) {
    showToast(`عندك ${count} صنف/مقاس بمتجرك قربت كميته تخلص — راجع تبويب "المنتجات"`, 5000);
  }
  lowStockToastState[m.id] = count;
}

