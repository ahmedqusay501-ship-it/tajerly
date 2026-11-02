// Service worker — تاجرلي (PWA)
// الاستراتيجية: "الشبكة أولاً" لملفات الموقع نفسه (حتى أي تحديث ينزل فوراً ولا يعلق التاجر على نسخة قديمة)،
// والكاش فقط احتياط لو انقطع النت. ما نلمس أي طلب لجهة خارجية (Firestore / Firebase / n8n ...)
// ولا أي طلب غير GET، فالبيانات دايماً حيّة.
const CACHE = 'tajerly-shell-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // جهات خارجية: مباشرة للشبكة
  if (req.headers.has('range')) return;                  // صوت/فيديو (206) ما ينخزن
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: false });
        if (hit) return hit;
        // فتح رابط متجر (?s=...) بدون نت: نرجّع هيكل الصفحة بدل شاشة الخطأ
        if (req.mode === 'navigate') {
          const shell = await caches.match('/index.html') || await caches.match('/');
          if (shell) return shell;
        }
        return new Response('لا يوجد اتصال بالإنترنت', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
  );
});

// عند الضغط على إشعار: افتح/ركّز التطبيق (جاهز لما نضيف إشعارات Push)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow('/');
    })
  );
});

// إشعارات Push (FCM): يوصل الـ payload كـ JSON — إما {notification:{title,body}} أو {data:{title,body,url}}.
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  const n = p.notification || {};
  const d = p.data || {};
  const title = n.title || d.title || 'تاجرلي';
  const body = n.body || d.body || 'عندك طلب جديد';
  e.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: d.tag || 'tajerly-order',
    renotify: true,
    data: { url: d.url || '/' }
  }));
});
