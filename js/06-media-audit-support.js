// ---------- IMAGE HELPERS ----------
// Reads an image file, downsizes it, and returns a compressed base64 data URL
// so uploaded photos don't blow past storage limits.
const MAX_PRODUCT_IMAGES = 5; // a merchant's whole product catalog lives inside one Firestore
// document (1MB hard limit) — this keeps one product's photos from crowding out everything else.
function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('تعذر تحميل الصورة'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}
// Optimistic concurrency: the shared storage has no real transactions, so before writing we
// check nobody else saved since we last synced. If someone did, we refuse to blindly overwrite
// their changes (which is what caused silent data loss before) — we warn and reload instead.
let loadedVersion = 0;
async function saveData() {
  try {
    // Settings are admin-only to write now, so most callers here (a customer checking
    // out, a merchant accepting an order) simply
    // don't have permission to touch this doc — and that's expected, not an error. We only
    // treat it as a real problem (and only reload the page) when we DO have permission but
    // someone else changed it first, i.e. an actual conflicting write we detected.
    try {
      // A version mismatch here usually isn't a real conflict — it's the 5-second
      // live-refresh poller (or another quick save) nudging the version forward between
      // when we last loaded and when we're saving right now. Retrying a couple of times
      // against the freshest version absorbs that benign race instead of throwing away
      // whatever the admin just typed (a password change, a merchant approval, ...) and
      // reloading the page out from under them. Only if it's STILL conflicting after
      // retries do we fall back to the old, safer-but-destructive reload.
      let settingsSaved = false;
      for (let attempt = 1; attempt <= 3 && !settingsSaved; attempt++) {
        const current = await window.storage.get('platform-settings', true).catch(() => null);
        const remoteVersion = current && current.value ? (JSON.parse(current.value).version || 0) : 0;
        if (remoteVersion !== loadedVersion) {
          if (attempt < 3) { loadedVersion = remoteVersion; continue; }
          showToast('صار تحديث من مكان ثاني — جاري تحديث الصفحة لتفادي فقدان بيانات');
          setTimeout(() => location.reload(), 1500);
          return false;
        }
        data.version = remoteVersion + 1;
        // adminUsername/adminPassword deliberately excluded here — they live in their own
        // 'admin-credentials' doc (see saveAdminCredentials) which only the real admin can
        // write. This doc stays writable by 'settings'-permission employees for pricing only.
        const { adminUsername: _au, adminPassword: _ap, ...publicSettings } = data.settings;
        await window.storage.set('platform-settings', JSON.stringify({ settings: publicSettings, nextId: data.nextId, version: data.version, announcements: data.announcements, ledgerClosures: data.ledgerClosures }), true);
        loadedVersion = data.version;
        settingsSaved = true;
      }
    } catch (e) {
      if (!(e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')))) {
        console.error('Settings sync failed:', e);
      }
    }

    // Merchants and orders each live in their own protected Firestore
    // documents (see initStorage) — best-effort sync; a failure here (e.g. a merchant
    // trying to touch another merchant's document) is expected and must never block a
    // save the current user IS allowed to make.
    if (window.authApi) {
      // Diffed the same way as orders below: only a merchant whose public fields actually
      // changed locally gets re-written. Without this, every saveData() call — including one
      // triggered by deleting a single product or answering a single commission-exemption
      // request — rewrote EVERY merchant's doc from this session's in-memory copy, clobbering
      // any concurrent edit another merchant had made on their own device (see
      // lastSyncedMerchantSnapshots above for the full story).
      data.merchants.filter(m => m.authUid).forEach(m => {
        const { password: _pw, balance: _b, salesCount: _s, authUid: _a, ...publicFields } = m;
        const json = JSON.stringify(publicFields);
        if (lastSyncedMerchantSnapshots.get(m.authUid) !== json) {
          window.authApi.saveDoc('merchants', m.authUid, publicFields)
            .then(() => lastSyncedMerchantSnapshots.set(m.authUid, json))
            .catch(() => {});
        }
        // Balance/salesCount are cheap, small, and only the earning merchant + admin can ever
        // write them (see merchant_private rules) — no diff needed here, unlike the full
        // product/category/coupon payload above.
        window.authApi.saveDoc('merchant_private', m.authUid, { balance: m.balance || 0, salesCount: m.salesCount || 0 }).catch(() => {});
      });
      // Pending (not-yet-approved) merchant requests have no login account/uid yet, so they
      // go to their own collection instead — anyone can create one, only the admin can read it.
      data.merchants.filter(m => !m.authUid && m.status === 'pending').forEach(m => {
        window.authApi.saveDoc('join_requests', String(m.id), m).catch(() => {});
      });
      // Employees follow the exact same active/pending split as merchants above.
      data.employees.filter(e => e.authUid).forEach(e => {
        window.authApi.saveDoc('employees', e.authUid, e).catch(() => {});
      });
      data.employees.filter(e => !e.authUid && e.status === 'pending').forEach(e => {
        window.authApi.saveDoc('employee_requests', String(e.id), e).catch(() => {});
      });
      // Only orders that actually changed since the last save get re-written — cheap
      // in-memory diff, so this stays fast even once order history grows large.
      const changedOrders = [];
      data.orders.forEach(o => {
        const json = JSON.stringify(o);
        if (lastSyncedOrderSnapshots.get(o.id) !== json) {
          changedOrders.push(o);
          window.authApi.saveDoc('orders', String(o.id), o)
            .then(() => lastSyncedOrderSnapshots.set(o.id, json))
            .catch(e => console.error('order sync failed for', o.id, e));
        }
      });
      // Keep the public order_tracking "view" copy (see firestore.rules) in sync with
      // every status change too — same best-effort fire-and-forget style as the orders
      // write above. Brand new orders (checkout's own explicit upsertOrderTrackingGroup
      // write hasn't necessarily landed/created their doc yet) are silently skipped inside
      // syncOrderTrackingUpdates — nothing to patch until the group exists, and the very
      // next status change will catch them up automatically.
      syncOrderTrackingUpdates(changedOrders);
    }

    return true;
  } catch (e) { console.error('Storage error while saving:', e); return false; }
}

// ---------- AUDIT LOG ----------
// A running trail of sensitive, hard-to-undo actions (approve/reject/delete a merchant,
// reset someone's password, change admin credentials, ...) — who did it and when. Kept as
// its own small doc (same shape as admin-credentials: publicly readable so any admin-side
// screen can show it live, but writable only by a real admin session) so it never gets
// tangled up with the version-conflict retry logic that guards 'platform-settings'.
//
// NOTE: like 'admin-credentials', this needs its own firestore.rules entry to actually be
// enforced server-side (read: true, write: if isAdmin()) — see the admin-credentials rule
// already deployed for this project and mirror it for the 'audit-log' key under /storage.
const AUDIT_LOG_MAX_ENTRIES = 300;
function currentActorLabel() {
  if (currentRole === 'admin') return `${data.settings.adminUsername || 'admin'} (أدمن)`;
  if (currentRole === 'merchant') {
    const m = data.merchants.find(x => x.id === loggedInMerchantId);
    return `${m ? m.shop : 'تاجر'} (تاجر)`;
  }
  if (currentRole === 'employee') {
    const emp = currentEmployee();
    return `${emp ? (emp.name || emp.username || 'موظف') : 'موظف'} (موظف)`;
  }
  return 'غير معروف';
}
async function logAudit(action, details) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    ts: new Date().toISOString(),
    actor: currentActorLabel(),
    action,
    details: details || ''
  };
  data.auditLog = [entry, ...(data.auditLog || [])];
  if (data.auditLog.length > AUDIT_LOG_MAX_ENTRIES) data.auditLog.length = AUDIT_LOG_MAX_ENTRIES;
  if (document.getElementById('audit-log-list')) { auditLogPage = 1; renderAuditLog(); }
  try {
    await window.storage.set('audit-log', JSON.stringify(data.auditLog), true);
  } catch (e) {
    // Best-effort, same pattern as saveAdminCredentials()/saveData() — an admin-team
    // employee's session (or a stale one) getting permission-denied here must never block
    // the actual action that triggered this log entry.
    if (!(e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')))) {
      console.error('Failed to persist audit log entry:', e);
    }
  }
}

