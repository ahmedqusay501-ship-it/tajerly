  // Decide the boot-loading icon (platform mark vs merchant logo) using only signals
  // available synchronously at page load — no need to wait for the data fetch to finish.
  (function () {
    try {
      var boot = document.getElementById('boot-loading');
      var params = new URLSearchParams(location.search);
      var slug = params.get('store');
      var isCustomerStore = !!slug;
      if (!isCustomerStore) {
        try {
          var raw = localStorage.getItem('platform-session');
          var saved = raw ? JSON.parse(raw) : null;
          if (saved && (saved.role === 'admin' || saved.role === 'merchant' || saved.role === 'employee')) {
            isCustomerStore = false;
          }
        } catch (e) {}
      }
      boot.classList.add(isCustomerStore ? 'boot-role-customer' : 'boot-role-merchant');

      // If this browser opened this exact store link before, its logo was cached locally
      // last time (see updateBootMerchantLogo) — show it immediately instead of the generic
      // placeholder, so a returning customer sees their store's own branding right away
      // instead of waiting on the database round-trip.
      if (isCustomerStore && slug) {
        try {
          var cachedLogo = localStorage.getItem('boot-logo-cache:' + decodeURIComponent(slug));
          if (cachedLogo) {
            var img = document.getElementById('boot-logo-merchant-img');
            var placeholder = document.getElementById('boot-logo-merchant-placeholder');
            if (img && placeholder) {
              img.src = cachedLogo;
              img.style.display = 'block';
              placeholder.style.display = 'none';
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  })();

  // Swaps in a merchant's real storefront logo on the customer boot screen once the merchant
  // record has loaded, and caches it locally (keyed by store link) so the next visit to this
  // same link can show it immediately, before the cache check above. Called from
  // openPublicStore() once the matching merchant is found. A merchant with no logo uploaded
  // yet just keeps the generic placeholder.
  function updateBootMerchantLogo(m) {
    try {
      var logo = m && m.theme && m.theme.logo;
      if (!logo) return;
      var img = document.getElementById('boot-logo-merchant-img');
      var placeholder = document.getElementById('boot-logo-merchant-placeholder');
      if (img && placeholder) {
        img.src = logo;
        img.style.display = 'block';
        placeholder.style.display = 'none';
      }
      if (m.linkSlug) localStorage.setItem('boot-logo-cache:' + m.linkSlug, logo);
    } catch (e) {}
  }
