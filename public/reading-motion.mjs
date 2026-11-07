// Occasional sidebar changes: retain both sheets and bridge their old/new positions.
const running = new WeakMap();
function allowed() { return document.documentElement.dataset.motion !== 'off' && document.body.dataset.input !== 'keyboard' && !matchMedia('(prefers-reduced-motion: reduce)').matches; }
export function captureReadingMotion(elements) {
  return [...elements].filter(element => { const box = element.getBoundingClientRect(); return box.width && box.bottom > 0 && box.top < innerHeight; }).map(element => {
    const rect = element.getBoundingClientRect();
    running.get(element)?.cancel();
    return { element, rect, page:element.dataset.page };
  });
}
export function finishReadingMotion(snapshot) {
  if (!allowed()) return;
  for (const item of snapshot) {
    let { element, rect } = item;
    if (!element.isConnected && item.page) element = document.querySelector(`.pdf-page[data-page="${Number(item.page)}"]`);
    if (!element?.isConnected) continue;
    const after = element.getBoundingClientRect(); if (!after.width || !after.height) continue;
    const transform = `translate(${rect.left - after.left}px,${rect.top - after.top}px) scale(${rect.width / after.width},${rect.height / after.height})`;
    const easing = getComputedStyle(document.documentElement).getPropertyValue('--ease-in-out').trim() || 'cubic-bezier(0.77, 0, 0.175, 1)';
    const animation = element.animate([{ transform, transformOrigin:'top left' },{ transform:'none', transformOrigin:'top left' }], { duration:220, easing });
    running.set(element, animation);
    animation.finished.catch(() => {}).finally(() => { if (running.get(element) === animation) running.delete(element); });
  }
}