let auditLogPage = 1;
const AUDIT_LOG_PAGE_SIZE = 10;
function changeAuditLogPage(page) {
  auditLogPage = page;
  renderAuditLog();
}
function renderAuditLog() {
  const el = document.getElementById('audit-log-list');
  if (!el) return;
  const log = data.auditLog || [];
  if (log.length === 0) { el.innerHTML = '<div class="empty">ما فيه أي إجراءات مسجلة بعد</div>'; return; }
  const totalPages = Math.max(1, Math.ceil(log.length / AUDIT_LOG_PAGE_SIZE));
  if (auditLogPage > totalPages) auditLogPage = totalPages;
  if (auditLogPage < 1) auditLogPage = 1;
  const start = (auditLogPage - 1) * AUDIT_LOG_PAGE_SIZE;
  const pageEntries = log.slice(start, start + AUDIT_LOG_PAGE_SIZE);
  const rows = pageEntries.map(entry => `
    <div class="list-item" style="align-items:flex-start;">
      <span>${esc(entry.action)}${entry.details ? ' — ' + esc(entry.details) : ''}<br>
      <span style="color:var(--text-mute); font-size:11px;">${esc(entry.actor)} · ${new Date(entry.ts).toLocaleString('ar-IQ')}</span></span>
    </div>`).join('');
  const pager = totalPages > 1 ? `
    <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-top:12px;">
      <button class="btn secondary small" ${auditLogPage <= 1 ? 'disabled' : ''} onclick="changeAuditLogPage(${auditLogPage - 1})">‹ السابق</button>
      <span style="font-size:11.5px; color:var(--text-mute);">صفحة ${auditLogPage} من ${totalPages} (${log.length} إجراء)</span>
      <button class="btn secondary small" ${auditLogPage >= totalPages ? 'disabled' : ''} onclick="changeAuditLogPage(${auditLogPage + 1})">التالي ›</button>
    </div>` : '';
  el.innerHTML = rows + pager;
}

