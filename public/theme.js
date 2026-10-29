// Restore the selected appearance before the first page paint.
(() => {
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'graphite' : 'gray';
  let style = 'swiss', motion = true;
  try {
    const session = new URLSearchParams(location.search).get('test-session')?.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
    const prefix = session ? `clever-qa-${session}` : 'clever';
    const stored = localStorage.getItem(prefix + '-settings');
    const saved = JSON.parse(stored || '{}');
    style = ['swiss', 'editorial', 'classic', 'paper'].includes(saved.style) ? saved.style : stored ? 'classic' : 'swiss';
    if (['graphite', 'gray'].includes(saved.theme)) theme = saved.theme;
    else if (!stored) theme = 'gray';
    motion = saved.motion !== false;
  } catch { /* Preserve the current system appearance when preferences are unavailable. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.style = style;
  document.documentElement.dataset.motion = motion ? 'on' : 'off';
  document.querySelector('meta[name="theme-color"]').content = theme === 'graphite' ? '#1e1e1e' : '#efefef';
})();
