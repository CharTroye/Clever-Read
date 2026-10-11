import { clampRegion, textInRegion, cropRegion } from './regions.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export class SlideReader {
  constructor(root, { onSelect, onError, onPage }) {
    this.root = root; this.onSelect = onSelect; this.onError = onError; this.onPage = onPage;
    this.generation = 0; this.zoom = 1; this.mode = 'region'; this.current = 1;
    root.addEventListener('pointerdown', event => this.pointerDown(event));
    root.addEventListener('pointermove', event => this.pointerMove(event));
    root.addEventListener('pointerup', event => this.pointerUp(event));
    root.addEventListener('pointercancel', () => { this.drag = null; this.clearSelection(); });
    root.addEventListener('click', event => {
      const whole = event.target.closest('[data-select-whole]');
      const text = event.target.closest('.ppt-text');
      if (whole) { event.stopPropagation(); this.selectRegion(whole.closest('.ppt-slide').querySelector('.slide-canvas'), { x: 0, y: 0, w: 1, h: 1 }).catch(error => this.onError(error.message)); }
      else if (text && this.mode === 'text') {
        event.stopPropagation();
        const slide = this.slideFor(text);
        const block = slide.texts.find(block => block.id === text.dataset.slideText);
        const region = { x: block.x / this.doc.slideWidth, y: block.y / this.doc.slideHeight, w: block.w / this.doc.slideWidth, h: block.h / this.doc.slideHeight };
        this.clearSelection(); this.drawBox(text.closest('.slide-canvas'), region);
        if (this.onSelect({ text: block.text, blockId: block.id, page: slide.page, region, sourceType: 'slide', hasText: true, includeImage: false }, this.clientRect(text.closest('.slide-canvas'), region)) === false) this.clearSelection();
      }
    });
  }
  destroy() { this.generation++; this.doc = null; this.drag = null; }
  render(doc, mode = this.mode, zoom = this.zoom) {
    this.generation++; this.doc = doc; this.mode = mode; this.zoom = zoom; this.drag = null;
    const scroll = this.root.parentElement;
    const style = getComputedStyle(scroll);
    const width = Math.min(850, Math.max(200, scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))) * zoom;
    this.root.className = 'ppt-slides';
    this.root.innerHTML = doc.slides.map(slide => `<section class="ppt-slide" data-page="${slide.page}" aria-label="第 ${slide.page} 张幻灯片"><header><span>第 ${slide.page} 张 / ${doc.slides.length}</span><button type="button" data-select-whole>选择整张幻灯片</button></header><div class="slide-canvas ${mode === 'text' ? 'text-mode' : 'region-mode'}" style="width:${width}px;aspect-ratio:${doc.slideWidth}/${doc.slideHeight}"><img class="slide-image" src="${slide.image}" alt="第 ${slide.page} 张幻灯片，${escape(slide.texts.map(text => text.text).join(' ').slice(0, 300) || '图片内容')}" draggable="false" loading="lazy">${slide.texts.map(text => `<button class="ppt-text" data-slide-text="${escape(text.id)}" style="left:${text.x / doc.slideWidth * 100}%;top:${text.y / doc.slideHeight * 100}%;width:${text.w / doc.slideWidth * 100}%;height:${text.h / doc.slideHeight * 100}%" aria-label="选择文本：${escape(text.text.slice(0, 150))}" title="点击选择这段文字"></button>`).join('')}</div></section>`).join('');
    this.updatePage();
  }
  setMode(mode) {
    this.mode = mode;
    this.root.querySelectorAll('.slide-canvas').forEach(canvas => { canvas.classList.toggle('region-mode', mode === 'region'); canvas.classList.toggle('text-mode', mode === 'text'); });
  }
  clearSelection() { this.root.querySelectorAll('.ppt-region').forEach(box => box.remove()); }
  slideFor(element) { return this.doc?.slides.find(slide => slide.page === Number(element.closest('.ppt-slide')?.dataset.page)); }
  point(event, canvas) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; }
  drawBox(canvas, region) {
    let box = canvas.querySelector('.ppt-region');
    if (!box) { box = document.createElement('div'); box.className = 'ppt-region'; box.setAttribute('aria-hidden', 'true'); canvas.append(box); }
    Object.assign(box.style, { left: region.x * 100 + '%', top: region.y * 100 + '%', width: region.w * 100 + '%', height: region.h * 100 + '%' });
  }
  clientRect(canvas, region) {
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left + region.x * rect.width, top: rect.top + region.y * rect.height, right: rect.left + (region.x + region.w) * rect.width, bottom: rect.top + (region.y + region.h) * rect.height };
  }
  pointerDown(event) {
    const canvas = event.target.closest('.slide-canvas');
    if (!this.doc || !canvas || this.mode !== 'region' || event.button !== 0) return;
    event.preventDefault(); window.getSelection()?.removeAllRanges();
    this.clearSelection();
    canvas.setPointerCapture(event.pointerId);
    this.drag = { canvas, pointerId: event.pointerId, start: this.point(event, canvas), generation: this.generation };
  }
  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drawBox(this.drag.canvas, clampRegion(this.drag.start, this.point(event, this.drag.canvas)));
  }
  pointerUp(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null; drag.canvas.releasePointerCapture(event.pointerId);
    const region = clampRegion(drag.start, this.point(event, drag.canvas));
    const rect = drag.canvas.getBoundingClientRect();
    if (region.w * rect.width < 6 || region.h * rect.height < 6) { this.clearSelection(); return; }
    this.selectRegion(drag.canvas, region).catch(error => this.onError(error.message));
  }
  async selectRegion(canvas, region) {
    const doc = this.doc, generation = this.generation;
    const slide = this.slideFor(canvas);
    if (!slide) return;
    this.clearSelection(); this.drawBox(canvas, region);
    const image = await cropRegion(canvas.querySelector('.slide-image'), region);
    if (generation !== this.generation || doc !== this.doc) return;
    const text = textInRegion(slide, region, doc.slideWidth, doc.slideHeight);
    const block = doc.blocks.find(block => block.page === slide.page && text && block.text.includes(text.split('\n')[0])) || doc.blocks.find(block => block.page === slide.page);
    const accepted = this.onSelect({ text: text || `第 ${slide.page} 张幻灯片的框选图片区域`, blockId: block?.id, page: slide.page, region, image, sourceType: 'slide', hasText: !!text, includeImage: true }, this.clientRect(canvas, region));
    if (accepted === false) this.clearSelection();
  }
  showSelection(selection) {
    this.clearSelection();
    const canvas = this.root.querySelector(`.ppt-slide[data-page="${Number(selection?.page)}"] .slide-canvas`);
    if (canvas && selection.region) this.drawBox(canvas, selection.region);
  }
  updatePage() {
    if (!this.doc) return;
    const top = this.root.parentElement.getBoundingClientRect().top;
    const slides = [...this.root.querySelectorAll('.ppt-slide')];
    const nearest = slides.reduce((best, slide) => Math.abs(slide.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? slide : best, slides[0]);
    this.current = Number(nearest?.dataset.page) || 1;
    this.onPage(this.current, this.doc.pages);
  }
  jump(page, behavior = 'auto') {
    const number = Math.max(1, Math.min(this.doc?.pages || 1, Number(page) || 1));
    this.root.querySelector(`.ppt-slide[data-page="${number}"]`)?.scrollIntoView({ block: 'start', behavior });
    this.current = number; this.onPage(number, this.doc?.pages || 1);
  }
}
