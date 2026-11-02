// ===== الوضع الداكن / الفاتح =====
var THEME_KEY = 'tajerly-theme';
function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function applyChartTheme() {
  try {
    var dark = getTheme() === 'dark';
    var txt = dark ? '#94A3B8' : '#64748B', grid = dark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)';
    if (window.Chart) {
      Chart.defaults.color = txt; Chart.defaults.borderColor = grid;
      if (typeof chartInstances === 'object') {
        Object.keys(chartInstances).forEach(function (k) {
          var c = chartInstances[k]; if (!c || !c.options) return;
          c.options.color = txt;
          var sc = c.options.scales || {};
          Object.keys(sc).forEach(function (a) {
            sc[a].ticks = sc[a].ticks || {}; sc[a].ticks.color = txt;
            sc[a].grid = sc[a].grid || {}; sc[a].grid.color = grid;
          });
          if (c.options.plugins && c.options.plugins.legend) {
            c.options.plugins.legend.labels = c.options.plugins.legend.labels || {};
            c.options.plugins.legend.labels.color = txt;
          }
          c.update('none');
        });
      }
    }
  } catch (e) {}
}
function updateThemeButtons() {
  var dark = getTheme() === 'dark';
  document.querySelectorAll('.theme-toggle-btn').forEach(function (b) {
    b.textContent = dark ? '☀️' : '🌙';
    var label = dark ? 'الوضع الفاتح' : 'الوضع الداكن';
    b.title = label; b.setAttribute('aria-label', label);
  });
}
function setTheme(t) {
  t = (t === 'dark') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  updateThemeButtons(); applyChartTheme();
}
function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
// الزر العائم يظهر فقط في شاشة الدخول والرئيسية (داخل اللوحة يوجد زر في الشريط العلوي)
function syncThemeFab() {
  var fab = document.getElementById('theme-fab'); if (!fab) return;
  var vis = function (id) { var e = document.getElementById(id); return e && e.style.display !== 'none' && getComputedStyle(e).display !== 'none'; };
  fab.classList.toggle('hidden', !(vis('login-screen') || vis('home-screen')));
}
document.addEventListener('DOMContentLoaded', function () {
  updateThemeButtons(); applyChartTheme(); syncThemeFab();
  ['login-screen', 'home-screen', 'app-shell', 'public-store-screen'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) new MutationObserver(syncThemeFab).observe(e, { attributes: true, attributeFilter: ['style', 'class'] });
  });
});
