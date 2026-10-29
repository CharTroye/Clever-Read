import { addQuote, combinedSelection, sentenceSegments, translationKey } from './connected-reading.mjs';
import { move, motionAllowed } from './motion.mjs';
const $ = selector => document.querySelector(selector);
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ReadingTools {
  constructor(options) {
    Object.assign(this, options);
    this.quotes = []; this.focus = null; this.returnSpot = null; this.translations = new Map(); this.translationRun = 0;
    $('#document-content').addEventListener('pointermove', event => {
      if (!this.comparing || !this.pdfSentenceRanges?.length) return;
      const found = this.pdfSentenceRanges.find(s => [...s.range.getClientRects()].some(r => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom));
      $('#translation-body').querySelectorAll('[data-sentence]').forEach(el => el.classList.toggle('sentence-linked', el.dataset.sentence === found?.id));
    });
    $('#document-content').addEventListener('pointerleave', () => $('#translation-body').querySelectorAll('.sentence-linked').forEach(el => el.classList.remove('sentence-linked')));
    document.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      const action = button.dataset.readingAction;
      if (!action) return;
      event.preventDefault();
      this.act(action, button).catch(error => this.onError(error.message));
    });
    $('#translation-target').addEventListener('change', () => this.translate());
    for (const name of ['pointerover', 'pointerout', 'focusin', 'focusout']) $('#reader-view').addEventListener(name, event => {
      const span = event.target.closest('[data-sentence]'); if (!span) return;
      if ((name === 'pointerout' || name === 'focusout') && span.contains(event.relatedTarget)) return;
      const active = name === 'pointerover' || name === 'focusin';
      $('#reader-view').querySelectorAll('[data-sentence]').forEach(el => el.classList.toggle('sentence-linked', active && el.dataset.sentence === span.dataset.sentence));
    });
    new ResizeObserver(() => this.sizeFocus()).observe($('#reading-scroll'));
  }
  async act(action, button) {
    if (action === 'quote') {
      const block = this.getDoc()?.blocks.find(b => b.id === button.dataset.blockId);
      const selected = block ? { text: block.text, blockId: block.id, page: block.page } : this.getSelection();
      this.quotes = addQuote(this.quotes, selected); this.renderQuotes(); this.remember();
      this.onError(`已加入引用 · ${this.quotes.length} / 4`);
    } else if (action === 'remove-quote') {
      this.quotes.splice(Number(button.dataset.index), 1); this.renderQuotes(); this.remember();
    } else if (action === 'clear-quotes') { this.quotes = []; this.renderQuotes(); this.remember(); }
    else if (action === 'ask-quotes') { this.closeComparison(); this.layout().revealAssistant(); $('#question').focus(); }
    else if (action === 'focus') await this.focusSelection(button.dataset.blockId);
    else if (action === 'restore') this.restoreFocus();
    else if (action === 'source') { this.closeComparison(); this.layout().hideAssistant(); }
    else if (action === 'compare') await this.toggleComparison();
    else if (action === 'translate') await this.translate();
    else if (action === 'stop-translation') this.cancelTranslation();
    else if (action === 'close-comparison') this.closeComparison();
    else if (action === 'return') await this.returnToAnswer();
    else if (action === 'translation-source') await this.locateTranslation(button.dataset.blockId);
  }
  reset(saved = {}) {
    this.cancelTranslation(); this.restoreFocus(false); this.closeComparison(); this.returnSpot = null;
    this.quotes = (saved.quotes || []).filter(q => this.getDoc()?.blocks.some(b => b.id === q.blockId)).slice(0, 4);
    this.translations.clear(); this.pdfSentenceRanges = []; globalThis.CSS?.highlights?.delete('translation-link'); this.renderQuotes(); this.updateContext();
  }
  snapshot() { return this.quotes.map(q => { const value = { ...q }; delete value.image; return value; }); }
  combined() { return combinedSelection(this.quotes, this.getSelection()); }
  renderQuotes() {
    $('#quote-basket').classList.toggle('hidden', !this.quotes.length);
    $('#quote-count').textContent = `引用 ${this.quotes.length} 段`;
    $('#quote-items').innerHTML = this.quotes.map((q, i) => `<div class="quote-item"><button type="button" data-reading-action="translation-source" data-block-id="${escape(q.blockId)}" title="${escape(q.text)}"><small>${q.page ? `第 ${q.page} 页` : `引用 ${i + 1}`}</small><span>${escape(q.includeImage ? '图片区域 · ' + q.text : q.text)}</span></button><button type="button" class="icon-button" data-reading-action="remove-quote" data-index="${i}" aria-label="移除第 ${i + 1} 条引用">×</button></div>`).join('');
    $('#open-quotes').classList.toggle('hidden', !this.quotes.length);
    $('#open-quotes').textContent = `引用 ${this.quotes.length} · 提问`;
    $('#document-content').querySelectorAll('[data-block]').forEach(el => el.closest('.reading-block')?.classList.toggle('has-quote', this.quotes.some(q => q.blockId === el.dataset.block)));
    this.onQuotes();
  }
  updateContext() {
    $('#restore-focus').classList.toggle('hidden', !this.focus);
    $('#return-answer').classList.toggle('hidden', !this.returnSpot);
    $('#reading-context-label').textContent = this.focus ? '聚焦阅读' : this.comparing ? '原文 / 译文对照' : '原文阅读';
  }
  async focusSelection(blockId) {
    const selected = blockId ? this.getDoc().blocks.find(b => b.id === blockId) : this.getSelection();
    if (!selected) throw new Error('先选中一段文字或框选图片，再聚焦。');
    this.restoreFocus(false);
    const root = $('#document-content');
    const paragraph = [...root.querySelectorAll('[data-block]')].find(el => el.dataset.block === (blockId || selected.blockId));
    this.focus = { position: this.readPosition() };
    if (paragraph && root.classList.contains('document-content')) {
      const wrapper = paragraph.closest('.reading-block');
      if (!wrapper) { this.focus = null; return; }
      root.classList.add('content-focused'); wrapper.classList.add('focused-block');
      this.focus.element = wrapper;
      $('#reading-scroll').scrollTop = 0;
      move(wrapper, [{ opacity: .65, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 240);
    } else {
      const page = root.querySelector(`[data-page="${Number(selected.page)}"]`);
      if (!page) { this.focus = null; throw new Error('找不到原文页面，请重新选择。'); }
      if (page.classList.contains('pdf-page')) await this.renderPage(page);
      const canvas = page.querySelector('.slide-canvas');
      const surface = page;
      let region = selected.region;
      if (canvas) {
        const area = surface.getBoundingClientRect(), content = canvas.getBoundingClientRect();
        const part = region || { x: 0, y: 0, w: 1, h: 1 };
        region = { x: (content.left - area.left + part.x * content.width) / area.width, y: (content.top - area.top + part.y * content.height) / area.height, w: part.w * content.width / area.width, h: part.h * content.height / area.height };
      }
      const range = this.getRange();
      if (!region && range && surface.contains(range.commonAncestorContainer)) {
        const area = surface.getBoundingClientRect(), rect = range.getBoundingClientRect();
        region = { x: Math.max(0, (rect.left - area.left) / area.width - .025), y: Math.max(0, (rect.top - area.top) / area.height - .025), w: Math.min(1, rect.width / area.width + .05), h: Math.min(1, rect.height / area.height + .05) };
      }
      region ||= { x: 0, y: 0, w: 1, h: 1 };
      region = { x: Math.max(0, Math.min(.9, region.x)), y: Math.max(0, Math.min(.9, region.y)), w: Math.max(.12, Math.min(1 - region.x, region.w)), h: Math.max(.08, Math.min(1 - region.y, region.h)) };
      region.w = Math.min(1 - region.x, region.w); region.h = Math.min(1 - region.y, region.h);
      const placeholder = document.createComment('focused page'); surface.before(placeholder);
      const viewport = document.createElement('div'); viewport.className = 'reading-focus-viewport';
      root.prepend(viewport); viewport.append(surface);
      Object.assign(this.focus, { surface, placeholder, viewport, region, width: surface.offsetWidth, height: surface.offsetHeight, style: surface.getAttribute('style'), canvas, canvasStyle: canvas?.getAttribute('style') });
      if (canvas) { canvas.style.width = canvas.offsetWidth + 'px'; canvas.style.height = canvas.offsetHeight + 'px'; }
      root.classList.add('region-focused'); this.sizeFocus(); $('#reading-scroll').scrollTop = 0;
      move(viewport, [{ opacity: .6 }, { opacity: 1 }], 180);
    }
    this.updateContext();
  }
  sizeFocus() {
    const f = this.focus; if (!f?.viewport) return;
    const available = Math.max(180, $('#reading-scroll').clientWidth - 60);
    const scale = Math.min(4, available / (f.width * f.region.w));
    f.viewport.style.width = f.width * f.region.w * scale + 'px';
    f.viewport.style.height = f.height * f.region.h * scale + 'px';
    Object.assign(f.surface.style, { position: 'absolute', margin: '0', width: f.width + 'px', height: f.height + 'px', transformOrigin: '0 0', transform: `translate(${-f.region.x * f.width * scale}px, ${-f.region.y * f.height * scale}px) scale(${scale})` });
  }
  restoreFocus(restorePosition = true) {
    const f = this.focus; if (!f) return;
    if (f.surface) { f.placeholder.replaceWith(f.surface); if (f.style === null) f.surface.removeAttribute('style'); else f.surface.setAttribute('style', f.style); if (f.canvas) { if (f.canvasStyle === null) f.canvas.removeAttribute('style'); else f.canvas.setAttribute('style', f.canvasStyle); } f.viewport.remove(); }
    f.element?.classList.remove('focused-block'); $('#document-content').classList.remove('content-focused', 'region-focused');
    this.focus = null; this.updateContext();
    if (restorePosition) this.restorePosition(f.position);
  }
  cancelTranslation() {
    this.translationRun++; this.translationController?.abort(); this.translationController = null;
    $('#translation-stop').classList.add('hidden'); $('#translate-current').disabled = false;
    if (this.translationPending) $('#translation-status').textContent = '翻译已停止，已有译文保留。';
    this.translationPending = false;
  }
  closeComparison() {
    if (!this.comparing) return;
    const position = this.readPosition(); this.comparing = false;
    $('#reader-view').dataset.compare = 'false'; $('#translation-panel').classList.add('hidden');
    $('[data-reading-action="compare"]').setAttribute('aria-pressed', 'false');
    $('#source-mode').setAttribute('aria-pressed', 'true');
    this.layout()?.refresh(); this.fitPages(); this.restorePosition(position); this.updateContext();
  }
  async toggleComparison() {
    if (this.comparing) { this.closeComparison(); return; }
    this.restoreFocus(); this.layout().hideAssistant();
    const position = this.readPosition(); this.comparing = true;
    $('#reader-view').dataset.compare = 'true'; $('#translation-panel').classList.remove('hidden');
    $('[data-reading-action="compare"]').setAttribute('aria-pressed', 'true');
    $('#source-mode').setAttribute('aria-pressed', 'false');
    this.layout().refresh(); this.fitPages(); this.restorePosition(position); this.updateContext();
    $('#translation-body').innerHTML = '<div class="translation-empty"><h2>带着原文，逐句核对。</h2><p>翻译当前选段或页面；已完成的译文保存在本机。</p><button type="button" class="button secondary" data-reading-action="translate">翻译当前内容</button></div>';
    const first = this.currentBlocks()[0];
    if (first) $('#translation-target').value = /[\u4e00-\u9fff]/.test(first.text) ? 'en' : 'zh';
  }
  fitPages() {
    const available = Math.max(160, $('#reading-scroll').clientWidth - 44);
    $('#document-content').querySelectorAll('.pdf-page,.ppt-slide').forEach(page => {
      if (this.comparing && !page.style.zoom) {
        const width = page.classList.contains('ppt-slide') ? page.querySelector('.slide-canvas')?.offsetWidth : page.offsetWidth;
        if (width > available) page.style.zoom = String(available / width);
      } else if (!this.comparing) page.style.removeProperty('zoom');
    });
  }
  currentBlocks() {
    const doc = this.getDoc(), selection = this.getSelection();
    if (selection?.blockId) {
      const start = doc.blocks.findIndex(b => b.id === selection.blockId), end = Math.max(start, doc.blocks.findIndex(b => b.id === selection.endBlockId));
      return doc.blocks.slice(start, end + 1).filter(b => !b.unreadable && !b.heading);
    }
    const scrollRect = $('#reading-scroll').getBoundingClientRect();
    const page = [...$('#document-content').querySelectorAll('.pdf-page,.ppt-slide')].find(el => el.getBoundingClientRect().bottom > scrollRect.top + 40);
    if (page) return doc.blocks.filter(b => b.page === Number(page.dataset.page) && !b.unreadable);
    const block = [...$('#document-content').querySelectorAll('[data-block]')].find(el => el.getBoundingClientRect().bottom > scrollRect.top + 40);
    return doc.blocks.filter(b => b.id === block?.dataset.block);
  }
  async translate() {
    this.cancelTranslation();
    const doc = this.getDoc(), target = $('#translation-target').value, blocks = this.currentBlocks();
    if (!blocks.length) { $('#translation-status').textContent = '当前内容没有可翻译的文字。图片暂不支持翻译。'; return; }
    if (blocks.reduce((n, b) => n + b.text.length, 0) > 12000) { $('#translation-status').textContent = '当前页面文字较多，请选中一段后翻译。'; return; }
    const run = this.translationRun; this.translationController = new AbortController();
    this.translationPending = true; $('#translation-stop').classList.remove('hidden'); $('#translate-current').disabled = true;
    $('#translation-status').textContent = '正在翻译当前内容…';
    try {
      for (const block of blocks) {
        const key = translationKey(doc.id, block, target, this.modelIdentity());
        let entry = this.translations.get(key) || await this.loadTranslation(key);
        if (run !== this.translationRun || doc.id !== this.getDoc().id) return;
        if (!entry) {
          const segments = sentenceSegments(block);
          const translated = await this.requestTranslation(segments, target, this.translationController.signal);
          if (run !== this.translationRun || doc.id !== this.getDoc().id) return;
          entry = { id: key, docId: doc.id, blockId: block.id, source: block.text, target, segments: translated, createdAt: Date.now() };
          await this.saveTranslation(entry);
        }
        this.translations.set(key, entry);
      }
      if (run !== this.translationRun) return;
      $('#translation-body').innerHTML = blocks.map(block => {
        const entry = this.translations.get(translationKey(doc.id, block, target, this.modelIdentity()));
        return `<section class="translated-block"><header><span>${escape(block.section || '原文')}</span><button type="button" data-reading-action="translation-source" data-block-id="${escape(block.id)}">定位原文 ↗</button></header><p>${entry.segments.map(s => `<span data-sentence="${escape(s.id)}">${escape(s.text)}</span>`).join(' ')}</p></section>`;
      }).join('');
      $('#translation-status').textContent = '译文已保存 · 悬停句子可核对原文';
      this.markOriginalSentences(blocks);
    } catch (error) {
      if (run !== this.translationRun || error.name === 'AbortError') return;
      $('#translation-status').textContent = `${error.message} 已有译文保留，可重试。`;
    } finally { if (run === this.translationRun) { this.translationPending = false; $('#translation-stop').classList.add('hidden'); $('#translate-current').disabled = false; } }
  }
  markOriginalSentences(blocks) {
    const root = $('#document-content');
    if (root.classList.contains('document-content')) { this.pdfSentenceRanges = []; return; }
    if (!globalThis.Highlight || !CSS.highlights) return;
    // PDF text items may not match extracted paragraphs exactly. Only exact, unique matches link.
    this.pdfSentenceRanges = [];
    for (const block of blocks) {
      const layer = root.querySelector(`.pdf-page[data-page="${Number(block.page)}"] .textLayer`);
      if (!layer) continue;
      const text = layer.textContent, offsets = [];
      let compact = '';
      for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) { offsets.push(i); compact += text[i]; }
      for (const sentence of sentenceSegments(block)) {
        const needle = sentence.text.replace(/\s/g, ''), start = compact.indexOf(needle);
        if (start < 0 || compact.indexOf(needle, start + 1) >= 0) continue;
        const range = this.rangeOffsets(layer, offsets[start], offsets[start + needle.length - 1] + 1);
        if (range) this.pdfSentenceRanges.push({ id: sentence.id, range });
      }
    }
    $('#translation-body').onpointerover = event => {
      const id = event.target.closest('[data-sentence]')?.dataset.sentence;
      const found = this.pdfSentenceRanges.find(s => s.id === id);
      if (found) CSS.highlights.set('translation-link', new Highlight(found.range)); else CSS.highlights.delete('translation-link');
    };
    $('#translation-body').onpointerleave = () => CSS.highlights.delete('translation-link');
  }
  async locateTranslation(blockId) {
    const block = this.getDoc().blocks.find(b => b.id === blockId);
    if (block) await this.locate(block);
  }
  async navigateSource(block, navigate) {
    this.returnSpot = { position: this.readPosition(), assistantScroll: $('#assistant-body').scrollTop, focused: this.layout().getState().focused };
    this.restoreFocus(false); this.closeComparison(); this.layout().hideAssistant();
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    await navigate(); this.updateContext();
  }
  async returnToAnswer() {
    const spot = this.returnSpot; if (!spot) return;
    this.returnSpot = null; this.restoreFocus(false); this.closeComparison();
    if (!spot.focused) this.layout().revealAssistant();
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    this.restorePosition(spot.position); $('#assistant-body').scrollTop = spot.assistantScroll; this.updateContext();
  }
}
