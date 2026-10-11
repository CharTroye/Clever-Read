import { clampRegion, adjustRegion, textInRegion, cropRegion } from './regions.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const handles = { nw: '左上角', n: '上边', ne: '右上角', e: '右边', se: '右下角', s: '下边', sw: '左下角', w: '左边' };

export class SlideReader {
  constructor(root, { onSelect, onError, onPage }) {
    Object.assign(this, { root, onSelect, onError, onPage, generation: 0, revision: 0, zoom: 1, mode: 'region', current: 1 });
    root.addEventListener('pointerdown', event => this.pointerDown(event));
    root.addEventListener('pointermove', event => this.pointerMove(event));
    root.addEventListener('pointerup', event => this.pointerUp(event));
    root.addEventListener('pointercancel', () => this.cancelInteraction());
    root.addEventListener('keydown', event => this.keyDown(event));
    root.addEventListener('click', event => {
      const whole = event.target.closest('[data-select-whole]');
      const text = event.target.closest('.ppt-text');
      if (whole) {
        event.stopPropagation();
        this.selectRegion(whole.closest('.ppt-slide').querySelector('.slide-canvas'), { x: 0, y: 0, w: 1, h: 1 }, true).catch(error => this.onError(error.message));
      } else if (text && this.mode === 'text') {
        event.stopPropagation();
        const block = this.slideFor(text).texts.find(block => block.id === text.dataset.slideText);
        const region = { x: block.x / this.doc.slideWidth, y: block.y / this.doc.slideHeight, w: block.w / this.doc.slideWidth, h: block.h / this.doc.slideHeight };
        this.selectRegion(text.closest('.slide-canvas'), region, false).catch(error => this.onError(error.message));
      }
    });
  }
  destroy() { this.cancelInteraction(); this.clearSelection(); this.generation++; this.doc = null; }
  render(doc, mode = this.mode, zoom = this.zoom) {
    this.cancelInteraction(); this.clearSelection(); this.generation++;
    Object.assign(this, { doc, mode, zoom });
    this.root.className = 'ppt-slides';
    this.root.innerHTML = doc.slides.map(slide => `<section class="ppt-slide" data-page="${slide.page}" aria-label="第 ${slide.page} 张幻灯片"><header><span>第 ${slide.page} 张 / ${doc.slides.length}</span><button type="button" data-select-whole>选择整张幻灯片</button></header><div class="slide-canvas ${mode === 'text' ? 'text-mode' : 'region-mode'}" style="aspect-ratio:${doc.slideWidth}/${doc.slideHeight}"><img class="slide-image" src="${slide.image}" alt="第 ${slide.page} 张幻灯片，${escape(slide.texts.map(text => text.text).join(' ').slice(0, 300) || '图片内容')}" draggable="false" loading="lazy">${slide.texts.map(text => `<button class="ppt-text" data-slide-text="${escape(text.id)}" style="left:${text.x / doc.slideWidth * 100}%;top:${text.y / doc.slideHeight * 100}%;width:${text.w / doc.slideWidth * 100}%;height:${text.h / doc.slideHeight * 100}%" aria-label="选择文本：${escape(text.text.slice(0, 150))}" title="选择这个文字区域"></button>`).join('')}</div></section>`).join('');
    this.resize(); this.updatePage();
  }
  resize() {
    if (!this.doc) return;
    const scroll = this.root.parentElement, style = getComputedStyle(scroll);
    const width = Math.floor(Math.min(850, Math.max(160, scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 1)) * this.zoom);
    this.root.style.setProperty('--slide-width', width + 'px');
  }
  setMode(mode) {
    this.cancelInteraction(); this.mode = mode;
    this.root.querySelectorAll('.slide-canvas').forEach(canvas => { canvas.classList.toggle('region-mode', mode === 'region'); canvas.classList.toggle('text-mode', mode === 'text'); });
  }
  clearSelection() { this.revision++; this.selected = null; this.root.querySelectorAll('.ppt-region').forEach(box => box.remove()); }
  slideFor(element) { return this.doc?.slides.find(slide => slide.page === Number(element.closest('.ppt-slide')?.dataset.page)); }
  point(event, canvas) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; }
  drawBox(canvas, region, editable = true) {
    let box = canvas.querySelector('.ppt-region');
    if (!box) {
      box = document.createElement('div'); box.className = 'ppt-region'; box.tabIndex = 0;
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', '选区：拖动移动，方向键微调，Alt 加方向键调整大小，Esc 取消');
      box.innerHTML = Object.entries(handles).map(([handle, label]) => `<button type="button" class="region-handle handle-${handle}" data-resize="${handle}" tabindex="-1" aria-label="调整选区${label}"></button>`).join('');
      canvas.append(box);
    }
    box.classList.toggle('editing', !editable);
    Object.assign(box.style, { left: region.x * 100 + '%', top: region.y * 100 + '%', width: region.w * 100 + '%', height: region.h * 100 + '%' });
    return box;
  }
  clientRect(canvas, region) {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left + region.x * rect.width, top: rect.top + region.y * rect.height, right: rect.left + (region.x + region.w) * rect.width, bottom: rect.top + (region.y + region.h) * rect.height };
  }
  pointerDown(event) {
    const canvas = event.target.closest('.slide-canvas');
    if (!this.doc || !canvas || this.drag || event.button !== 0) return;
    const box = event.target.closest('.ppt-region');
    if (!box && this.mode !== 'region') return;
    event.preventDefault(); window.getSelection()?.removeAllRanges();
    const previous = this.selected && { ...this.selected, region: { ...this.selected.region } };
    const handle = box && previous?.canvas === canvas ? event.target.closest('[data-resize]')?.dataset.resize || 'move' : 'new';
    this.revision++;
    if (handle === 'new') { this.root.querySelectorAll('.ppt-region').forEach(item => item.remove()); this.selected = null; }
    canvas.setPointerCapture(event.pointerId);
    this.drag = { canvas, pointerId: event.pointerId, start: this.point(event, canvas), previous, handle, region: previous?.region, includeImage: handle === 'new' ? true : previous.includeImage };
  }
  draggedRegion(event) {
    const drag = this.drag, end = this.point(event, drag.canvas), rect = drag.canvas.getBoundingClientRect();
    return drag.handle === 'new' ? clampRegion(drag.start, end) : adjustRegion(drag.previous.region, { x: end.x - drag.start.x, y: end.y - drag.start.y }, drag.handle, { w: 10 / rect.width, h: 10 / rect.height });
  }
  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag.region = this.draggedRegion(event); this.drawBox(this.drag.canvas, this.drag.region, false);
  }
  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const region = this.draggedRegion(event), rect = drag.canvas.getBoundingClientRect();
    if (region.w * rect.width < 6 || region.h * rect.height < 6) { this.cancelInteraction(); return; }
    this.drag = null; drag.canvas.releasePointerCapture(event.pointerId);
    this.selectRegion(drag.canvas, region, drag.includeImage).catch(error => this.onError(error.message));
  }
  cancelInteraction() {
    const drag = this.drag;
    if (!drag) return false;
    this.drag = null; this.revision++;
    if (drag.canvas.hasPointerCapture(drag.pointerId)) drag.canvas.releasePointerCapture(drag.pointerId);
    this.root.querySelectorAll('.ppt-region').forEach(box => box.remove()); this.selected = drag.previous;
    if (this.selected) this.drawBox(this.selected.canvas, this.selected.region);
    return true;
  }
  keyDown(event) {
    if (!event.target.closest('.ppt-region') || !this.selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const { canvas, region, includeImage } = this.selected, rect = canvas.getBoundingClientRect(), step = event.shiftKey ? 10 : 1;
    const delta = { x: event.key === 'ArrowLeft' ? -step / rect.width : event.key === 'ArrowRight' ? step / rect.width : 0, y: event.key === 'ArrowUp' ? -step / rect.height : event.key === 'ArrowDown' ? step / rect.height : 0 };
    const adjusted = adjustRegion(region, delta, event.altKey ? 'se' : 'move', { w: 10 / rect.width, h: 10 / rect.height });
    this.selectRegion(canvas, adjusted, includeImage, true).catch(error => this.onError(error.message));
  }
  async selectRegion(canvas, region, includeImage = true, focus = false) {
    const doc = this.doc, generation = this.generation, slide = this.slideFor(canvas);
    if (!slide) return;
    this.clearSelection(); const revision = this.revision;
    this.selected = { canvas, region: { ...region }, includeImage };
    const box = this.drawBox(canvas, region); if (focus) box.focus({ preventScroll: true });
    const image = includeImage ? await cropRegion(canvas.querySelector('.slide-image'), region) : undefined;
    if (revision !== this.revision || generation !== this.generation || doc !== this.doc) return;
    const text = textInRegion(slide, region, doc.slideWidth, doc.slideHeight);
    const block = doc.blocks.find(block => block.page === slide.page && text && block.text.includes(text.split('\n')[0])) || doc.blocks.find(block => block.page === slide.page);
    if (this.onSelect({ text: text || `第 ${slide.page} 张幻灯片的框选图片区域`, blockId: block?.id, page: slide.page, region, image, sourceType: 'slide', hasText: !!text, includeImage }, this.clientRect(canvas, region)) === false) this.clearSelection();
  }
  showSelection(selection) {
    this.clearSelection();
    const canvas = this.root.querySelector(`.ppt-slide[data-page="${Number(selection?.page)}"] .slide-canvas`);
    if (canvas && selection.region) { this.selected = { canvas, region: { ...selection.region }, includeImage: selection.includeImage }; this.drawBox(canvas, selection.region); }
  }
  updatePage() {
    if (!this.doc) return;
    const top = this.root.parentElement.getBoundingClientRect().top, slides = [...this.root.querySelectorAll('.ppt-slide')];
    const nearest = slides.reduce((best, slide) => Math.abs(slide.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? slide : best, slides[0]);
    this.current = Number(nearest?.dataset.page) || 1; this.onPage(this.current, this.doc.pages);
  }
  jump(page, behavior = 'auto') {
    const number = Math.max(1, Math.min(this.doc?.pages || 1, Number(page) || 1));
    this.root.querySelector(`.ppt-slide[data-page="${number}"]`)?.scrollIntoView({ block: 'start', behavior });
    this.current = number; this.onPage(number, this.doc?.pages || 1);
  }
}
