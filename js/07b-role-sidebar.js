// ---------- Role sidebar: صفحات التاجر والمندوب بالقائمة الجانبية (مثل الأدمن) ----------
// لوحة التاجر ولوحة المندوب كل وحدة "صفحة واحدة" بتبويبات داخلية. هنا نعكس هذي التبويبات
// على القائمة الجانبية ونخفي شريط التبويبات الأفقي، والنقر على عنصر بالقائمة يضغط التبويب الأصلي
// (فكل منطق الصلاحيات والعدّادات والعرض يبقى مثل ما هو بدون أي تغيير).
(function () {
  let observers = [];
  let kind = null; // 'merchant' | 'agent' | null

  function roleKind(role) {
    if (role === 'merchant') return 'merchant';
    if (role === 'employee') {
      const emp = currentEmployee();
      if (!emp) return null;
      if (emp.ownerType === 'delivery_agent' || emp.ownerType === 'agent_employee') return 'agent';
      if (emp.ownerType === 'admin') return null;
      return 'merchant';
    }
    return null;
  }

  function sourceTabs() {
    const box = kind === 'agent' ? document.getElementById('agent-dashboard-tabs') : document.getElementById('merchant-dash-subnav');
    return box ? Array.from(box.querySelectorAll('.toggle')) : [];
  }

  function syncSidebar() {
    if (!kind) return;
    const nav = document.getElementById('nav');
    if (!nav) return;
    const oldBadge = nav.querySelector('button[data-view="delivery_agent"] .nav-badge-count');
    const badgeText = oldBadge ? oldBadge.textContent : '';
    const tabs = sourceTabs().filter(b => b.style.display !== 'none');
    nav.innerHTML = tabs.map((b, i) => {
      const id = b.dataset.agenttab || b.dataset.mdashtab;
      const view = kind === 'agent' && i === 0 ? ' data-view="delivery_agent"' : '';
      return `<button data-tab="${id}"${view} class="${b.classList.contains('selected') ? 'active' : ''}">${b.innerHTML}</button>`;
    }).join('');
    nav.querySelectorAll('button[data-tab]').forEach(btn => {
      btn.onclick = () => {
        const src = sourceTabs().find(b => (b.dataset.agenttab || b.dataset.mdashtab) === btn.dataset.tab);
        if (src) src.click();
        if (typeof closeSidebar === 'function') closeSidebar();
      };
    });
    if (badgeText) {
      const first = nav.querySelector('button[data-view="delivery_agent"]');
      if (first) { const s = document.createElement('span'); s.className = 'nav-badge-count'; s.textContent = badgeText; first.appendChild(s); }
    }
  }

  let queued = false;
  function queueSync() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; syncSidebar(); }); }

  const originalBuildNav = buildNav;
  buildNav = function (role) {
    originalBuildNav(role);
    observers.forEach(o => o.disconnect()); observers = [];
    kind = roleKind(role);
    document.body.classList.toggle('role-sidebar', !!kind);
    if (!kind) return;
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('sidebar-toggle-btn').style.display = '';
    const target = kind === 'agent' ? document.getElementById('agent-dashboard-tabs') : document.getElementById('merchant-panel');
    if (target) {
      const ob = new MutationObserver(queueSync);
      ob.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      observers.push(ob);
    }
    syncSidebar();
  };
})();
