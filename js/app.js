/* Hash-router en thema. */
(function () {
  'use strict';
  const app = document.getElementById('app');

  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, qs] = hash.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    let nav = 'home';

    if (parts[0] === 'k' && parts[1]) {
      Views.kentekenPage(app, parts[1], parts[2] || 'rapport');
    } else if (parts[0] === 'vergelijk') {
      nav = 'vergelijk';
      Views.comparePage(app, (parts[1] || '').split(','));
    } else if (parts[0] === 'model') {
      nav = 'model';
      Views.modelAnalysis(app, { merk: params.merk || '', model: params.model || '', van: params.van || '', tot: params.tot || '', tgk: params.tgk || '', type: params.type || '' });
    } else if (parts[0] === 'datasets') {
      nav = 'datasets';
      Views.datasetsPage(app, params);
    } else {
      Views.homePage(app);
    }
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    window.scrollTo(0, 0);
  }

  // Thema (licht/donker) onthouden
  const root = document.documentElement;
  try { const t = localStorage.getItem('checkapk.theme'); if (t) root.dataset.theme = t; } catch (e) { /* ignore */ }
  document.getElementById('themeToggle').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('checkapk.theme', root.dataset.theme); } catch (e) { /* ignore */ }
  });

  window.addEventListener('hashchange', route);
  route();
})();