// ---------- MERCHANT SUPPORT CHAT ----------
// One thread per merchant, stored as its own Firestore doc (collection 'support_chats',
// doc id = the merchant's authUid — same key merchants/merchant_private already use). A
// merchant sends from the floating button (support-fab); the admin replies from view-support.
// Ending the session (admin-only) deletes the doc outright, wiping the thread for both sides.
//
// Firestore rule deployed for this — see match /support_chats/{uid} in firestore.rules:
// merchant reads/creates/updates only their own doc (authUid must match), admin (or an
// admin-team employee granted the 'support' permission) can read/update any doc, and only
// admin/that employee can delete a doc at all (= "end session" in the UI).
let supportChatOpenAuthUid = null; // which merchant's thread the modal is currently showing

async function saveSupportChatDoc(chat) {
  if (!window.authApi || !chat || !chat.authUid) return;
  try {
    await window.authApi.saveDoc('support_chats', chat.authUid, chat);
  } catch (e) {
    if (!(e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')))) {
      console.error('Support chat sync failed:', e);
    }
  }
}

function getOrCreateMerchantChat(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m || !m.authUid) return null;
  let chat = data.supportChats.find(c => c.authUid === m.authUid);
  if (!chat) {
    chat = { authUid: m.authUid, merchantId: m.id, merchantShop: m.shop, messages: [], unreadForAdmin: false, unreadForMerchant: false, updatedAt: new Date().toISOString() };
    data.supportChats.push(chat);
  } else {
    chat.merchantShop = m.shop; // keep the cached name fresh if the merchant renamed their shop
  }
  return chat;
}

