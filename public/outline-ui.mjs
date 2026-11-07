import { outlineBatches, outlineSamplesFromBlocks, outlineTextProblem, mergeOutline, currentChapter, outlineTree, filterOutlineTree } from './outline.mjs';

export class OutlineSidebar {
  constructor({ getDocument, getConnection, request, save, onNavigate, onLayout, readPosition, onModels, onError }) {
    Object.assign(this, { getDocument, getConnection, request, save, onNavigate, onLayout, readPosition, onModels, onError });
    this.jobs = new Map(); this.collapsed = new Set(); this.query = ''; this.page = 1;
    this.panel = document.querySelector('#outline-panel');
    this.toggle = document.querySelector('#outline-toggle');
    this.wrapper = document.querySelector('#reader-workspace');
    this.open = matchMedia('(min-width:1100px)').matches;
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));
    this.panel.querySelector('[data-outline-close]').addEventListener('click', () => { this.setOpen(false); this.toggle.focus({ preventScroll: true }); });
    this.panel.querySelector('input[type=search]').addEventListener('input', event => { this.query = event.target.value; this.renderEntries(); });
    this.panel.addEventListener('click', event => {
      const branch = event.target.closest('[data-chapter-branch]');
      if (branch) {
        const id = branch.dataset.chapterBranch;
        if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
        const expanded = !this.collapsed.has(id);
        branch.setAttribute('aria-expanded', String(expanded));
        branch.setAttribute('aria-label', `${expanded ? '收起' : '展开'} ${branch.dataset.chapterTitle}`);
        document.getElementById(branch.getAttribute('aria-controls'))?.classList.toggle('hidden', !expanded);
      }
      const chapter = event.target.closest('[data-chapter-page]');
      if (chapter) { this.onNavigate(Number(chapter.dataset.chapterPage)); if (matchMedia('(max-width:1099px)').matches) this.setOpen(false); }
      if (event.target.closest('[data-outline-generate]')) { if (this.getConnection()) this.generate(this.getDocument()); else this.onModels(); }
      if (event.target.closest('[data-outline-stop]')) this.jobs.get(this.getDocument()?.id)?.controller.abort();
      if (event.target.closest('[data-outline-native]')) this.showNative();
    });
    this.panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.setOpen(false); this.toggle.focus({ preventScroll: true }); } });
  }
  setOpen(open) {
    const position = this.readPosition();
    this.open = open;
    this.toggle.setAttribute('aria-expanded', String(open));
    this.onLayout(position, { outlineOpen: open && this.getDocument()?.type === 'pdf' });
  }
  show() {
    this.collapsed.clear();
    this.query = ''; this.panel.querySelector('input[type=search]').value = '';
    const pdf = this.getDocument()?.type === 'pdf';
    if (pdf && !this.entries().length && !this.getDocument().outlineRequested) this.open = false;
    this.toggle.classList.toggle('hidden', !pdf);
    this.panel.classList.toggle('hidden', !pdf);
    this.wrapper.dataset.outlineOpen = String(this.open && pdf);
    this.toggle.setAttribute('aria-expanded', String(this.open && pdf));
    this.render();
  }
  entries() { const doc = this.getDocument(); return doc?.outlineState?.entries || doc?.outline || []; }
  renderEntries() {
    const nav = this.panel.querySelector('nav');
    const tree = filterOutlineTree(outlineTree(this.entries()), this.query);
    const build = entry => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'chapter-link'; button.dataset.chapterPage = entry.page; button.dataset.chapterId = entry.id;
      const title = document.createElement('span'); title.textContent = entry.title;
      const page = document.createElement('small'); page.textContent = entry.page;
      button.title = `${entry.title} · PDF 第 ${entry.page} 页`; button.append(title, page); return button;
    };
    const buildNode = (entry, depth = 1) => {
      const li = document.createElement('li'), row = document.createElement('div'); row.className = 'chapter-row'; row.style.setProperty('--chapter-depth', depth);
      if (entry.children.length) {
        const branch = document.createElement('button'); branch.type = 'button'; branch.className = 'chapter-branch';
        branch.dataset.chapterBranch = entry.id; branch.dataset.chapterTitle = entry.title;
        branch.setAttribute('aria-expanded', String(!!this.query || !this.collapsed.has(entry.id)));
        branch.setAttribute('aria-label', `${this.collapsed.has(entry.id) && !this.query ? '展开' : '收起'} ${entry.title}`);
        branch.setAttribute('aria-controls', 'children-' + entry.id);
        branch.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>'; row.append(branch);
      } else { const spacer = document.createElement('span'); spacer.className = 'chapter-branch-space'; row.append(spacer); }
      row.append(build(entry)); li.append(row);
      if (entry.children.length) {
        const children = document.createElement('ul'); children.id = 'children-' + entry.id;
        children.classList.toggle('hidden', !this.query && this.collapsed.has(entry.id));
        children.append(...entry.children.map(child => buildNode(child, depth + 1))); li.append(children);
      }
      return li;
    };
    const list = document.createElement('ul'); list.className = 'chapter-tree'; list.append(...tree.map(node => buildNode(node)));
    if (!tree.length) { const empty = document.createElement('p'); empty.className = 'outline-empty'; empty.textContent = this.query ? '没有匹配的章节' : '目录生成后会显示在这里。也可以使用下方页码直接跳转。'; nav.replaceChildren(empty); }
    else nav.replaceChildren(list);
    this.updatePage(this.page);
  }
  render() {
    const doc = this.getDocument(); if (doc?.type !== 'pdf') return;
    const state = doc.outlineState || {}, busy = this.jobs.has(doc.id);
    this.panel.querySelector('#outline-status').textContent = busy ? state.message || '正在生成目录…' : state.message || (this.entries().length ? (state.source === 'llm' ? 'AI 目录 · 已保存在本机' : 'PDF 原有目录 · 已保存在本机') : '尚未生成 AI 目录');
    const generate = this.panel.querySelector('[data-outline-generate]');
    generate.disabled = busy;
    generate.textContent = this.getConnection() ? (state.source === 'llm' || state.aiEntries?.length) ? '重新生成' : '生成 AI 目录' : '连接模型生成';
    this.panel.querySelector('[data-outline-stop]').classList.toggle('hidden', !busy);
    const alternate = this.panel.querySelector('[data-outline-native]');
    alternate.classList.toggle('hidden', !(doc.outline?.length && (state.source === 'llm' || state.aiEntries?.length)));
    alternate.disabled = busy;
    alternate.textContent = state.source === 'llm' ? '使用原有目录' : '使用 AI 目录';
    this.panel.querySelector('#outline-search').classList.toggle('hidden', !this.entries().length);
    this.renderEntries();
  }
  updatePage(page) {
    this.page = page;
    const id = currentChapter(this.entries(), page);
    this.panel.querySelectorAll('[data-chapter-id]').forEach(button => {
      if (button.dataset.chapterId === id) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
    });
  }
  async persist(doc, state) {
    await this.save({ id: doc.id, ...state, updatedAt: Date.now() });
    doc.outlineState = state;
    if (this.getDocument()?.id === doc.id) this.render();
  }
  async showNative() {
    const doc = this.getDocument();
    const state = doc.outlineState || {};
    const aiEntries = state.source === 'llm' ? state.entries : state.aiEntries;
    try { await this.persist(doc, { ...state, aiEntries, entries: state.source === 'llm' ? doc.outline : aiEntries, source: state.source === 'llm' ? 'native' : 'llm', status: 'ready', message: '' }); }
    catch { this.onError('目录未能保存，请检查浏览器存储空间。'); }
  }
  async generate(doc) {
    if (!doc || doc.type !== 'pdf' || this.jobs.has(doc.id)) return;
    const connection = this.getConnection();
    if (!connection) {
      await this.persist(doc, { ...(doc.outlineState || { entries: doc.outline || [], source: 'native' }), status: 'needs-model', message: '连接模型后，点击“生成 AI 目录”。' }).catch(this.onError);
      return;
    }
    const samples = doc.outlinePages?.length ? doc.outlinePages : outlineSamplesFromBlocks(doc.blocks);
    const previous = doc.outlineState || { entries: doc.outline || [], source: 'native' };
    const textProblem = outlineTextProblem(samples, doc.pages, doc.unreadablePages);
    if (textProblem) {
      await this.persist(doc, { ...previous, status: 'error', message: textProblem }).catch(() => this.onError(textProblem));
      return;
    }
    const batches = outlineBatches(samples);
    const controller = new AbortController(); this.jobs.set(doc.id, { controller });
    let entries = [], completed = 0, next = 0, failure;
    try {
      await this.persist(doc, { ...previous, status: 'generating', message: `正在生成目录 · 0 / ${batches.length} 批，可继续阅读` });
      const worker = async () => {
        try {
        while (next < batches.length) {
          controller.signal.throwIfAborted();
          const batch = batches[next++];
          const result = await this.request({ ...connection, documentTitle: doc.title, pages: doc.pages, samples: batch }, controller.signal);
          controller.signal.throwIfAborted();
          entries = mergeOutline([...entries, ...result.entries], doc.pages); completed++;
          // Intermediate results stay in memory. Preserve the last saved, complete directory.
          doc.outlineState = { entries: previous.entries, source: previous.source, status: 'generating', message: `正在生成目录 · ${completed} / ${batches.length} 批，可继续阅读` };
          if (this.getDocument()?.id === doc.id) this.render();
        }
        } catch (error) { failure ||= error; controller.abort(); throw error; }
      };
      // At most two requests in flight, even for a large textbook.
      const results = await Promise.allSettled(Array.from({ length: Math.min(2, batches.length) }, worker));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failure || failed.reason;
      controller.signal.throwIfAborted();
      if (!entries.length) throw new Error('未识别到可定位的章节标题。' + (previous.entries?.length ? '已保留原有目录。' : '请检查 PDF 的文字层是否包含章节标题。'));
      await this.persist(doc, { entries, aiEntries: entries, source: 'llm', status: 'ready', model: connection.model, message: 'AI 目录 · 已保存在本机' });
    } catch (error) {
      controller.abort();
      if (doc.removed) return;
      const message = error.name === 'AbortError' ? '生成已停止，原有目录已保留。' : error.message;
      await this.persist(doc, { ...previous, status: 'error', message }).catch(() => this.onError('目录未能保存，请检查浏览器存储空间。'));
    } finally { this.jobs.delete(doc.id); if (this.getDocument()?.id === doc.id) this.render(); }
  }
  remove(doc) { doc.removed = true; this.jobs.get(doc.id)?.controller.abort(); }
}
