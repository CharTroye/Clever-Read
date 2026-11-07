import { revealSurface, leaveSurface, layoutTransfer, dockAssistant, motionAllowed } from './motion.mjs';
import { advanceSpring } from './motion-core.mjs';

export function initWorkspaceLayout(prefix, { beforeChange = () => null, duringChange = () => {}, afterChange = () => {} } = {}) {
  const shell = document.querySelector('.app-shell'), reader = document.querySelector('#reader-view');
  const toggle = document.querySelector('#focus-toggle'), separator = document.querySelector('#assistant-resizer');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(prefix + '-reader-layout') || '{}'); } catch {}
  const assistant = document.querySelector('.assistant-panel');
  const workspace = document.querySelector('#reader-workspace'), outline = document.querySelector('#outline-panel');
  let focused = true, width = Math.max(320, Math.min(520, Number(saved.width) || 360)), drag = null, promotion = null, questionFocus = false, lastWidth = 0;
  let paneFrame = 0, paneValue = 0, paneVelocity = 0, paneTarget = 0, paneTime = 0, panePosition = null;
  let outlineValue = 0, outlineVelocity = 0, outlineTarget = 0, outlineWidth = 244, workspaceWidth = workspace.clientWidth;
  let paneGeometry = null;
  const livePdf = () => shell.dataset.view === 'reader' && !!reader.querySelector('.pdf-pages') && reader.dataset.compare !== 'true' && matchMedia('(min-width:801px)').matches;
  function stopPane() { cancelAnimationFrame(paneFrame); paneFrame = 0; paneVelocity = outlineVelocity = 0; paneTime = 0; delete shell.dataset.paneMoving; }
  function preparePane(position) {
    if (paneFrame) return;
    workspaceWidth = workspace.clientWidth;
    outlineWidth = shell.dataset.immersive === 'true' ? Math.max(120, Math.min(244, innerWidth * .16)) : 244;
    outlineValue = outlineTarget = workspace.dataset.outlineOpen === 'true' ? outlineWidth : 0;
    paneValue = paneTarget = focused ? 0 : Number(separator.getAttribute('aria-valuenow'));
    paneVelocity = outlineVelocity = paneTime = 0; panePosition = position;
  }
  function runPane(animate = true) {
    if (animate && motionAllowed()) {
      shell.dataset.paneMoving = 'true';
      if (!paneFrame) paneFrame = requestAnimationFrame(paneTick);
      update(); duringChange(panePosition, paneGeometry);
    } else {
      const position = panePosition;
      outlineValue = outlineTarget; paneValue = paneTarget;
      stopPane(); update(); duringChange(position, paneGeometry); afterChange(position, { live: true });
    }
  }
  const persist = () => { try { localStorage.setItem(prefix + '-reader-layout', JSON.stringify({ width })); } catch {} };
  function setWidth(next) {
    const live = !!paneFrame || livePdf(), readerWidth = live ? workspaceWidth - Math.max(0, Math.min(outlineWidth, outlineValue)) : reader.clientWidth;
    const twoPages = reader.querySelector('.pdf-pages[data-page-layout="double"]');
    const minimum = readerWidth < 840 ? twoPages ? Math.max(150, readerWidth * .3) : 280 : 320;
    const maximum = Math.max(minimum, Math.min(520, readerWidth - 480));
    const visible = Math.round(Math.max(minimum, Math.min(maximum, next)));
    reader.style.setProperty('--assistant-width', visible + 'px');
    separator.setAttribute('aria-valuenow', String(visible)); separator.setAttribute('aria-valuemin', String(minimum)); separator.setAttribute('aria-valuemax', String(maximum));
    if (readerWidth) {
      const desktop = matchMedia('(min-width:801px)').matches;
      const compare = reader.dataset.compare === 'true';
      const shown = live ? paneFrame ? Math.max(0, Math.min(visible, paneValue)) : focused ? 0 : visible : !focused ? visible : 0;
      const fraction = visible ? Math.min(1, shown / visible) : 0;
      const available = (compare && desktop ? readerWidth / 2 : readerWidth) - (desktop && !compare ? shown + 8 * fraction : 0) - (desktop ? 56 : 36);
      const pageWidth = Math.max(160, Math.min(live ? 1160 - 200 * fraction : focused ? 1160 : 960, available));
      reader.style.setProperty('--reading-page-width', pageWidth + 'px');
      reader.style.setProperty('--reading-text-width', Math.max(160, Math.min(focused ? 1040 : 860, available)) + 'px');
      paneGeometry = { readingWidth: readerWidth - shown - 6 * fraction, pageWidth };
    }
    return visible;
  }
  function update(geometryOnly = false) {
    const live = !!paneFrame || livePdf();
    if (live) {
      if (!paneFrame) preparePane(null);
      outline.style.width = Math.max(0, Math.min(outlineWidth, outlineValue)) + 'px';
      workspace.style.setProperty('--outline-width', outlineWidth + 'px');
      outline.style.visibility = outlineValue > 0 || paneFrame ? 'visible' : 'hidden';
    } else {
      if (paneFrame) stopPane();
      outline.style.width = ''; outline.style.visibility = '';
    }
    if (!geometryOnly) {
      shell.dataset.focus = String(focused);
      assistant.inert = focused && !promotion; assistant.setAttribute('aria-hidden', String(focused && !promotion));
      toggle.setAttribute('aria-pressed', String(!focused));
      toggle.setAttribute('aria-label', focused ? '展开原文解读' : '返回专注阅读');
      toggle.title = focused ? '展开原文解读' : '返回专注阅读';
      shell.dataset.pdfPane = String(live);
      outline.inert = workspace.dataset.outlineOpen !== 'true';
      outline.setAttribute('aria-hidden', String(outline.inert));
    }
    const visible = setWidth(width);
    if (live) {
      const shown = paneFrame ? Math.max(0, Math.min(visible, paneValue)) : focused ? 0 : visible;
      reader.style.gridTemplateColumns = `minmax(0, 1fr) ${6 * shown / visible}px ${shown}px`;
      assistant.style.visibility = focused && !paneFrame ? 'hidden' : 'visible';
    } else {
      reader.style.gridTemplateColumns = ''; assistant.style.visibility = '';
    }
    if (geometryOnly) return;
    const widen = document.querySelector('[data-action="widen-assistant"]');
    const wide = width >= 420;
    widen.disabled = (live ? workspaceWidth - outlineValue : reader.clientWidth) < 840;
    widen.setAttribute('aria-pressed', String(wide));
    widen.setAttribute('aria-label', wide ? '恢复解读栏宽度' : '加宽解读栏');
    widen.title = widen.disabled ? '扩大窗口后可加宽解读栏' : wide ? '恢复解读栏宽度' : '加宽解读栏';
  }
  function paneTick(time) {
    if (!livePdf()) { stopPane(); update(); return; }
    const dt = Math.min(.05, Math.max(.001, (time - (paneTime || time - 16)) / 1000)); paneTime = time;
    const left = advanceSpring(outlineValue, outlineVelocity, outlineTarget, dt, .24);
    outlineValue = left.value; outlineVelocity = left.velocity;
    paneTarget = focused ? 0 : setWidth(width);
    const next = advanceSpring(paneValue, paneVelocity, paneTarget, dt, .24);
    paneValue = next.value; paneVelocity = next.velocity;
    if (!motionAllowed() || (Math.abs(paneValue - paneTarget) < .1 && Math.abs(paneVelocity) < 1 && Math.abs(outlineValue - outlineTarget) < .1 && Math.abs(outlineVelocity) < 1)) {
      paneValue = paneTarget; outlineValue = outlineTarget; const position = panePosition; stopPane(); update(); duringChange(position, paneGeometry);
      afterChange(position, { live: true }); return;
    }
    update(true); duringChange(panePosition, paneGeometry);
    paneFrame = requestAnimationFrame(paneTick);
  }
  function cancelPromotion() { const current = promotion; promotion = null; questionFocus = false; current?.cancel(); if (current) update(); }
  function change(next, { panelMotion = true, animate = true, promoting = false } = {}) {
    if (!promoting) cancelPromotion();
    if (next === focused) { update(); return; }
    const position = paneFrame ? panePosition : beforeChange();
    if (livePdf() && !promoting) {
      preparePane(position);
      paneTarget = next ? 0 : setWidth(width); panePosition = position; focused = next;
      if (focused && assistant.contains(document.activeElement)) toggle.focus({ preventScroll: true });
      runPane(animate);
      return;
    }
    const paper = document.querySelector('#document-content'), before = paper.getBoundingClientRect();
    if (next && animate && panelMotion) leaveSurface(assistant);
    focused = next; update(); afterChange(position);
    if (focused && (assistant.contains(document.activeElement) || document.activeElement === toggle)) document.querySelector('.reader-controls button.active')?.focus({ preventScroll: true });
    // PDF redraw restores a page anchor asynchronously and animates each sheet.
    // Translating the entire document here corrupts the coordinates used to restore it.
    if (animate && !paper.classList.contains('pdf-pages')) layoutTransfer(paper, before);
    if (!focused && animate && panelMotion) revealSurface(assistant, 0, 240);
  }
  toggle.addEventListener('click', () => change(!focused));
  separator.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    event.preventDefault(); separator.focus(); separator.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, width: Number(separator.getAttribute('aria-valuenow')), previous: width, id: event.pointerId, position: beforeChange() };
    shell.classList.add('resizing');
  });
  separator.addEventListener('pointermove', event => { if (drag && event.pointerId === drag.id) { width = setWidth(drag.width + drag.x - event.clientX); if (livePdf()) { update(); duringChange(drag.position); } } });
  function finish(cancel = false) {
    if (!drag) return;
    const position = drag.position;
    if (cancel) width = drag.previous;
    if (separator.hasPointerCapture(drag.id)) separator.releasePointerCapture(drag.id);
    drag = null; shell.classList.remove('resizing'); update(); persist(); afterChange(position, { live: livePdf() });
  }
  separator.addEventListener('pointerup', () => finish()); separator.addEventListener('pointercancel', () => finish(true));
  separator.addEventListener('keydown', event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const position = beforeChange(); width = setWidth(event.key === 'Home' ? 320 : event.key === 'End' ? 520 : width + (event.key === 'ArrowLeft' ? 16 : -16)); update(); persist(); afterChange(position);
    }
  });
  new ResizeObserver(() => { const size = workspace.clientWidth; if (size) { if (lastWidth && lastWidth !== size) cancelPromotion(); lastWidth = workspaceWidth = size; update(); } }).observe(workspace);
  update();
  function promoteAssistant(origin, { focusQuestion = false } = {}) {
    cancelPromotion(); questionFocus = focusQuestion;
    if (livePdf()) {
      questionFocus = false; change(false);
      if (focusQuestion) document.querySelector('#question').focus({ preventScroll: true });
      return;
    }
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
    setOutlineOpen(open, position) {
      if (!livePdf()) return false;
      preparePane(position);
      workspace.dataset.outlineOpen = String(open);
      outlineTarget = open ? outlineWidth : 0;
      runPane(); return true;
    },
    finishPromotion(focus = false) { questionFocus ||= focus; if (promotion) promotion.finish(); else if (focus) { change(false); document.querySelector('#question').focus({ preventScroll: true }); } },
    widen() { cancelPromotion(); const position = beforeChange(); width = width >= 420 ? 360 : 440; update(); persist(); afterChange(position); },
    getState() { return { focused, width }; }, setState(state) { stopPane(); cancelPromotion(); focused = !!state.focused; update(); }, refresh: update };
}