// Merchant side: opened from the floating button. Employees don't get this — it's the
// merchant's own line to the admin, same scope as the request that asked for it.
async function openSupportChat() {
  if (currentRole !== 'merchant' || !loggedInMerchantId) return;
  const m = data.merchants.find(x => x.id === loggedInMerchantId);
  // Pull the merchant's own thread fresh before rendering — the regular 5s poll can only
  // do this for whichever thread the modal already has open (see pollForUpdates), so a
  // brand new session (or one from another device) needs this explicit fetch here first.
  if (m && m.authUid && window.authApi) {
    try {
      const own = await window.authApi.getPrivateDoc('support_chats', m.authUid);
      if (own) {
        const idx = data.supportChats.findIndex(c => c.authUid === m.authUid);
        if (idx >= 0) data.supportChats[idx] = { ...own, authUid: m.authUid };
        else data.supportChats.push({ ...own, authUid: m.authUid });
      } else {
        // Doc is really gone (e.g. the admin just ended the session) — drop any stale local
        // copy instead of leaving it in place, same fix as in fetchRemoteData() above.
        // Otherwise reopening the chat kept showing the old, already-ended conversation.
        data.supportChats = data.supportChats.filter(c => c.authUid !== m.authUid);
      }
    } catch (e) { /* offline or a real error — getOrCreateMerchantChat below falls back to whatever's cached */ }
  }
  const chat = getOrCreateMerchantChat(loggedInMerchantId);
  if (!chat) return;
  supportChatOpenAuthUid = chat.authUid;
  chat.unreadForMerchant = false;
  document.getElementById('support-chat-title').textContent = 'دعم التاجر';
  document.getElementById('support-chat-end-row').style.display = 'none';
  document.getElementById('support-chat-modal').classList.add('show');
  document.getElementById('support-chat-input').value = '';
  renderSupportChatMessages();
  updateSupportFab();
  saveSupportChatDoc(chat);
}

// Admin side: opened from a row in view-support.
function openAdminSupportChat(authUid) {
  if (currentRole !== 'admin') return;
  const chat = data.supportChats.find(c => c.authUid === authUid);
  if (!chat) return;
  supportChatOpenAuthUid = authUid;
  chat.unreadForAdmin = false;
  document.getElementById('support-chat-title').textContent = `${chat.merchantShop || 'تاجر'}`;
  document.getElementById('support-chat-end-row').style.display = 'block';
  document.getElementById('support-chat-modal').classList.add('show');
  document.getElementById('support-chat-input').value = '';
  renderSupportChatMessages();
  updateSupportNavBadge();
  renderAdminSupportList();
  saveSupportChatDoc(chat);
}

function closeSupportChatModal() {
  document.getElementById('support-chat-modal').classList.remove('show');
  supportChatOpenAuthUid = null;
}

// keepScrollIfNearBottom: when the live-refresh poll calls this because a reply just came
// in, only auto-scroll if the person was already near the bottom — otherwise it would yank
// them away from a message they scrolled up to re-read.
function renderSupportChatMessages(keepScrollIfNearBottom) {
  const box = document.getElementById('support-chat-messages');
  if (!box || !supportChatOpenAuthUid) return;
  const chat = data.supportChats.find(c => c.authUid === supportChatOpenAuthUid);
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  if (!chat || chat.messages.length === 0) {
    box.innerHTML = '<div class="empty">ما فيه رسائل بعد — اكتب مشكلتك وراح توصل للإدارة</div>';
    return;
  }
  const mineFrom = currentRole === 'admin' ? 'admin' : 'merchant';
  box.innerHTML = chat.messages.map(msg => `
    <div class="support-msg ${msg.from === mineFrom ? 'mine' : 'theirs'}">
      ${esc(msg.text)}
      <span class="support-msg-time">${new Date(msg.ts).toLocaleString('ar-IQ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
    </div>`).join('');
  if (!keepScrollIfNearBottom || wasNearBottom) box.scrollTop = box.scrollHeight;
}

async function sendSupportChatMessage() {
  if (!supportChatOpenAuthUid) return;
  const input = document.getElementById('support-chat-input');
  const text = (input.value || '').trim();
  if (!text) return;
  const chat = data.supportChats.find(c => c.authUid === supportChatOpenAuthUid);
  if (!chat) return;
  const from = currentRole === 'admin' ? 'admin' : 'merchant';
  chat.messages.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), from, text, ts: new Date().toISOString() });
  chat.updatedAt = new Date().toISOString();
  if (from === 'merchant') { chat.unreadForAdmin = true; chat.unreadForMerchant = false; }
  else { chat.unreadForMerchant = true; chat.unreadForAdmin = false; }
  input.value = '';
  renderSupportChatMessages();
  await saveSupportChatDoc(chat);
  if (currentRole === 'admin') { renderAdminSupportList(); updateSupportNavBadge(); }
}

