// Restore the selected appearance before the first page paint.
(() => {
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'gray';
  try {
    const session = new URLSearchParams(location.search).get('test-session')?.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    const prefix = session ? `clever-qa-${session}` : 'clever';
    const saved = JSON.parse(localStorage.getItem(prefix + '-settings') || '{}');
    if (['graphite', 'gray'].includes(saved.theme)) theme = saved.theme;
  } catch { /* Preserve the current system appearance when preferences are unavailable. */ }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'graphite' ? '#1e1e1e' : '#efefef';
})();
