import { advanceSpring, fitRect } from './motion-core.mjs';

const active = new Map(), exits = new WeakMap(), cleanups = new Set();
const identity = { x: 0, y: 0, sx: 1, sy: 1, rotation: 0, opacity: 1 };
let frame = 0, lastTime = 0, flight = null;

export function motionAllowed() {
  return document.documentElement.dataset.motion !== 'off' && document.body.dataset.input !== 'keyboard' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function pose(transform, opacity = 1) {
  const m = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : new DOMMatrixReadOnly();
  const sx = Math.hypot(m.a, m.b) || 1;
  return { x: m.e, y: m.f, sx, sy: (m.a * m.d - m.b * m.c) / sx, rotation: Math.atan2(m.b, m.a) * 180 / Math.PI, opacity: Number(opacity) };
}
function paint(element, state) {
  element.style.transform = `translate3d(${state.x}px,${state.y}px,0) rotate(${state.rotation}deg) scale(${state.sx},${state.sy})`;
  element.style.opacity = String(Math.max(0, Math.min(1, state.opacity)));
}
function relativePose(frame, base, opacity) {
  if (frame.transform === undefined) return { ...base, opacity: Number(frame.opacity ?? opacity) };
  const delta = pose(frame.transform);
  return { x: base.x + delta.x, y: base.y + delta.y, sx: base.sx * delta.sx, sy: base.sy * delta.sy, rotation: base.rotation + delta.rotation, opacity: Number(frame.opacity ?? opacity) };
}
function retire(job, restore = true, cancelled = false) {
  if (active.get(job.element) !== job) return;
  active.delete(job.element);
  if (restore) { job.element.style.transform = job.original.transform; job.element.style.opacity = job.original.opacity; }
  if (cancelled) job.reject(new DOMException('Motion redirected', 'AbortError')); else job.resolve();
}
function tick(time) {
  const dt = Math.min(.5, Math.max(.001, (time - (lastTime || time - 16)) / 1000)); lastTime = time;
  for (const job of active.values()) {
    if (!job.element.isConnected || !motionAllowed()) { retire(job); continue; }
    let moving = false;
    for (const key of Object.keys(identity)) {
      const next = advanceSpring(job.current[key], job.velocity[key], job.target[key], dt, job.response);
      job.current[key] = next.value; job.velocity[key] = next.velocity;
      const epsilon = ['sx', 'sy', 'opacity'].includes(key) ? .0005 : .08;
      if (Math.abs(next.value - job.target[key]) > epsilon || Math.abs(next.velocity) > epsilon * 5) moving = true;
    }
    paint(job.element, job.current);
    job.onUpdate?.(job.current);
    if (!moving) retire(job);
  }
  if (active.size) frame = requestAnimationFrame(tick); else { frame = 0; lastTime = 0; }
}

// A single spring clock for every style. Repeated input retargets live values.
export function move(element, frames, responseMs = 240, options = {}) {
  if (!element) return null;
  const previous = active.get(element);
  if (!motionAllowed()) { if (previous) retire(previous); return null; }
  const computed = getComputedStyle(element), first = frames[0], last = frames.at(-1);
  const base = previous?.base || pose(computed.transform, computed.opacity);
  const start = previous && !options.rebase ? { ...previous.current } : relativePose(first, base, computed.opacity);
  const velocity = { ...Object.fromEntries(Object.keys(identity).map(key => [key, 0])), ...previous?.velocity, ...options.velocity };
  const original = previous?.original || { transform: element.style.transform, opacity: element.style.opacity };
  if (previous) retire(previous, false, true);
  let resolve, reject;
  const finished = new Promise((yes, no) => { resolve = yes; reject = no; }); finished.catch(() => {});
  const job = { element, base, current: start, target: relativePose(last, base, computed.opacity), velocity, original, response: Math.max(.16, Math.min(.4, responseMs / 1000)), resolve, reject, onUpdate: options.onUpdate };
  active.set(element, job); paint(element, start);
  options.onUpdate?.(start);
  if (!frame) frame = requestAnimationFrame(tick);
  return { finished, cancel() { retire(job, true, true); }, finish() { retire(job); } };
}
export function stopMotion() {
  for (const job of [...active.values()]) retire(job);
  for (const cleanup of [...cleanups]) cleanup();
  if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0;
}
function velocityOf(element) { return { ...active.get(element)?.velocity }; }
function visibleRect(element) {
  const r = element?.getBoundingClientRect();
  if (!r?.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) return null;
  return { left: r.left, top: r.top, width: r.width, height: Math.min(r.height, Math.max(80, innerHeight - Math.max(0, r.top) - 20)) };
}
function fixedCopy(element, rect) {
  const clone = element.cloneNode(true), computed = getComputedStyle(element);
  clone.removeAttribute('id'); clone.removeAttribute('popover'); clone.removeAttribute('aria-labelledby');
  const originalsById = element.querySelectorAll('[id]');
  clone.querySelectorAll('[id]').forEach((node, index) => {
    const style = getComputedStyle(originalsById[index]);
    // ID-based layout rules must survive without duplicating live IDs.
    for (const key of ['display', 'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow', 'gap', 'flex', 'flexDirection', 'alignItems', 'justifyContent', 'padding', 'margin', 'minWidth', 'minHeight', 'overflow', 'backgroundColor', 'border', 'borderRadius']) node.style[key] = style[key];
    node.removeAttribute('id');
  });
  clone.querySelectorAll('script,iframe,object,embed').forEach(node => node.remove());
  clone.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; input.removeAttribute('value'); });
  const originals = element.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((canvas, index) => { try { canvas.getContext('2d').drawImage(originals[index], 0, 0); } catch { /* Real pages remain authoritative. */ } });
  if (clone.tagName === 'DIALOG') clone.setAttribute('open', '');
  clone.classList.remove('motion-covered');
  clone.classList.add('motion-flight'); clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
  Object.assign(clone.style, { left: rect.left + 'px', top: rect.top + 'px', right: 'auto', bottom: 'auto', width: rect.width + 'px', height: rect.height + 'px', minHeight: '0', maxHeight: 'none', maxWidth: 'none', display: computed.display, font: computed.font, color: computed.color, boxSizing: 'border-box', transform: 'none', opacity: '1' });
  return clone;
}
export function leaveSurface(element, { distance = 14, axis = 'x', modal = false } = {}) {
  if (!element || !motionAllowed()) return;
  const rect = visibleRect(element); if (!rect) return;
  const opacity = Number(getComputedStyle(element).opacity), velocity = velocityOf(element);
  const entering = active.get(element); if (entering) retire(entering);
  exits.get(element)?.cleanup();
  const ghost = fixedCopy(element, rect); document.body.append(ghost);
  let scrim;
  if (modal) { scrim = document.createElement('div'); scrim.className = 'motion-scrim'; scrim.setAttribute('aria-hidden', 'true'); document.body.append(scrim); }
  const cleanup = () => { const job = active.get(ghost); if (job) retire(job, true, true); ghost.remove(); scrim?.remove(); cleanups.delete(cleanup); if (exits.get(element)?.ghost === ghost) exits.delete(element); };
  exits.set(element, { ghost, cleanup }); cleanups.add(cleanup);
  const animation = move(ghost, [{ opacity, transform: 'none' }, { opacity: 0, transform: `translate${axis.toUpperCase()}(${distance}px)` }], 180, { velocity });
  if (scrim) move(scrim, [{ opacity: 1 }, { opacity: 0 }], 160);
  if (animation) animation.finished.catch(() => {}).finally(cleanup); else cleanup();
}
export function revealSurface(element, distance = 5, response = 200) {
  if (!element || !motionAllowed()) return;
  const exiting = exits.get(element);
  let start = { opacity: .5, transform: `translateY(${distance}px)` }, velocity;
  if (exiting) {
    const from = exiting.ghost.getBoundingClientRect(), to = element.getBoundingClientRect();
    start = { opacity: getComputedStyle(exiting.ghost).opacity, transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` };
    velocity = velocityOf(exiting.ghost); exiting.cleanup();
  }
  return move(element, [start, { opacity: 1, transform: 'none' }], response, { velocity, rebase: !!exiting });
}

// Animate the rendered destination at one uniform scale: no stretched letters.
export function captureTransfer(source) {
  const from = flight ? visibleRect(flight.ghost) : visibleRect(source);
  const velocity = flight ? velocityOf(flight.ghost) : {};
  return target => {
    if (!target || !motionAllowed()) return;
    const to = visibleRect(target);
    if (!from || !to) { revealSurface(target, 4); return; }
    flight?.cleanup();
    const ghost = fixedCopy(target, to), fit = fitRect(from, to);
    document.body.append(ghost); target.classList.add('motion-covered');
    const cleanup = () => { const job = active.get(ghost); if (job) retire(job, true, true); target.classList.remove('motion-covered'); ghost.remove(); cleanups.delete(cleanup); if (flight?.ghost === ghost) flight = null; };
    flight = { ghost, cleanup }; cleanups.add(cleanup);
    const animation = move(ghost, [{ transform: `translate(${fit.x}px,${fit.y}px) scale(${fit.scale})`, opacity: 1 }, { transform: 'none', opacity: 1 }], 280, { velocity });
    if (animation) animation.finished.catch(() => {}).finally(cleanup); else cleanup();
  };
}
export function layoutTransfer(element, before) {
  if (!element || !before || !motionAllowed()) return;
  const after = element.getBoundingClientRect();
  if (!after.width || !before.width) return;
  const previous = active.get(element);
  const x = before.left - after.left + (previous ? previous.current.x - previous.base.x : 0), y = before.top - after.top + (previous ? previous.current.y - previous.base.y : 0);
  if (Math.abs(x) < .5 && Math.abs(y) < .5) return;
  return move(element, [{ transform: `translate(${x}px,${y}px)` }, { transform: 'none' }], 280, { rebase: true });
}
export function questionTransfer(question, origin, target) {
  if (!motionAllowed() || !origin || !target) return;
  const from = origin.getBoundingClientRect(), to = target.getBoundingClientRect();
  const ghost = document.createElement('div'); ghost.className = 'question-flight motion-flight'; ghost.textContent = question;
  ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
  Object.assign(ghost.style, { left: from.left + 'px', top: from.top + 'px', width: Math.min(from.width, to.width) + 'px', maxHeight: from.height + 'px' }); document.body.append(ghost);
  const cleanup = () => { ghost.remove(); cleanups.delete(cleanup); }; cleanups.add(cleanup);
  const animation = move(ghost, [{ transform: 'none', opacity: .85 }, { transform: `translate(${to.left - from.left}px,${to.top - from.top}px)`, opacity: 0 }], 220);
  revealSurface(target, 3, 180);
  if (animation) animation.finished.catch(() => {}).finally(cleanup); else cleanup();
}

// The live assistant carries the word preview to its destination first. Its
// surface then unfolds without scaling any readable text or blocking dismissal.
export function dockAssistant(origin, element, { to, arrive, complete = () => {} }) {
  if (!origin?.rect?.width || !to?.width || !motionAllowed()) { arrive({ animate: false }); complete(); return null; }
  const from = origin.rect, children = [...element.children];
  for (const node of [element, ...children]) { const job = active.get(node); if (job) retire(job); }
  const savedStyle = element.style.cssText;
  const saved = children.map(child => ({ child, style: child.style.cssText, inert: child.inert, hidden: child.getAttribute('aria-hidden') }));
  const surface = document.createElement('div'), preview = document.createElement('div'), edge = document.createElement('div');
  surface.className = 'assistant-morph-surface'; surface.setAttribute('aria-hidden', 'true');
  edge.className = 'assistant-morph-edge'; edge.setAttribute('aria-hidden', 'true');
  preview.className = 'assistant-morph-preview'; preview.style.width = from.width + 'px';
  preview.append(...[...origin.content.childNodes].map(node => node.cloneNode(true)));
  for (const [action, replacement] of [['close-peek', 'collapse-assistant'], ['peek-detail', 'finish-assistant-transition'], ['ask-focus', 'focus-assistant-question']]) {
    const button = preview.querySelector(`[data-action="${action}"]`); if (button) button.dataset.action = replacement;
  }
  element.classList.add('assistant-morphing');
  Object.assign(element.style, { position: 'fixed', left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px', minHeight: '0', margin: '0', transform: 'none', opacity: '1', display: 'flex' });
  element.prepend(surface); element.append(preview, edge);
  for (const { child } of saved) { child.style.opacity = '0'; child.inert = true; child.setAttribute('aria-hidden', 'true'); }
  const sx = from.width / to.width, sy = from.height / to.height;
  let ended = false, arrived = false, unfolding = false, travel, spread;
  const inset = state => {
    const width = state.sx * to.width, height = state.sy * to.height;
    element.style.clipPath = `inset(0 ${Math.max(0, to.width - width)}px ${Math.max(0, to.height - height)}px 0)`;
    edge.style.width = width + 'px'; edge.style.transform = `translateY(${Math.max(0, height - 1)}px)`;
    const progress = Math.max(0, Math.min(1, Math.abs(1 - sy) > .001 ? (state.sy - sy) / (1 - sy) : 1));
    preview.style.opacity = String(1 - progress); preview.inert = progress > .6;
    for (const { child } of saved) { child.style.opacity = String(progress); child.style.transform = `translateY(${(1 - progress) * 4}px)`; child.inert = progress < .25; child.setAttribute('aria-hidden', String(progress < .25)); }
  };
  surface.style.transform = `scale(${sx},${sy})`; inset({ sx, sy });
  const arriveOnce = (animate = true) => { if (!arrived) { arrived = true; arrive({ animate }); } };
  const cleanup = () => {
    if (ended) return; ended = true; cleanups.delete(finish);
    travel?.cancel(); spread?.cancel();
    surface.remove(); preview.remove(); edge.remove(); element.classList.remove('assistant-morphing'); element.style.cssText = savedStyle;
    for (const { child, style, inert, hidden } of saved) { child.style.cssText = style; child.inert = inert; if (hidden === null) child.removeAttribute('aria-hidden'); else child.setAttribute('aria-hidden', hidden); }
  };
  function finish() { if (ended) return; arriveOnce(false); cleanup(); complete(); }
  function expand() {
    if (ended || unfolding) return; unfolding = true; arriveOnce();
    spread = move(surface, [{ transform: `scale(${sx},${sy})` }, { transform: 'none' }], 400, { onUpdate: inset });
    if (spread) spread.finished.then(finish, () => {}); else finish();
  }
  cleanups.add(finish);
  const distance = Math.hypot(from.left - to.left, from.top - to.top);
  travel = move(element, [{ transform: `translate(${from.left - to.left}px,${from.top - to.top}px)` }, { transform: 'none' }], 300, { onUpdate: state => { if (Math.hypot(state.x, state.y) < Math.max(3, distance * .015)) expand(); } });
  if (travel) travel.finished.then(expand, () => {}); else finish();
  return { finish, cancel: cleanup };
}
export function moveStyleFrame() {
  const element = document.querySelector('.style-selection-frame'), selected = document.querySelector('input[name="reading-style"]:checked')?.closest('.style-choice');
  if (!element || !selected?.offsetWidth) return;
  const before = element.getBoundingClientRect(), after = selected.getBoundingClientRect();
  Object.assign(element.style, { left: selected.offsetLeft + 'px', top: selected.offsetTop + 'px', width: selected.offsetWidth + 'px', height: selected.offsetHeight + 'px' });
  if (before.width && before.height) move(element, [{ transform: `translate(${before.left - after.left}px,${before.top - after.top}px) scale(${before.width / after.width},${before.height / after.height})` }, { transform: 'none' }], 240, { rebase: true });
}
export function openDialog(dialog) { if (!dialog.open) dialog.showModal(); revealSurface(dialog, 10, 240); }
export function closeDialog(dialog, value) {
  if (!dialog.open) return;
  leaveSurface(dialog, { axis: 'y', distance: 8, modal: true });
  // An exit tail must not block input or the next dialog.
  dialog.close(value);
}
document.addEventListener('keydown', stopMotion);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopMotion(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', stopMotion);