// Admin's list of every merchant thread — newest activity first, unread ones flagged.
function renderAdminSupportList() {
  const el = document.getElementById('admin-support-list');
  if (!el || currentRole !== 'admin') return;
  const chats = [...(data.supportChats || [])]
    .filter(c => c.messages && c.messages.length > 0)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  if (chats.length === 0) { el.innerHTML = '<div class="empty">ما فيه محادثات دعم حالياً</div>'; return; }
  el.innerHTML = chats.map(c => {
    const last = c.messages[c.messages.length - 1];
    return `<div class="list-item support-chat-list-item" onclick="openAdminSupportChat('${esc(c.authUid)}')">
      <span>${esc(c.merchantShop || 'تاجر')}<br><span style="color:var(--text-mute); font-size:11px;">${esc((last.text || '').slice(0, 40))}${(last.text || '').length > 40 ? '…' : ''}</span></span>
      ${c.unreadForAdmin ? '<span class="support-unread-badge">جديد</span>' : ''}
    </div>`;
  }).join('');
}

function endSupportSession() {
  if (currentRole !== 'admin' || !supportChatOpenAuthUid) return;
  const authUid = supportChatOpenAuthUid;
  const chat = data.supportChats.find(c => c.authUid === authUid);
  openConfirmModal('إنهاء الجلسة', `راح تنحذف كل رسائل هذه المحادثة مع ${chat ? chat.merchantShop : 'التاجر'} نهائياً. متأكد؟`, async () => {
    data.supportChats = data.supportChats.filter(c => c.authUid !== authUid);
    closeSupportChatModal();
    renderAdminSupportList();
    updateSupportNavBadge();
    if (window.authApi) {
      try { await window.authApi.deleteDoc('support_chats', authUid); } catch (e) { console.error('Failed to delete support chat:', e); }
    }
    showToast('تم إنهاء الجلسة وحذف الرسائل');
  });
}

// Shows/hides the merchant's floating chat button + its unread dot. Merchants only — an
// employee logged into a merchant's panel doesn't get this (see openSupportChat above).
function updateSupportFab() {
  const fab = document.getElementById('support-fab');
  if (!fab) return;
  const show = currentRole === 'merchant' && !!loggedInMerchantId;
  fab.classList.toggle('show', show);
  if (!show) return;
  const m = data.merchants.find(x => x.id === loggedInMerchantId);
  const chat = m && m.authUid ? data.supportChats.find(c => c.authUid === m.authUid) : null;
  document.getElementById('support-fab-badge').style.display = (chat && chat.unreadForMerchant) ? 'flex' : 'none';
}

// Small red dot on the admin's "دعم التجار" nav button when at least one thread has an
// unread merchant message. Called after buildNav() rebuilds the nav and after anything that
// can change unread state.
function updateSupportNavBadge() {
  const btn = document.querySelector('#nav button[data-view="support"]');
  if (!btn) return;
  const hasUnread = (data.supportChats || []).some(c => c.unreadForAdmin);
  let dot = btn.querySelector('.nav-badge-dot');
  if (hasUnread && !dot) { dot = document.createElement('span'); dot.className = 'nav-badge-dot'; btn.appendChild(dot); }
  else if (!hasUnread && dot) { dot.remove(); }
}

function openLegalModal() { document.getElementById('legal-modal').classList.add('show'); }
function closeLegalModal() { document.getElementById('legal-modal').classList.remove('show'); }
function openAboutModal() { document.getElementById('about-modal').classList.add('show'); }
function closeAboutModal() { document.getElementById('about-modal').classList.remove('show'); }
// Shows a customer the store-specific terms a merchant wrote (see setMerchantCustomTerms).
// Only ever called from a link that's itself only rendered when the merchant turned it on
// and actually wrote something — but we guard here too in case it's called some other way.
function openMerchantTermsModal(merchantId) {
  const m = data.merchants.find(x => x.id === merchantId);
  if (!m || !m.theme || !m.theme.customTerms || !m.theme.customTerms.text) return;
  document.getElementById('merchant-terms-title').textContent = `شروط وأحكام متجر ${m.shop}`;
  document.getElementById('merchant-terms-body').textContent = m.theme.customTerms.text;
  document.getElementById('merchant-terms-modal').classList.add('show');
}
function closeMerchantTermsModal() { document.getElementById('merchant-terms-modal').classList.remove('show'); }

function showToast(msg, duration) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration || 1800);
}

