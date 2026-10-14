export function initWorkspaceLayout(prefix, { beforeChange = () => null, afterChange = () => {} } = {}) {
  const shell = document.querySelector('.app-shell'), reader = document.querySelector('#reader-view');
  const toggle = document.querySelector('#focus-toggle'), separator = document.querySelector('#assistant-resizer');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(prefix + '-reader-layout') || '{}'); } catch {}
  let focused = false, width = Math.max(280, Math.min(420, Number(saved.width) || 340)), drag = null;
  const persist = () => { try { localStorage.setItem(prefix + '-reader-layout', JSON.stringify({ width })); } catch {} };
  function setWidth(next) {
    const maximum = Math.max(280, Math.min(420, reader.clientWidth - 460));
    const visible = Math.round(Math.max(280, Math.min(maximum, next)));
    reader.style.setProperty('--assistant-width', visible + 'px');
    separator.setAttribute('aria-valuenow', String(visible)); separator.setAttribute('aria-valuemax', String(maximum));
    if (reader.clientWidth) {
      const available = matchMedia('(min-width:801px)').matches ? reader.clientWidth - (focused ? 0 : visible + 8) - 64 : reader.clientWidth - 36;
      reader.style.setProperty('--reading-page-width', Math.max(160, Math.min(850, available)) + 'px');
      reader.style.setProperty('--reading-text-width', Math.max(160, Math.min(700, available)) + 'px');
    }
    return visible;
  }
  function update() {
    shell.dataset.focus = String(focused);
    toggle.setAttribute('aria-pressed', String(!focused));
    toggle.setAttribute('aria-label', focused ? '展开原文解读' : '收起原文解读');
    toggle.title = focused ? '展开原文解读' : '收起原文解读';
    setWidth(width);
    const widen = document.querySelector('[data-action="widen-assistant"]');
    const wide = width >= 380;
    widen.disabled = reader.clientWidth < 840;
    widen.setAttribute('aria-pressed', String(wide));
    widen.setAttribute('aria-label', wide ? '恢复解读栏宽度' : '加宽解读栏');
    widen.title = widen.disabled ? '扩大窗口后可加宽解读栏' : wide ? '恢复解读栏宽度' : '加宽解读栏';
  }
  let panelAnimation;
  function change(next) {
    if (next === focused) return;
    const position = beforeChange();
    panelAnimation?.cancel();
    focused = next; update(); afterChange(position);
    if (!focused && document.body.dataset.input !== 'keyboard' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panelAnimation = document.querySelector('.assistant-panel').animate([{ opacity: .35, transform: 'translateX(6px)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
  }
  toggle.addEventListener('click', () => change(!focused));
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    panelAnimation?.cancel();
    event.preventDefault(); separator.focus(); separator.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, width: Number(separator.getAttribute('aria-valuenow')), previous: width, id: event.pointerId, position: beforeChange() };
    shell.classList.add('resizing');
  });
  separator.addEventListener('pointermove', event => { if (drag && event.pointerId === drag.id) width = setWidth(drag.width + drag.x - event.clientX); });
  function finish(cancel = false) {
    if (!drag) return;
    const position = drag.position;
    if (cancel) width = drag.previous;
    if (separator.hasPointerCapture(drag.id)) separator.releasePointerCapture(drag.id);
    drag = null; shell.classList.remove('resizing'); update(); persist(); afterChange(position);
  }
  separator.addEventListener('pointerup', () => finish()); separator.addEventListener('pointercancel', () => finish(true));
  separator.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const position = beforeChange(); width = setWidth(event.key === 'Home' ? 280 : event.key === 'End' ? 420 : width + (event.key === 'ArrowLeft' ? 16 : -16)); update(); persist(); afterChange(position);
    }
  });
  new ResizeObserver(() => { if (reader.clientWidth) update(); }).observe(reader);
  const stopAnimation = () => panelAnimation?.cancel();
  document.addEventListener('keydown', stopAnimation);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', stopAnimation);
  update();
  return { revealAssistant() { change(false); }, widen() { const position = beforeChange(); width = width >= 380 ? 340 : 380; update(); persist(); afterChange(position); }, getState() { return { focused, width }; }, setState(state) { focused = !!state.focused; update(); }, refresh: update };
}
