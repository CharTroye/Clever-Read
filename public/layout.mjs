export function initWorkspaceLayout(prefix) {
  const shell = document.querySelector('.app-shell'), reader = document.querySelector('#reader-view');
  const sidebar = document.querySelector('#sidebar-toggle'), focus = document.querySelector('#focus-toggle');
  const separator = document.querySelector('#assistant-resizer');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(prefix + '-layout') || '{}'); } catch {}
  let collapsed = !!saved.collapsed, focused = false, width = Number(saved.width) || 348, drag = null;
  const persist = () => { try { localStorage.setItem(prefix + '-layout', JSON.stringify({ collapsed, width })); } catch {} };
  function setWidth(next) {
    const maximum = Math.max(280, Math.min(520, reader.clientWidth - 330));
    const visible = Math.round(Math.max(280, Math.min(maximum, next)));
    reader.style.setProperty('--assistant-width', visible + 'px');
    separator.setAttribute('aria-valuenow', String(visible)); separator.setAttribute('aria-valuemax', String(maximum));
    return visible;
  }
  function update() {
    shell.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'; shell.dataset.focus = String(focused);
    sidebar.setAttribute('aria-pressed', String(collapsed)); sidebar.setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏'); sidebar.title = collapsed ? '展开侧栏' : '收起侧栏';
    focus.setAttribute('aria-pressed', String(focused)); focus.querySelector('span:last-child').textContent = focused ? '退出专注' : '专注阅读';
    focus.title = focused ? '退出专注阅读' : '专注阅读'; setWidth(width);
  }
  sidebar.addEventListener('click', () => { collapsed = !collapsed; update(); persist(); });
  focus.addEventListener('click', () => { focused = !focused; update(); });
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); separator.focus(); separator.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, width: Number(separator.getAttribute('aria-valuenow')), previous: width, id: event.pointerId };
    shell.classList.add('resizing');
  });
  separator.addEventListener('pointermove', event => { if (drag && event.pointerId === drag.id) width = setWidth(drag.width + drag.x - event.clientX); });
  function finish(cancel = false) {
    if (!drag) return;
    if (cancel) width = drag.previous;
    if (separator.hasPointerCapture(drag.id)) separator.releasePointerCapture(drag.id);
    drag = null; shell.classList.remove('resizing'); setWidth(width); persist();
  }
  separator.addEventListener('pointerup', () => finish()); separator.addEventListener('pointercancel', () => finish(true));
  separator.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); width = setWidth(event.key === 'Home' ? 280 : event.key === 'End' ? 520 : width + (event.key === 'ArrowLeft' ? 16 : -16)); persist();
    }
  });
  new ResizeObserver(() => setWidth(width)).observe(reader);
  update();
  return { revealAssistant() { if (focused) { focused = false; update(); } } };
}
