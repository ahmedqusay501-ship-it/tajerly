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

