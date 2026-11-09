// Text and context anchors survive PDF text-layer replacement and page scaling.
export function textAnchor(text, start, end) {
  return { start, end, text: text.slice(start, end), prefix: text.slice(Math.max(0, start - 32), start), suffix: text.slice(end, end + 32) };
}

export function locateTextAnchor(text, anchor) {
  const needle = anchor.text;
  if (!needle) return null;
  if (text.slice(anchor.start, anchor.end) === needle) return { start: anchor.start, end: anchor.end };
  const find = (source, value, prefix, suffix) => {
    let at = source.indexOf(value), candidates = [];
    while (at >= 0) {
      const score = Number(!!prefix && source.slice(Math.max(0, at - prefix.length), at) === prefix) + Number(!!suffix && source.slice(at + value.length, at + value.length + suffix.length) === suffix);
      candidates.push({ start: at, end: at + value.length, score }); at = source.indexOf(value, at + 1);
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.length === 1 || candidates[0]?.score > candidates[1]?.score ? candidates[0] : null;
  };
  const exact = find(text, needle, anchor.prefix, anchor.suffix);
  if (exact) return { start: exact.start, end: exact.end };
  const map = [], compact = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { compact.push(text[i]); map.push(i); }
  const value = needle.replace(/\s/g, '');
  if (!value) return null;
  const match = find(compact.join(''), value, (anchor.prefix || '').replace(/\s/g, ''), (anchor.suffix || '').replace(/\s/g, ''));
  return match ? { start: map[match.start], end: map[match.end - 1] + 1 } : null;
}

function overlaps(a, b) {
  const aStart = a.cloneRange(), aEnd = a.cloneRange(), bStart = b.cloneRange(), bEnd = b.cloneRange();
  aStart.collapse(true); aEnd.collapse(false); bStart.collapse(true); bEnd.collapse(false);
  return aStart.compareBoundaryPoints(0, bEnd) < 0 && aEnd.compareBoundaryPoints(0, bStart) > 0;
}

export class TextHighlights {
  constructor({ root, button, getDocument, getRange, rangeOffsets, save, onSelect, onMessage }) {
    Object.assign(this, { root, button, getDocument, getRange, rangeOffsets, save, onSelect, onMessage });
    this.states = new Map(); this.ranges = []; this.frame = 0; this.pending = false;
    new MutationObserver(() => this.schedule()).observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener('click', event => {
      if (window.getSelection()?.toString().trim()) return;
      const hit = this.ranges.find(item => item.range.startContainer.isConnected && [...item.range.getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom));
      if (!hit) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.onSelect(hit.range.cloneRange(), hit.source);
    }, true);
  }
  load(states) { this.states = new Map(states.map(state => [state.id, state])); this.schedule(); }
  remove(id) { this.states.delete(id); this.schedule(); }
  schedule() { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); }); }
  roots() {
    const doc = this.getDocument();
    return [...this.root.querySelectorAll('.document-paragraph[data-block], .pdf-page > .textLayer')].filter(element => element.style.visibility !== 'hidden').map(element => {
      const blockId = element.dataset.block, block = blockId && doc?.blocks.find(block => block.id === blockId);
      return { element, kind: blockId ? 'block' : 'pdf', blockId, page: block?.page || Number(element.closest('.pdf-page')?.dataset.page) || null };
    });
  }
  capture(range) {
    if (!range || range.collapsed || !this.root.contains(range.commonAncestorContainer)) return [];
    return this.roots().flatMap(({ element, ...source }) => {
      if (!range.intersectsNode(element)) return [];
      const bounds = document.createRange(); bounds.selectNodeContents(element);
      const part = range.cloneRange();
      if (part.compareBoundaryPoints(0, bounds) < 0) part.setStart(bounds.startContainer, bounds.startOffset);
      if (part.compareBoundaryPoints(2, bounds) > 0) part.setEnd(bounds.endContainer, bounds.endOffset);
      if (!part.toString().trim()) return [];
      const prefix = document.createRange(); prefix.selectNodeContents(element); prefix.setEnd(part.startContainer, part.startOffset);
      const start = prefix.toString().length;
      return [{ ...source, ...textAnchor(element.textContent, start, start + part.toString().length) }];
    });
  }
  selected(range) { return this.ranges.filter(item => item.range.startContainer.isConnected && overlaps(range, item.range)); }
  updateButton(range) {
    const available = !!range && !range.collapsed && this.root.contains(range.commonAncestorContainer);
    this.button.hidden = !available;
    const marked = available && this.selected(range).length > 0;
    this.button.setAttribute('aria-pressed', String(marked));
    this.button.querySelector('span:last-child').textContent = marked ? '取消高亮' : '高亮';
    this.button.title = marked ? '取消选中文字的高亮' : '黄色高亮，保存在本机';
  }
  paint() {
    this.ranges = [];
    if (!globalThis.Highlight || !globalThis.CSS?.highlights) return;
    const marks = this.states.get(this.getDocument()?.id)?.marks || [], roots = this.roots();
    for (const source of roots) source.element.classList.remove('has-text-highlights');
    for (const mark of marks) for (const anchor of mark.anchors) {
      const candidates = roots.filter(source => source.kind === anchor.kind ? source.kind === 'block' ? source.blockId === anchor.blockId : source.page === anchor.page : anchor.page && source.page === anchor.page);
      for (const source of candidates) {
        const offset = locateTextAnchor(source.element.textContent, anchor);
        if (!offset) continue;
        const range = this.rangeOffsets(source.element, offset.start, offset.end);
        if (range) { this.ranges.push({ id: mark.id, range, source }); source.element.classList.add('has-text-highlights'); }
      }
    }
    const highlight = new Highlight(...this.ranges.map(item => item.range)); highlight.priority = 2;
    CSS.highlights.set('reader-mark', highlight);
    this.updateButton(this.getRange());
  }
  async toggle(range) {
    if (this.pending) return;
    if (!globalThis.Highlight || !globalThis.CSS?.highlights) throw new Error('当前浏览器不支持文字高亮，请使用新版 Chrome、Edge 或 Safari。');
    const docId = this.getDocument()?.id, anchors = this.capture(range);
    if (!docId || !anchors.length) throw new Error('请先选中正文中的文字。扫描图片需有 OCR 文字层才能画重点。');
    const previous = this.states.get(docId)?.marks || [], ids = new Set(this.selected(range).map(item => item.id));
    const marks = ids.size ? previous.filter(mark => !ids.has(mark.id)) : [...previous, { id: crypto.randomUUID(), createdAt: Date.now(), anchors }];
    const state = { id: docId, marks };
    this.pending = true; this.button.disabled = true;
    try {
      await this.save(state); this.states.set(docId, state);
      this.paint(); this.onMessage(ids.size ? '已取消高亮。' : '已高亮 · 保存在本机');
    } finally { this.pending = false; this.button.disabled = false; }
  }
}
