import { revealSurface, leaveSurface, layoutTransfer, dockAssistant } from './motion.mjs';

export function initWorkspaceLayout(prefix, { beforeChange = () => null, afterChange = () => {} } = {}) {
  const shell = document.querySelector('.app-shell'), reader = document.querySelector('#reader-view');
  const toggle = document.querySelector('#focus-toggle'), separator = document.querySelector('#assistant-resizer');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(prefix + '-reader-layout') || '{}'); } catch {}
  const assistant = document.querySelector('.assistant-panel');
  let focused = true, width = Math.max(320, Math.min(520, Number(saved.width) || 360)), drag = null, promotion = null, questionFocus = false, lastWidth = 0;
  const persist = () => { try { localStorage.setItem(prefix + '-reader-layout', JSON.stringify({ width })); } catch {} };
  function setWidth(next) {
    const minimum = reader.clientWidth < 840 ? 280 : 320;
    const maximum = Math.max(minimum, Math.min(520, reader.clientWidth - 480));
    const visible = Math.round(Math.max(minimum, Math.min(maximum, next)));
    reader.style.setProperty('--assistant-width', visible + 'px');
    separator.setAttribute('aria-valuenow', String(visible)); separator.setAttribute('aria-valuemin', String(minimum)); separator.setAttribute('aria-valuemax', String(maximum));
    if (reader.clientWidth) {
      const desktop = matchMedia('(min-width:801px)').matches;
      const compare = reader.dataset.compare === 'true';
      const available = (compare && desktop ? reader.clientWidth / 2 : reader.clientWidth) - (desktop && !focused && !compare ? visible + 8 : 0) - (desktop ? 56 : 36);
      reader.style.setProperty('--reading-page-width', Math.max(160, Math.min(focused ? 1160 : 960, available)) + 'px');
      reader.style.setProperty('--reading-text-width', Math.max(160, Math.min(focused ? 1040 : 860, available)) + 'px');
    }
    return visible;
  }
  function update() {
    shell.dataset.focus = String(focused);
    assistant.inert = focused && !promotion; assistant.setAttribute('aria-hidden', String(focused && !promotion));
    toggle.setAttribute('aria-pressed', String(!focused));
    toggle.setAttribute('aria-label', focused ? '展开原文解读' : '返回专注阅读');
    toggle.title = focused ? '展开原文解读' : '返回专注阅读';
    setWidth(width);
    const widen = document.querySelector('[data-action="widen-assistant"]');
    const wide = width >= 420;
    widen.disabled = reader.clientWidth < 840;
    widen.setAttribute('aria-pressed', String(wide));
    widen.setAttribute('aria-label', wide ? '恢复解读栏宽度' : '加宽解读栏');
    widen.title = widen.disabled ? '扩大窗口后可加宽解读栏' : wide ? '恢复解读栏宽度' : '加宽解读栏';
  }
  function cancelPromotion() { const current = promotion; promotion = null; questionFocus = false; current?.cancel(); if (current) update(); }
  function change(next, { panelMotion = true, animate = true, promoting = false } = {}) {
    if (!promoting) cancelPromotion();
    if (next === focused) { update(); return; }
    const position = beforeChange();
    const paper = document.querySelector('#document-content'), before = paper.getBoundingClientRect();
    if (next && animate && panelMotion) leaveSurface(assistant);
    focused = next; update(); afterChange(position);
    if (focused && (assistant.contains(document.activeElement) || document.activeElement === toggle)) document.querySelector('.reader-controls button.active')?.focus({ preventScroll: true });
    if (animate) layoutTransfer(paper, before);
    if (!focused && animate && panelMotion) revealSurface(assistant, 0, 240);
  }
  toggle.addEventListener('click', () => change(!focused));
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
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
      event.preventDefault(); const position = beforeChange(); width = setWidth(event.key === 'Home' ? 320 : event.key === 'End' ? 520 : width + (event.key === 'ArrowLeft' ? 16 : -16)); update(); persist(); afterChange(position);
    }
  });
  new ResizeObserver(() => { if (reader.clientWidth) { if (lastWidth && lastWidth !== reader.clientWidth) cancelPromotion(); lastWidth = reader.clientWidth; update(); } }).observe(reader);
  update();
  function promoteAssistant(origin, { focusQuestion = false } = {}) {
    cancelPromotion(); questionFocus = focusQuestion;
    const complete = () => { promotion = null; if (questionFocus) document.querySelector('#question').focus({ preventScroll: true }); questionFocus = false; };
    if (!focused || !matchMedia('(min-width:801px)').matches) { change(false); if (focusQuestion) document.querySelector('#question').focus({ preventScroll: true }); return; }
    const visible = setWidth(width), rect = reader.getBoundingClientRect(), style = getComputedStyle(assistant);
    const ml = parseFloat(style.marginLeft) || 0, mr = parseFloat(style.marginRight) || 0, mt = parseFloat(style.marginTop) || 0, mb = parseFloat(style.marginBottom) || 0;
    assistant.inert = false; assistant.setAttribute('aria-hidden', 'false');
    promotion = dockAssistant(origin, assistant, { to: { left: rect.right - visible + ml, top: rect.top + mt, width: visible - ml - mr, height: rect.height - mt - mb }, arrive: ({ animate }) => change(false, { panelMotion: false, animate, promoting: true }), complete });
    // Reduced motion completes synchronously, before a handle is returned.
    if (!promotion) { update(); complete(); }
  }
  return { revealAssistant() { if (!promotion) change(false); }, hideAssistant() { change(true); }, promoteAssistant, cancelPromotion,
    finishPromotion(focus = false) { questionFocus ||= focus; if (promotion) promotion.finish(); else if (focus) { change(false); document.querySelector('#question').focus({ preventScroll: true }); } },
    widen() { cancelPromotion(); const position = beforeChange(); width = width >= 420 ? 360 : 440; update(); persist(); afterChange(position); },
    getState() { return { focused, width }; }, setState(state) { cancelPromotion(); focused = !!state.focused; update(); }, refresh: update };
}
