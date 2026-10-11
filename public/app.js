import { normalizeText, selectionAt, retrieveContext, exportMarkdown, splitParagraphs, normalizeEndpoint, normalizeModelName } from './core.mjs';
import { sampleDocument, glossary, localExplanation } from './sample.mjs';
import { loadPdf, pdfLibrary, importPdf, importDocx } from './documents.mjs';
import { SlideReader } from './slides.mjs';
import { initWorkspaceLayout } from './layout.mjs';
import { readPresentationStream } from './presentation-stream.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paths = {
  book: '<path d="M3 4h6l3 3 3-3h6v15h-6l-3 3-3-3H3z"/><path d="M12 7v15"/>',
  'open-book': '<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z"/><path d="M12 6v15"/>',
  note: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bookmark: '<path d="M6 3h12v19l-6-4-6 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  settings: '<path d="m9 3-1 3-3 1-2 3 2 2v3l3 2 1 4h5l1-4 3-2v-3l2-2-2-3-3-1-1-3z"/><circle cx="11.5" cy="12" r="3"/>',
  sparkles: '<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4M18 4h4"/>',
  refresh: '<path d="M20 8a9 9 0 1 0 1 7M20 3v5h-5"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  message: '<path d="M4 3h16v14H9l-5 4z"/><path d="M8 8h8M8 12h5"/>',
  send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  'arrow-right': '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 12h8M8 16h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="m9 15 6-6M8 17l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }

function syncSegment(group) {
  if (!group?.offsetWidth) return;
  const activeButton = group.querySelector('button.active');
  if (!activeButton) return;
  let thumb = group.querySelector('.segment-thumb');
  const created = !thumb;
  if (created) {
    thumb = document.createElement('span');
    thumb.className = 'segment-thumb';
    thumb.setAttribute('aria-hidden', 'true');
  }
  thumb.style.width = activeButton.offsetWidth + 'px';
  thumb.style.height = activeButton.offsetHeight + 'px';
  thumb.style.transform = `translate(${activeButton.offsetLeft}px, ${activeButton.offsetTop}px)`;
  if (created) group.prepend(thumb);
}

function syncSegments() { $$('[data-segmented]').forEach(syncSegment); }

const surfaceAnimations = new Map();
function revealSurface(element, distance = 4) {
  if (!element) return;
  const previous = surfaceAnimations.get(element);
  const presentation = previous ? getComputedStyle(element) : null;
  const start = presentation ? { opacity: presentation.opacity, transform: presentation.transform } : null;
  previous?.cancel();
  surfaceAnimations.delete(element);
  if (document.body.dataset.input === 'keyboard') return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = element.animate([
    { opacity: start?.opacity ?? .55, transform: reduced ? 'none' : start?.transform ?? `translateY(${distance}px)` },
    { opacity: 1, transform: 'none' }
  ], { duration: reduced ? 100 : 180, easing: 'cubic-bezier(.23, 1, .32, 1)' });
  surfaceAnimations.set(element, animation);
  animation.onfinish = () => { if (surfaceAnimations.get(element) === animation) surfaceAnimations.delete(element); };
}

function stopSurfaceAnimations() {
  for (const animation of surfaceAnimations.values()) animation.cancel();
  surfaceAnimations.clear();
}

function setPressed(selector, isActive) {
  $$(selector).forEach(button => {
    const pressed = isActive(button);
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  });
  syncSegments();
}

document.addEventListener('pointerdown', () => { document.body.dataset.input = 'pointer'; }, { passive: true });
document.addEventListener('keydown', () => { document.body.dataset.input = 'keyboard'; stopSurfaceAnimations(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', stopSurfaceAnimations);
const scrollBehavior = () => document.body.dataset.input === 'keyboard' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

function updateComposer() {
  const button = $('#question-form button');
  button.disabled = !selection || !!requestController;
  button.title = !selection ? '先选择原文，再发送问题' : requestController ? '正在解读，请稍候' : '发送问题（Enter）';
  $('#question-anchor').title = $('#question-anchor').textContent;
  $('#question-anchor').dataset.selected = String(!!selection);
}

function sizeQuestion() {
  const textarea = $('#question');
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(140, Math.max(50, textarea.scrollHeight)) + 'px';
}

let db;
let documents = [];
let records = [];
let active;
let selection = null;
let selectionRange = null;
let currentRecord = null;
let view = 'reader';
let panel = 'explain';
let selectMode = 'word';
let pdfMode = 'reflow';
let fontSize = 18;
let pdfZoom = 1;
let livePdf = null;
let pageObserver = null;
let renderingGeneration = 0;
let requestController = null;
let requestGeneration = 0;
let history = [];
let apiKey = '';
let profiles = [];
let vaultState = { activeId: '', protection: '' };
let vaultError = '';
let editingProfileId = '';
let slideMode = 'region';
let slideZoom = 1;
let importing = false;
let importController = null;
let toastTimer;
let previewExpanded = false;
let workspaceLayout;
const answerCache = new Map();
const qaSession = new URLSearchParams(location.search).get('test-session')?.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
const storagePrefix = qaSession ? `clever-qa-${qaSession}` : 'clever';
const defaults = { enabled: false, endpoint: '', model: '', profileId: '', vision: false, depth: '入门', fontSize: 18, clickAssist: true };
let hadPreferences = false;
let settings = { ...defaults };
try {
  const saved = localStorage.getItem(storagePrefix + '-settings');
  hadPreferences = !!saved;
  settings = { ...defaults, ...JSON.parse(saved || '{}') };
  if (settings.endpoint) settings.endpoint = normalizeEndpoint(settings.endpoint);
  settings.model = normalizeModelName(settings.model, settings.endpoint);
} catch { /* Use safe defaults for an interrupted settings write. */ }

const apiHeaders = () => ({ 'Content-Type': 'application/json', ...(qaSession ? { 'X-Clever-Test-Session': qaSession } : {}) });
const isPresentation = () => ['ppt', 'pptx'].includes(active?.type) && Array.isArray(active?.slides);
const slideReader = new SlideReader($('#document-content'), {
  onSelect: (value, rect) => { const accepted = setSelection(value); if (accepted) showSelectionTools({ getClientRects: () => [rect], getBoundingClientRect: () => rect }); return accepted; },
  onError: toast,
  onPage: (page, total) => { $('#slide-number').value = String(page); $('[data-action="slide-previous"]').disabled = page <= 1; $('[data-action="slide-next"]').disabled = page >= total; }
});

async function vaultRequest(path = '/api/vault', options = {}) {
  const response = await fetch(path, { ...options, headers: { ...apiHeaders(), ...options.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '无法连接本机模型库，请重启 App 服务。');
  profiles = value.profiles || [];
  vaultState = { activeId: value.activeId || '', protection: value.protection || '' };
  vaultError = '';
  return value;
}

function applyProfile(profile, enabled = true) {
  apiKey = '';
  settings = { ...settings, profileId: profile.id, endpoint: profile.endpoint, model: profile.model, vision: profile.vision, enabled };
}

async function loadVault() {
  try {
    await vaultRequest();
    const profile = profiles.find(profile => profile.id === vaultState.activeId);
    if (profile) applyProfile(profile, hadPreferences ? settings.enabled : true);
    else if (settings.profileId) settings = { ...settings, profileId: '', enabled: false };
  } catch (error) { vaultError = '无法读取模型库，请确认已启动新版 App 服务。' + error.message; }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4300);
}

function storage(store, method, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, method === 'getAll' ? 'readonly' : 'readwrite');
    const request = tx.objectStore(store)[method](value);
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('浏览器存储失败。'));
    tx.onabort = () => reject(tx.error || new Error('浏览器存储操作已取消。'));
  });
}

async function openStorage() {
  db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(qaSession ? 'clever-read-qa-' + qaSession : 'clever-read', 1);
    request.onupgradeneeded = () => {
      for (const name of ['documents', 'records']) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  [documents, records] = await Promise.all([storage('documents', 'getAll'), storage('records', 'getAll')]);
  if (!documents.some(d => d.id === sampleDocument.id)) {
    const sample = structuredClone(sampleDocument);
    await storage('documents', 'put', sample);
    documents.unshift(sample);
  }
  documents.sort((a, b) => b.createdAt - a.createdAt);
  records.sort((a, b) => b.createdAt - a.createdAt);
}

function persistPreferences() {
  try { localStorage.setItem(storagePrefix + '-settings', JSON.stringify(settings)); }
  catch { toast('设置未能保存，请检查浏览器存储空间。'); }
}

function updateCounts() {
  $('#notes-count').textContent = records.length;
  $('#terms-count').textContent = records.filter(r => r.starred).length;
  const count = records.filter(r => r.docId === active?.id).length;
  $('#history-count').textContent = count;
}

function renderLibrary() {
  $('#document-switch').innerHTML = documents.map(doc => `<option value="${escape(doc.id)}" ${doc.id === active?.id ? 'selected' : ''}>${escape(doc.title)}${doc.type !== 'sample' ? ' · ' + doc.type.toUpperCase() : ''}</option>`).join('');
  $('#document-list').innerHTML = documents.map(doc => `<div class="document-item ${doc.id === active?.id ? 'active' : ''}"><button class="document-open" data-document="${escape(doc.id)}" title="${escape(doc.title)}">${icon('file')}<div><span class="document-name">${escape(doc.title)}</span><span class="document-sub">${doc.type === 'sample' ? '教学示例' : doc.type.toUpperCase()} · ${doc.pages ? doc.pages + ' 页' : doc.blocks.length + ' 段'}</span></div></button>${doc.type !== 'sample' ? `<button class="icon-button document-delete" data-delete-document="${escape(doc.id)}" aria-label="移除 ${escape(doc.title)}">${icon('close')}</button>` : ''}</div>`).join('');
  updateCounts();
}

function annotateTerms(text) {
  if (active?.type !== 'sample') return escape(text);
  const terms = glossary.map(g => g.term).filter(t => t.length > 5).sort((a, b) => b.length - a.length);
  const pattern = new RegExp('\\b(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  let last = 0;
  let output = '';
  for (const match of text.matchAll(pattern)) {
    output += escape(text.slice(last, match.index)) + `<span class="term-inline" data-term="${escape(match[0])}">${escape(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return output + escape(text.slice(last));
}

function renderText() {
  let lastSection = null;
  let body = '';
  for (const block of active.blocks) {
    if (block.section !== lastSection) {
      body += `<h2 class="document-section">${escape(block.section)}</h2>`;
      lastSection = block.section;
    }
    if (block.heading) continue;
    body += block.unreadable ? `<p class="pdf-warning">${escape(block.text)}</p>` : `<p class="document-paragraph" data-block="${escape(block.id)}" data-section="${escape(block.section)}">${annotateTerms(block.text)}</p>`;
  }
  const chars = active.blocks.reduce((n, b) => n + b.text.length, 0);
  const minutes = Math.max(1, Math.ceil(chars / 950));
  $('#document-content').className = 'document-content';
  $('#document-content').innerHTML = `<div class="document-kicker"><span class="doc-type-pill">${active.type === 'sample' ? '教学示例' : escape(active.type.toUpperCase())}</span><span>在原文里理解与提问</span></div><h1>${escape(active.title)}</h1>${active.subtitle ? `<p class="document-subtitle">${escape(active.subtitle)}</p>` : ''}<div class="document-byline"><span>${icon('file')}${escape(active.author || (active.type === 'docx' ? 'Word 正文 · 流式阅读' : '本地文档'))}</span><span>${icon('clock')}约 ${minutes} 分钟</span>${active.pages ? `<span>${active.pages} 页</span>` : ''}</div><div class="reading-hint">${icon('sparkles')}点击词语查看解释，或选中一句话对原文提问。</div>${active.type === 'pdf' ? '<div class="pdf-warning">流式阅读可能改变双栏与公式顺序，可切换“原版”核对排版。</div>' : ''}${body}`;
}

async function teardownPdf() {
  renderingGeneration++;
  pageObserver?.disconnect();
  pageObserver = null;
  const oldPdf = livePdf;
  livePdf = null;
  if (oldPdf) await oldPdf.destroy();
}

async function renderOriginalPdf() {
  const generation = renderingGeneration;
  $('#document-content').className = 'pdf-pages';
  $('#document-content').innerHTML = '<div class="pdf-placeholder">正在打开原版 PDF…</div>';
  const docId = active.id;
  const loaded = await loadPdf(active.blob);
  if (docId !== active.id || pdfMode !== 'original' || generation !== renderingGeneration) { await loaded.destroy(); return; }
  livePdf = loaded;
  const first = await loaded.getPage(1);
  const firstViewport = first.getViewport({ scale: 1 });
  const readingStyle = getComputedStyle($('#reading-scroll'));
  const available = Math.max(200, $('#reading-scroll').clientWidth - parseFloat(readingStyle.paddingLeft) - parseFloat(readingStyle.paddingRight));
  const width = Math.min(850, available) * pdfZoom;
  const scale = width / firstViewport.width;
  $('#document-content').innerHTML = Array.from({ length: loaded.numPages }, (_, i) => `<div class="pdf-page" data-page="${i + 1}" style="width:${width}px;height:${firstViewport.height * scale}px"><span class="pdf-page-label">${i + 1} / ${loaded.numPages}</span><div class="pdf-placeholder">第 ${i + 1} 页</div></div>`).join('');
  pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) renderPdfPage(entry.target, loaded, generation).catch(error => {
      if (generation === renderingGeneration) toast('PDF 页面渲染失败：' + error.message);
    });
  }, { root: $('#reading-scroll'), rootMargin: '700px 0px' });
  $$('.pdf-page').forEach(page => pageObserver.observe(page));
}

async function renderPdfPage(element, pdf = livePdf, generation = renderingGeneration) {
  if (!pdf || element.dataset.rendered || element.dataset.rendering) return;
  element.dataset.rendering = 'true';
  try {
    const page = await pdf.getPage(Number(element.dataset.page));
    if (generation !== renderingGeneration) return;
    const viewport = page.getViewport({ scale: element.clientWidth / page.getViewport({ scale: 1 }).width });
    element.style.height = viewport.height + 'px';
    element.style.setProperty('--scale-factor', viewport.scale);
    element.style.setProperty('--total-scale-factor', viewport.scale);
    const canvas = document.createElement('canvas');
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    const number = document.createElement('span');
    number.className = 'pdf-page-label';
    number.textContent = `${element.dataset.page} / ${pdf.numPages}`;
    element.replaceChildren(canvas, layer, number);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
    if (generation !== renderingGeneration) return;
    const library = await pdfLibrary();
    await new library.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport }).render();
    element.dataset.rendered = 'true';
  } finally { delete element.dataset.rendering; }
}

function stopRequest() {
  requestGeneration++;
  requestController?.abort();
  requestController = null;
  updateComposer();
}

function clearSelection() {
  slideReader.cancelInteraction();
  selection = null; selectionRange = null; history = [];
  previewExpanded = false;
  $('#selection-tools').classList.add('hidden');
  globalThis.CSS?.highlights?.delete('read-selection');
  slideReader.clearSelection();
  $('#question-anchor').textContent = '先在原文中选择一个词或句子';
  updateComposer();
}

async function openDocument(id, restorePosition = true) {
  const previousDocument = active?.id;
  clearTimeout(scrollTimer);
  stopRequest(); clearSelection(); currentRecord = null; panel = 'explain';
  await teardownPdf();
  slideReader.destroy();
  active = documents.find(d => d.id === id) || documents[0];
  pdfMode = 'reflow'; pdfZoom = 1;
  slideMode = 'region'; slideZoom = 1;
  view = 'reader';
  updateView(); renderLibrary(); renderAssistant();
  if (isPresentation()) {
    $('#slide-number').innerHTML = active.slides.map(slide => `<option value="${slide.page}">${slide.page} / ${active.pages}</option>`).join('');
    slideReader.render(active, slideMode, slideZoom);
  } else renderText();
  $('#pdf-mode').classList.toggle('hidden', active.type !== 'pdf');
  setPressed('[data-pdf-mode]', b => b.dataset.pdfMode === pdfMode);
  $('#ppt-mode').classList.toggle('hidden', !isPresentation());
  $('#slide-navigation').classList.toggle('hidden', !isPresentation());
  $('[data-select-mode]').closest('.reading-mode').classList.toggle('hidden', isPresentation());
  $('#click-assist').closest('label').classList.toggle('hidden', isPresentation());
  setPressed('[data-slide-mode]', b => b.dataset.slideMode === slideMode);
  $('#slide-hint').textContent = '拖动框选图片或文字，再向右侧助手提问';
  $('#font-value').textContent = isPresentation() ? '100%' : fontSize;
  $('#breadcrumb-title').textContent = active.title;
  $('#doc-meta').textContent = isPresentation() ? `${active.pages} 张幻灯片 · ${active.renderer || '演示文稿'} 原版` : active.type === 'sample' ? '原创教学示例 · 可点击标记术语' : active.type === 'pdf' ? `${active.pages} 页 PDF · 本地解析` : active.type === 'docx' ? 'Word 正文 · 本地解析' : '文本 · 本地保存';
  try { localStorage.setItem(storagePrefix + '-active', active.id); } catch { /* Nonessential preference. */ }
  requestAnimationFrame(() => { $('#reading-scroll').scrollTop = restorePosition ? active.scrollTop || 0 : 0; updateProgress(); });
  if (previousDocument && previousDocument !== active.id) revealSurface($('#document-content'));
}

function updateView() {
  $('#focus-toggle').classList.toggle('hidden', view !== 'reader');
  $('#reader-view').classList.toggle('hidden', view !== 'reader');
  $('#collection-view').classList.toggle('hidden', view === 'reader');
  $$('[data-view]').forEach(b => {
    const current = b.dataset.view === view;
    b.classList.toggle('active', current);
    if (current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  syncSegment($('.main-nav'));
  $('#view-label').textContent = view === 'reader' ? '阅读工作台' : view === 'notes' ? '阅读记录' : '我的术语本';
  $('#breadcrumb-title').textContent = view === 'reader' ? active?.title || '' : '我的阅读空间';
  if (view !== 'reader') { $('#selection-tools').classList.add('hidden'); renderCollection(); }
}

function quoteHtml(selected) {
  if (!selected) return '';
  const image = selected.image && /^data:image\/(jpeg|png);base64,/.test(selected.image) ? escape(selected.image) : '';
  const page = selected.page ? '第 ' + selected.page + (selected.sourceType === 'slide' ? ' 张' : ' 页') : '原文';
  return `<section class="selected-quote"><details class="selection-preview"${previewExpanded ? ' open' : ''}><summary>${image ? `<img class="selection-thumb" src="${image}" alt="选区缩略图">` : `<span class="selection-thumb text-thumb">${icon('note')}</span>`}<span class="selection-summary"><strong>${page} · ${selected.includeImage ? '图片与文字' : '文字选区'}</strong><span>${escape(selected.hasText === false ? '框选的图片区域' : selected.text.slice(0, 75))}</span><small>点击查看选区</small></span>${icon('chevron')}</summary><div class="selection-detail">${image ? `<img class="region-preview" src="${image}" alt="框选区域截图">` : ''}<div class="selected-text">${escape(selected.text)}</div><p class="region-caption">${selected.includeImage ? '提问时发送这张截图及选区文字' : '提问时仅发送选区文字'}</p></div></details><button class="selection-cancel icon-button" data-action="dismiss-selection" aria-label="取消选区" title="取消选区（Esc）">${icon('close')}</button></section>`;
}

function renderAssistant() {
  setPressed('[data-panel]', b => b.dataset.panel === panel);
  updateComposer();
  const target = $('#assistant-body');
  target.setAttribute('aria-busy', 'false');
  if (panel === 'history') {
    const docRecords = records.filter(r => r.docId === active?.id);
    target.innerHTML = docRecords.length ? docRecords.map(r => `<div class="mini-record"><button data-record="${escape(r.id)}"><strong>${escape(r.result.title)}</strong><p>${escape(r.question || r.selected.text)}</p><span>${timeLabel(r.createdAt)} · ${r.result.mode === 'model' ? '模型解读' : '本地辅助'}</span></button></div>`).join('') : '<div class="empty-collection"><p>本篇还没有阅读记录。<br>选中一段原文，开始第一个问题。</p></div>';
    return;
  }
  if (currentRecord) { renderAnswer(currentRecord); return; }
  if (selection) {
    const visionNote = selection.image && selection.includeImage && !settings.vision ? `<div class="vision-notice">图片提问需要支持图片输入的模型。${selection.hasText ? '<button data-action="text-only">仅用选区文字提问</button>' : ''}<button data-action="settings">选择视觉模型</button></div>` : '';
    target.innerHTML = quoteHtml(selection) + visionNote + '<h2 class="answer-title">针对选区提问</h2><p class="answer-summary">在下方输入问题，也可以直接解释选区或拆解逻辑。</p><div class="answer-actions"><button data-action="explain">' + icon('sparkles') + '解释选区</button><button data-action="logic">' + icon('layers') + '拆解逻辑</button></div>';
    return;
  }
  target.innerHTML = `<div class="assistant-welcome"><div class="welcome-hero"><div class="welcome-symbol">${icon('open-book')}</div><h2>选中原文，开始提问。</h2></div><p>点击一个术语，或选中一句话。<br>带着原文，解释、拆解与追问。</p><div class="suggestion-heading">${active?.type === 'sample' ? '从这篇示例开始' : modelReady() ? '模型已就绪，选中原文即可提问' : '连接模型后，可解读导入的文档'}</div>${active?.type === 'sample' ? `<button class="suggestion" data-demo="term" aria-label="解释 “self-attention”">${icon('sparkles')}<div><strong>理解一个概念</strong><small>“self-attention” 是什么意思？</small></div>${icon('arrow-right')}</button><button class="suggestion" data-demo="sentence" aria-label="针对一句话提问">${icon('layers')}<div><strong>读懂一句话</strong><small>定位疑问，再拆解逻辑</small></div>${icon('arrow-right')}</button>` : modelReady() ? '' : `<button class="suggestion" data-action="settings">${icon('settings')}<div><strong>设置问答模型</strong><small>连接你的模型，继续追问原文</small></div>${icon('arrow-right')}</button>`}</div>`;
}

function renderAnswer(record) {
  const r = record.result;
  const sources = record.contexts.filter(c => r.sources.includes(c.id));
  const question = record.question ? `<div class="answer-mode">${icon('message')}${escape(record.question)}</div>` : '';
  $('#assistant-body').innerHTML = `${quoteHtml(record.selected)}<div class="answer-mode">${icon(r.mode === 'model' ? 'sparkles' : 'book')}${r.mode === 'model' ? '模型解读 · ' + escape(record.depth) : '本地辅助 · 未调用模型'}</div>${question}<h2 class="answer-title">${escape(r.title)}</h2><div class="answer-summary">${escape(r.summary)}</div>${r.context ? `<div class="answer-section-title">${icon('open-book')}本文语境</div><div class="answer-context">${escape(r.context)}</div>` : ''}${r.logic.length ? `<div class="answer-section-title">${icon('layers')}逻辑拆解</div><ol class="answer-logic">${r.logic.map(item => `<li>${escape(item)}</li>`).join('')}</ol>` : ''}${sources.length ? `<div class="answer-section-title">${icon('link')}${r.mode === 'model' ? '原文依据' : '相关原文'}</div>${sources.map(c => `<button class="source-card" data-source="${escape(c.id)}"><span class="source-meta">${icon('file')}${escape(c.page ? '第 ' + c.page + ' 页' : c.section)} · 返回原文</span><span class="source-text">${escape(c.text)}</span></button>`).join('')}` : ''}<div class="answer-limits">${escape(r.limitations)}</div><div class="answer-actions"><button data-action="star-current">${icon(record.starred ? 'check' : 'bookmark')}${record.starred ? '已加入术语本' : '加入术语本'}</button><button data-action="copy-answer">${icon('copy')}复制</button>${r.mode !== 'model' ? `<button data-action="settings">${icon('settings')}连接模型</button>` : ''}</div>${r.mode === 'model' ? '<div class="followup-heading">继续想一想</div><button class="followup" data-followup="这段内容依赖哪些假设？">这段内容依赖哪些假设？</button><button class="followup" data-followup="能用一个具体例子解释吗？">能用一个具体例子解释吗？</button>' : ''}`;
}

function timeLabel(timestamp) { return new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }); }

function renderCollection() {
  $('#collection-title').textContent = view === 'terms' ? '我的术语本' : '阅读记录';
  $('#collection-description').textContent = view === 'terms' ? '记住概念，也保留它出现的语境。' : '保存的疑问与解读，随时回到原文。';
  const query = $('#record-search').value.toLowerCase().trim();
  const filtered = records.filter(r => (view !== 'terms' || r.starred) && `${r.result.title} ${r.result.summary} ${r.selected.text} ${r.question} ${r.docTitle}`.toLowerCase().includes(query));
  $('#records-list').innerHTML = filtered.length ? filtered.map(r => `<article class="record-card"><div class="record-card-meta"><span>${escape(r.docTitle)}</span><span>${timeLabel(r.createdAt)}</span></div><h2>${escape(r.result.title)}</h2><blockquote>${escape(r.selected.text)}</blockquote><p>${escape(r.result.summary)}</p><div class="record-card-footer"><button data-record="${escape(r.id)}">${icon('open-book')}查看解读</button><button data-delete-record="${escape(r.id)}" aria-label="删除这条记录">${icon('trash')}</button></div></article>`).join('') : `<div class="empty-collection">${icon(view === 'terms' ? 'bookmark' : 'note')}<p>${query ? '没有找到匹配的记录。' : view === 'terms' ? '术语本还空着。<br>在解读中点击“加入术语本”，保存值得记住的概念。' : '还没有阅读记录。<br>打开文档，选中内容，开始提问。'}</p></div>`;
}

function setSelection(value, range) {
  const text = normalizeText(value.text);
  if (!text) return false;
  if (text.length > 8000) { toast('选区过长，请选择不超过 8000 字的一段内容。'); return false; }
  const changed = !selection || selection.text !== text || selection.blockId !== value.blockId || JSON.stringify(selection.region) !== JSON.stringify(value.region) || selection.includeImage !== value.includeImage;
  if (changed) { stopRequest(); history = []; currentRecord = null; previewExpanded = false; }
  selection = { ...value, text };
  selectionRange = range?.cloneRange() || null;
  panel = 'explain';
  if (selectionRange && globalThis.Highlight && CSS.highlights) CSS.highlights.set('read-selection', new Highlight(selectionRange));
  $('#question-anchor').textContent = '针对选区：' + text;
  renderAssistant();
  return true;
}

function blockForNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const p = element?.closest('[data-block]');
  if (p) return { block: active.blocks.find(b => b.id === p.dataset.block), element: p };
  const pdf = element?.closest('.pdf-page');
  if (pdf) {
    const page = Number(pdf.dataset.page);
    const selectedText = window.getSelection()?.toString().trim() || element.textContent.trim();
    const block = active.blocks.find(b => b.page === page && !b.unreadable && b.text.toLowerCase().includes(normalizeText(selectedText).toLowerCase())) || active.blocks.find(b => b.page === page && !b.unreadable);
    return block ? { block, element: pdf } : null;
  }
  return null;
}

function showSelectionTools(range) {
  if (!range) return;
  const rects = Array.from(range.getClientRects());
  const rect = rects.at(-1) || range.getBoundingClientRect();
  const toolbar = $('#selection-tools');
  toolbar.classList.remove('hidden');
  const x = Math.min(window.innerWidth - toolbar.offsetWidth - 8, Math.max(8, rect.left));
  const y = rect.bottom + toolbar.offsetHeight + 12 > window.innerHeight ? Math.max(8, rect.top - toolbar.offsetHeight - 10) : rect.bottom + 10;
  toolbar.style.left = x + 'px'; toolbar.style.top = y + 'px';
}

function rangeForOffsets(element, start, end) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let count = 0, begun = false, node;
  while ((node = walker.nextNode())) {
    const length = node.textContent.length;
    if (!begun && start <= count + length) { range.setStart(node, Math.max(0, start - count)); begun = true; }
    if (begun && end <= count + length) { range.setEnd(node, Math.max(0, end - count)); return range; }
    count += length;
  }
  return null;
}

function caretAt(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const position = document.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const range = document.createRange(); range.setStart(position.offsetNode, position.offset); range.collapse(true); return range;
}

$('#document-content').addEventListener('pointerup', event => {
  if (event.button !== 0) return;
  const native = window.getSelection();
  if (!native?.toString().trim() || !$('#document-content').contains(native.anchorNode) || !$('#document-content').contains(native.focusNode)) return;
  const range = native.getRangeAt(0);
  const start = blockForNode(range.startContainer);
  const end = blockForNode(range.endContainer);
  if (!start) return;
  if (setSelection({ text: native.toString(), blockId: start.block.id, endBlockId: end?.block.id, page: start.block.page }, range)) showSelectionTools(range);
});

$('#document-content').addEventListener('click', async event => {
  if (!$('#click-assist').checked || event.detail > 1 || window.getSelection()?.toString().trim()) return;
  if (!event.target.closest('.document-paragraph, .textLayer span')) return;
  const caret = caretAt(event.clientX, event.clientY);
  if (!caret || !$('#document-content').contains(caret.startContainer)) return;
  const found = blockForNode(caret.startContainer);
  if (!found) return;
  const nodeElement = caret.startContainer.parentElement;
  const element = found.element.classList.contains('pdf-page') ? nodeElement.closest('.textLayer span') : found.element;
  if (!element) return;
  const prefix = document.createRange(); prefix.selectNodeContents(element);
  try { prefix.setEnd(caret.startContainer, caret.startOffset); } catch { return; }
  const offset = prefix.toString().length;
  let part = selectionAt(element.textContent, offset, selectMode);
  if (selectMode === 'word' && !found.element.classList.contains('pdf-page')) {
    const inline = event.target.closest('[data-term]');
    if (inline) {
      const pre = document.createRange(); pre.selectNodeContents(element); pre.setEndBefore(inline);
      part = { text: inline.textContent, start: pre.toString().length, end: pre.toString().length + inline.textContent.length };
    } else {
      for (const term of glossary.filter(g => g.term.length > 5).sort((a, b) => b.term.length - a.term.length)) {
        const lower = element.textContent.toLowerCase();
        const at = lower.lastIndexOf(term.term, offset);
        if (at >= 0 && offset < at + term.term.length) { part = { text: element.textContent.slice(at, at + term.term.length), start: at, end: at + term.term.length }; break; }
      }
    }
  }
  if (!part?.text) return;
  const range = rangeForOffsets(element, part.start, part.end);
  if (!setSelection({ text: part.text, blockId: found.block.id, page: found.block.page }, range)) return;
  showSelectionTools(range);
  if (selectMode === 'word') await ask('explain');
});

function modelReady() {
  if (!settings.enabled) return false;
  if (!settings.endpoint || !settings.model) return false;
  try { return !!apiKey || !!profiles.find(profile => profile.id === settings.profileId)?.hasKey || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(settings.endpoint).hostname); } catch { return false; }
}

function updateModelStatus() {
  const label = !settings.enabled ? '本地辅助' : modelReady() ? '模型已配置' : '待补充模型设置';
  $('#model-status').innerHTML = icon('message') + `<span class="status-label">${escape(label)}</span>`;
  $('#model-status').dataset.state = modelReady() ? 'ready' : 'local';
  $('#model-status').title = (profiles.find(profile => profile.id === settings.profileId)?.name || label) + ' · ' + (settings.model || '点击设置');
}

async function ask(action, question = '') {
  workspaceLayout?.revealAssistant();
  previewExpanded = false;
  if (!selection) { toast('请先点击词语或选中一段原文。'); return; }
  if (settings.enabled && !modelReady()) { toast('请在设置中补充模型信息或密钥。'); showSettings(); return; }
  if (selection.image && selection.includeImage && (!modelReady() || !settings.vision)) { toast('图片提问需要连接支持图片输入的模型；也可仅使用选区文字。'); renderAssistant(); return; }
  stopRequest();
  const generation = requestGeneration;
  const selected = structuredClone(selection);
  const doc = active;
  const contexts = retrieveContext(doc, selected, question);
  panel = 'explain';
  setPressed('[data-panel]', b => b.dataset.panel === panel);
  $('#selection-tools').classList.add('hidden');
  $('#question-form button').disabled = true;
  $('#assistant-body').setAttribute('aria-busy', 'true');
  $('#assistant-body').innerHTML = quoteHtml(selected) + `<div class="loading-state"><p>${modelReady() ? '正在结合选区和相关原文思考…' : '正在查找内置术语与相关原文…'}</p><div class="loading-bars"><span></span><span></span><span></span></div><button data-action="cancel-request">取消</button></div>`;
  const requestSelection = { ...selected }; delete requestSelection.image;
  const cacheKey = JSON.stringify([doc.id, requestSelection, action, question, contexts, settings.depth, settings.enabled, settings.endpoint, settings.model, settings.profileId, settings.vision, history]);
  try {
    let result = answerCache.get(cacheKey);
    if (!result) {
      if (modelReady()) {
        requestController = new AbortController();
        const response = await fetch('/api/answer', { method: 'POST', signal: requestController.signal, headers: apiHeaders(), body: JSON.stringify({ profileId: settings.profileId || undefined, endpoint: settings.endpoint, model: settings.model, apiKey, vision: settings.vision, image: selected.includeImage ? selected.image : undefined, action, question, depth: settings.depth, selected: requestSelection, documentTitle: doc.title, contexts, history }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '模型请求失败。');
        result = data.result;
      } else result = localExplanation(doc, selected, action, contexts);
      answerCache.set(cacheKey, result);
      if (answerCache.size > 80) answerCache.delete(answerCache.keys().next().value);
    }
    if (generation !== requestGeneration || active.id !== doc.id) return;
    const record = { id: crypto.randomUUID(), docId: doc.id, docTitle: doc.title, selected, question, action, contexts, result, depth: settings.depth, createdAt: Date.now(), starred: false };
    await storage('records', 'put', record);
    records.unshift(record);
    if (generation !== requestGeneration || active.id !== doc.id) { updateCounts(); return; }
    currentRecord = record;
    if (result.mode === 'model') history = [...history, { role: 'user', content: question || (action === 'logic' ? '拆解这段内容的逻辑' : '解释当前选区') }, { role: 'assistant', content: JSON.stringify(result) }].slice(-6);
    updateCounts(); renderAssistant();
    $('#assistant-body').scrollTop = 0;
    $('#question').value = '';
    sizeQuestion();
  } catch (error) {
    if (generation !== requestGeneration || error.name === 'AbortError') return;
    $('#assistant-body').innerHTML = quoteHtml(selected) + `<div class="error-state">${escape(error.message)}<br><button data-action="settings">检查模型设置</button></div>`;
  } finally {
    if (generation === requestGeneration) { requestController = null; updateComposer(); $('#assistant-body').setAttribute('aria-busy', 'false'); }
  }
}

async function showRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  if (documents.some(d => d.id === record.docId) && record.docId !== active?.id) await openDocument(record.docId);
  view = 'reader'; updateView();
  stopRequest();
  selection = structuredClone(record.selected); currentRecord = record; panel = 'explain'; history = [];
  if (record.result.mode === 'model') history = [{ role: 'user', content: record.question || '解释当前选区' }, { role: 'assistant', content: JSON.stringify(record.result) }];
  $('#question-anchor').textContent = '针对选区：' + selection.text;
  if (!documents.some(d => d.id === record.docId)) {
    selection = null;
    $('#question-anchor').textContent = '原文已移除；仍可查看保存的解读';
    toast('原文已移除，保留的解读和摘录仍可查看。');
  }
  renderAssistant();
  if (isPresentation() && selection?.region) { slideReader.jump(selection.page, scrollBehavior()); slideReader.showSelection(selection); }
}

async function jumpToSource(id) {
  const record = currentRecord;
  const source = record?.contexts.find(c => c.id === id);
  if (!source) return;
  if (!documents.some(d => d.id === record.docId)) { toast('原文已移除，无法跳转。'); return; }
  if (active.id !== record.docId) { await openDocument(record.docId, false); selection = record.selected; currentRecord = record; renderAssistant(); }
  if (isPresentation() && source.page) { slideReader.jump(source.page, scrollBehavior()); if (record.selected.page === source.page) slideReader.showSelection(record.selected); return; }
  if (pdfMode === 'original' && source.page) {
    const page = document.querySelector(`.pdf-page[data-page="${source.page}"]`);
    page.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    await renderPdfPage(page);
    const needle = record.selected.text.toLowerCase();
    const spans = Array.from(page.querySelectorAll('.textLayer span'));
    for (const span of spans) if (needle && span.textContent.toLowerCase().includes(needle)) { span.classList.add('pdf-source-mark'); setTimeout(() => span.classList.remove('pdf-source-mark'), 4000); }
    return;
  }
  const element = Array.from(document.querySelectorAll('[data-block]')).find(el => el.dataset.block === id);
  if (element) {
    element.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); element.classList.add('source-flash');
    setTimeout(() => element.classList.remove('source-flash'), 3000);
  }
}

function renderProfiles() {
  $('#model-profiles').innerHTML = profiles.length ? profiles.map(profile => `<article class="model-profile ${profile.id === settings.profileId ? 'current' : ''}"><div><strong>${escape(profile.name)}</strong>${profile.id === settings.profileId ? '<span class="profile-badge">当前使用</span>' : ''}<p>${escape(profile.model)}${profile.vision ? ' · 支持图片' : ' · 文字模型'}</p><small>${escape(profile.endpoint)}</small></div><div class="profile-actions"><button type="button" data-use-profile="${profile.id}">使用</button><button type="button" data-edit-profile="${profile.id}">编辑</button><button type="button" data-remove-profile="${profile.id}" aria-label="移除 ${escape(profile.name)}">移除</button></div></article>`).join('') : '<p class="vault-empty">还没有保存的模型。填写下方配置，保存后即可重复使用。</p>';
  $('#vault-error').textContent = vaultError;
  $('#vault-error').classList.toggle('hidden', !vaultError);
  $('#vault-protection').textContent = vaultState.protection === 'windows-dpapi' ? 'API Key 在本机使用 Windows 账户加密保存。退出或重启后仍可使用。' : 'API Key 在本机加密保存。退出或重启后仍可使用。';
}

function fillModelDraft(profile = null) {
  editingProfileId = profile?.id || '';
  $('#profile-name').value = profile?.name || '';
  $('#endpoint').value = profile?.endpoint || settings.endpoint;
  $('#model').value = profile?.model || settings.model;
  $('#model-vision').checked = profile?.vision ?? settings.vision;
  $('#api-key').value = profile ? '' : apiKey;
  $('#api-key').placeholder = profile?.hasKey ? '已保存；留空保留原密钥' : '输入对应模型服务的 API Key';
  $('#save-profile').checked = true;
  $('#settings-error').classList.add('hidden');
}

function showSettings() {
  $('#depth').value = settings.depth;
  $('#use-model').checked = settings.enabled;
  renderProfiles();
  fillModelDraft(profiles.find(profile => profile.id === settings.profileId));
  $('#settings-dialog').showModal();
}

$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#settings-form button[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  const enabled = $('#use-model').checked;
  let endpoint = $('#endpoint').value.trim();
  let model = $('#model').value.trim();
  const enteredModel = model;
  const key = $('#api-key').value.trim();
  const vision = $('#model-vision').checked;
  const save = $('#save-profile').checked && !!(endpoint || model || key);
  try {
    if (enabled || save) {
      endpoint = normalizeEndpoint(endpoint);
      model = normalizeModelName(model, endpoint);
      const url = new URL(endpoint);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!model) throw new Error('请填写模型名称。');
      if (!local && !key && !(save && profiles.find(profile => profile.id === editingProfileId)?.hasKey)) throw new Error('请填写 API Key。');
    }
    stopRequest();
    if (save) {
      await vaultRequest('/api/vault', { method: 'POST', body: JSON.stringify({ id: editingProfileId || undefined, name: $('#profile-name').value.trim() || model, endpoint, model, apiKey: key, vision }) });
      applyProfile(profiles.find(profile => profile.id === vaultState.activeId), enabled);
    } else {
      apiKey = key;
      settings = { ...settings, enabled, endpoint, model, profileId: '', vision };
    }
    settings.depth = $('#depth').value;
    persistPreferences(); updateModelStatus(); answerCache.clear();
    $('#api-key').value = '';
    $('#settings-dialog').close(); toast(model !== enteredModel ? `设置已保存。模型名称已转换为 ${model}。` : '设置已保存。'); renderAssistant();
  } catch (error) {
    const errorMessage = $('#settings-error');
    errorMessage.textContent = error.message;
    errorMessage.classList.remove('hidden');
    errorMessage.focus();
    errorMessage.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  } finally { submit.disabled = false; }
});

function importProgress(text, page, total) {
  $('#import-progress-label').textContent = text;
  $('#import-progress').classList.remove('hidden');
  const meter = $('#import-meter');
  meter.classList.toggle('hidden', !importController);
  if (total) meter.value = page / total * 100; else meter.removeAttribute('value');
}

async function saveDocument(doc) {
  await storage('documents', 'put', doc);
  documents.unshift(doc);
  $('#import-dialog').close();
  await openDocument(doc.id, false);
  toast('文档已加入阅读空间。');
}

async function handleFile(file) {
  if (!file || importing) return;
  importing = true; $('#file-input').disabled = true;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('文件超过 30 MB，请拆分或压缩后导入。');
    const extension = file.name.split('.').at(-1).toLowerCase();
    if (extension === 'doc') throw new Error('旧版 .doc 暂不支持，请在 Word 或 WPS 中另存为 .docx。');
    if (!['pdf', 'docx', 'ppt', 'pptx', 'txt', 'md'].includes(extension)) throw new Error('请导入 PDF、Word (.docx)、PPT (.ppt / .pptx)、TXT 或 Markdown。');
    importProgress('正在检查文档…');
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
    const duplicate = documents.find(d => d.checksum === checksum);
    if (duplicate) { $('#import-dialog').close(); await openDocument(duplicate.id); toast('这份文档已在文档库中。'); return; }
    importProgress('正在读取文件…');
    let parsed;
    if (extension === 'pdf') parsed = await importPdf(file, importProgress);
    else if (extension === 'docx') parsed = await importDocx(file, importProgress);
    else if (['ppt', 'pptx'].includes(extension)) {
      importController = new AbortController();
      $('#cancel-import').classList.remove('hidden'); $('#cancel-import').disabled = false;
      importProgress('正在打开演示文件…');
      const response = await fetch('/api/presentations/import?extension=' + extension + '&progress=1', { method: 'POST', signal: importController.signal, headers: { ...apiHeaders(), 'Content-Type': 'application/octet-stream' }, body: file });
      const value = await readPresentationStream(response, ({ page, total, renderer }) => importProgress(page === total ? `${total} 张已读取，正在整理文档…` : `${renderer} · 已读取 ${page} / ${total} 张幻灯片`, page, total));
      importController.signal.throwIfAborted();
      parsed = { ...value, blob: file };
      $('#cancel-import').classList.add('hidden');
      importProgress('正在保存文档…', value.pages, value.pages);
    }
    else {
      const text = await file.text();
      if (text.includes('\u0000')) throw new Error('文本文件的编码不支持，请另存为 UTF-8。');
      if (text.length > 300000) throw new Error('初版文本上限为 30 万字符，请拆分后导入。');
      parsed = { blocks: splitParagraphs(text), pages: null };
      if (!parsed.blocks.length) throw new Error('文件没有可阅读的内容。');
    }
    await saveDocument({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), type: extension, author: extension === 'docx' ? 'Word 正文 · 本地解析' : ['ppt', 'pptx'].includes(extension) ? `${parsed.renderer || '演示软件'} · 本机读取` : '本地文档', createdAt: Date.now(), checksum, ...parsed });
  } catch (error) { importProgress(error.name === 'AbortError' ? '已取消导入，可以重新选择文件。' : error.message.includes('Invalid') ? '文档损坏或格式不支持，请检查文件。' : error.message); }
  finally { importing = false; importController = null; $('#cancel-import').classList.add('hidden'); $('#import-meter').classList.add('hidden'); $('#file-input').disabled = false; $('#file-input').value = ''; }
}

$('#cancel-import').addEventListener('click', () => { $('#cancel-import').disabled = true; importProgress('正在取消导入…'); importController?.abort(); });

$('#file-input').addEventListener('change', event => handleFile(event.target.files[0]));
const dropZone = $('#drop-zone');
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('dragging'); handleFile(event.dataTransfer.files[0]); });

$('#text-import').addEventListener('submit', async event => {
  event.preventDefault();
  if (importing) return toast('正在解析文档，请稍候。');
  const text = $('#text-content').value.trim();
  const title = $('#text-title').value.trim();
  if (!text || !title) return;
  try {
    await saveDocument({ id: crypto.randomUUID(), title, type: 'txt', author: '粘贴文本', createdAt: Date.now(), blocks: splitParagraphs(text) });
    $('#text-import').reset();
  } catch { importProgress('保存失败，请检查浏览器的存储空间。'); }
});

$('#question-form').addEventListener('submit', event => { event.preventDefault(); if ($('#question-form button').disabled) return; const q = $('#question').value.trim(); if (q) ask('ask', q); else toast('请输入想问的问题。'); });
$('#question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#question-form').requestSubmit(); } });
$('#question').addEventListener('input', sizeQuestion);
$('#record-search').addEventListener('input', renderCollection);
$('#click-assist').addEventListener('change', () => { settings.clickAssist = $('#click-assist').checked; persistPreferences(); });
$('#document-switch').addEventListener('change', event => openDocument(event.target.value).catch(error => toast(error.message)));
$('#slide-number').addEventListener('change', event => slideReader.jump(event.target.value, scrollBehavior()));
$('#import-dialog').addEventListener('cancel', event => { if (importing) { event.preventDefault(); toast('正在解析文档，请稍候。'); } });
$('#selection-tools').addEventListener('pointerdown', event => event.preventDefault());

function updateProgress() {
  if (isPresentation()) slideReader.updatePage();
  const el = $('#reading-scroll');
  const max = el.scrollHeight - el.clientHeight;
  const progress = Math.max(0, Math.min(1, max <= 1 ? 1 : el.scrollTop / max));
  $('#reading-progress').textContent = `阅读进度 ${Math.round(progress * 100)}%`;
  $('#progress-fill').style.transform = `scaleX(${progress})`;
}
let scrollTimer;
$('#reading-scroll').addEventListener('scroll', () => {
  updateProgress(); $('#selection-tools').classList.add('hidden'); clearTimeout(scrollTimer);
  const doc = active;
  const position = $('#reading-scroll').scrollTop;
  if (pdfMode !== 'reflow') return;
  scrollTimer = setTimeout(async () => { if (doc) { doc.scrollTop = position; try { await storage('documents', 'put', doc); } catch { /* Reading remains available even if a preference cannot be saved. */ } } }, 500);
}, { passive: true });

async function confirmRemoval(title, message) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal confirm-content';
  dialog.innerHTML = `<h2>${escape(title)}</h2><p>${escape(message)}</p><div class="modal-actions"><button class="button secondary" value="cancel">取消</button><button class="button primary" value="remove">移除</button></div>`;
  document.body.append(dialog); dialog.showModal();
  return new Promise(resolve => {
    dialog.addEventListener('click', e => { const button = e.target.closest('button'); if (button) dialog.close(button.value); });
    dialog.addEventListener('close', () => { const ok = dialog.returnValue === 'remove'; dialog.remove(); resolve(ok); }, { once: true });
  });
}

async function changePdfMode(mode) {
  if (active.type !== 'pdf' || mode === pdfMode) return;
  stopRequest(); clearSelection(); currentRecord = null;
  await teardownPdf(); pdfMode = mode;
  setPressed('[data-pdf-mode]', b => b.dataset.pdfMode === mode);
  $('#font-value').textContent = mode === 'original' ? Math.round(pdfZoom * 100) + '%' : fontSize;
  renderAssistant();
  if (mode === 'original') await renderOriginalPdf(); else renderText();
  $('#reading-scroll').scrollTop = 0; updateProgress();
  revealSurface($('#document-content'));
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.dataset.close) { if (importing && button.dataset.close === 'import-dialog') return toast('正在解析文档，请稍候。'); $('#' + button.dataset.close).close(); return; }
    if (button.dataset.view) { const changed = view !== button.dataset.view; view = button.dataset.view; updateView(); if (changed) revealSurface($(view === 'reader' ? '#reader-view' : '#collection-view')); return; }
    if (button.dataset.document) { await openDocument(button.dataset.document); return; }
    if (button.dataset.panel) { const changed = panel !== button.dataset.panel; panel = button.dataset.panel; renderAssistant(); if (changed) revealSurface($('#assistant-body'), 3); return; }
    if (button.dataset.selectMode) { selectMode = button.dataset.selectMode; setPressed('[data-select-mode]', b => b === button); return; }
    if (button.dataset.pdfMode) { await changePdfMode(button.dataset.pdfMode); return; }
    if (button.dataset.slideMode) { slideMode = button.dataset.slideMode; slideReader.setMode(slideMode); setPressed('[data-slide-mode]', b => b === button); $('#slide-hint').textContent = slideMode === 'region' ? '拖动框选图片或文字，再向右侧提问' : '点击幻灯片上的文字区域，再向右侧提问'; return; }
    if (button.dataset.editProfile) { fillModelDraft(profiles.find(profile => profile.id === button.dataset.editProfile)); $('#profile-name').focus(); return; }
    if (button.dataset.useProfile) {
      const submit = $('#settings-form button[type="submit"]');
      button.disabled = true; submit.disabled = true;
      fillModelDraft(profiles.find(profile => profile.id === button.dataset.useProfile));
      try {
        await vaultRequest('/api/vault/activate', { method: 'POST', body: JSON.stringify({ id: button.dataset.useProfile }) });
        stopRequest(); applyProfile(profiles.find(profile => profile.id === vaultState.activeId)); persistPreferences(); answerCache.clear(); updateModelStatus(); renderProfiles(); $('#use-model').checked = true; renderAssistant(); toast('已切换模型。');
      } finally { button.disabled = false; submit.disabled = false; }
      return;
    }
    if (button.dataset.removeProfile) {
      const profile = profiles.find(profile => profile.id === button.dataset.removeProfile);
      if (await confirmRemoval('移除这个模型配置？', `“${profile.name}”及其 API Key 将从本机模型库移除。`)) {
        await vaultRequest('/api/vault', { method: 'DELETE', body: JSON.stringify({ id: profile.id }) });
        if (settings.profileId === profile.id) { stopRequest(); apiKey = ''; settings = { ...settings, profileId: '', enabled: false, endpoint: '', model: '', vision: false }; persistPreferences(); answerCache.clear(); updateModelStatus(); renderAssistant(); }
        renderProfiles(); fillModelDraft(profiles.find(profile => profile.id === settings.profileId)); $('#use-model').checked = settings.enabled;
      } return;
    }
    if (button.dataset.importTab) {
      if (importing) return toast('正在解析文档，请稍候。');
      const file = button.dataset.importTab === 'file';
      $('#file-import').classList.toggle('hidden', !file); $('#text-import').classList.toggle('hidden', file);
      setPressed('[data-import-tab]', b => b === button); return;
    }
    if (button.dataset.record) { await showRecord(button.dataset.record); return; }
    if (button.dataset.source) { await jumpToSource(button.dataset.source); return; }
    if (button.dataset.followup) { await ask('ask', button.dataset.followup); return; }
    if (button.dataset.deleteDocument) {
      const doc = documents.find(d => d.id === button.dataset.deleteDocument);
      if (await confirmRemoval('移除这份文档？', `“${doc.title}”将从此浏览器移除。阅读记录会保留，但无法再跳转原文。`)) {
        await storage('documents', 'delete', doc.id); documents = documents.filter(d => d.id !== doc.id);
        if (active.id === doc.id) await openDocument(documents[0].id); else renderLibrary();
      }
      return;
    }
    if (button.dataset.deleteRecord) {
      if (await confirmRemoval('移除这条阅读记录？', '移除后，该记录也会从术语本中消失。可先导出备份。')) {
        await storage('records', 'delete', button.dataset.deleteRecord); records = records.filter(r => r.id !== button.dataset.deleteRecord);
        if (currentRecord?.id === button.dataset.deleteRecord) currentRecord = null;
        updateCounts(); renderCollection();
      }
      return;
    }
    if (button.dataset.demo) {
      const block = active.blocks.find(b => b.id === (button.dataset.demo === 'term' ? 's-3' : 's-7'));
      const text = button.dataset.demo === 'term' ? 'self-attention' : 'They should not automatically be interpreted as a causal explanation of the final prediction.';
      const element = document.querySelector(`[data-block="${block.id}"]`);
      const at = element.textContent.toLowerCase().indexOf(text.toLowerCase());
      setSelection({ text, blockId: block.id, page: null }, rangeForOffsets(element, at, at + text.length));
      element.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      if (button.dataset.demo === 'term') await ask('explain'); else $('#question').focus();
      return;
    }
    const action = button.dataset.action;
    if (action === 'import') { $('#import-progress').classList.add('hidden'); $('#import-dialog').showModal(); }
    else if (action === 'settings') showSettings();
    else if (action === 'new-profile') { fillModelDraft(); editingProfileId = ''; ['#profile-name', '#endpoint', '#model', '#api-key'].forEach(selector => $(selector).value = ''); $('#model-vision').checked = false; $('#use-model').checked = true; $('#profile-name').focus(); }
    else if (action === 'text-only' && selection?.hasText) { setSelection({ ...selection, includeImage: false }); renderAssistant(); toast('接下来的提问只发送选区文字。'); }
    else if (action === 'slide-previous' || action === 'slide-next') slideReader.jump(slideReader.current + (action === 'slide-next' ? 1 : -1), scrollBehavior());
    else if (action === 'explain' || action === 'logic') await ask(action);
    else if (action === 'ask-focus') { workspaceLayout?.revealAssistant(); $('#selection-tools').classList.add('hidden'); $('#question').focus(); $('#question').scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); }
    else if (action === 'dismiss-selection') { stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); }
    else if (action === 'clear-answer') { stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); }
    else if (action === 'cancel-request') { stopRequest(); renderAssistant(); }
    else if (action === 'star-current' && currentRecord) {
      currentRecord.starred = !currentRecord.starred; await storage('records', 'put', currentRecord);
      updateCounts(); renderAssistant(); toast(currentRecord.starred ? '已加入术语本。' : '已从术语本移除。');
    }
    else if (action === 'copy-answer' && currentRecord) { await navigator.clipboard.writeText(exportMarkdown([currentRecord], documents)); toast('解读与原文依据已复制。'); }
    else if (action === 'export') {
      const subset = view === 'terms' ? records.filter(r => r.starred) : records;
      if (!subset.length) return toast('还没有可导出的记录。');
      const url = URL.createObjectURL(new Blob([exportMarkdown(subset, documents)], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = view === 'terms' ? 'CleverRead-术语本.md' : 'CleverRead-阅读记录.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    else if (action === 'font-up' || action === 'font-down') {
      const direction = action === 'font-up' ? 1 : -1;
      if (isPresentation()) {
        const page = slideReader.current; slideZoom = Math.max(.6, Math.min(1.6, slideZoom + direction * .1));
        $('#font-value').textContent = Math.round(slideZoom * 100) + '%'; slideReader.render(active, slideMode, slideZoom); slideReader.jump(page); if (selection?.region) slideReader.showSelection(selection);
      } else if (pdfMode === 'original') {
        await teardownPdf(); pdfZoom = Math.max(.6, Math.min(1.6, pdfZoom + direction * .1));
        $('#font-value').textContent = Math.round(pdfZoom * 100) + '%'; await renderOriginalPdf();
      } else {
        fontSize = Math.max(15, Math.min(26, fontSize + direction)); settings.fontSize = fontSize; persistPreferences();
        document.documentElement.style.setProperty('--body-size', fontSize + 'px'); $('#font-value').textContent = fontSize;
      }
    }
  } catch (error) { toast(error.message || '操作失败，请重试。'); }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (slideReader.cancelInteraction()) { event.preventDefault(); return; }
  if (selection) { event.preventDefault(); stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); }
});
$('#assistant-body').addEventListener('toggle', event => { if (event.target.matches('.selection-preview')) previewExpanded = event.target.open; }, true);
let resizeTimer;
window.addEventListener('resize', () => { syncSegments(); $('#selection-tools').classList.add('hidden'); clearTimeout(resizeTimer); if (isPresentation()) resizeTimer = setTimeout(() => { const page = slideReader.current; slideReader.render(active, slideMode, slideZoom); slideReader.jump(page); if (selection?.region) slideReader.showSelection(selection); }, 200); else if (pdfMode === 'original') resizeTimer = setTimeout(async () => { try { await teardownPdf(); await renderOriginalPdf(); } catch { toast('PDF 页面重绘失败，请切换阅读模式重试。'); } }, 300); });

async function init() {
  hydrateIcons();
  workspaceLayout = initWorkspaceLayout(storagePrefix);
  new ResizeObserver(() => { if (isPresentation()) slideReader.resize(); }).observe($('#reading-scroll'));
  const segmentObserver = new ResizeObserver(entries => entries.forEach(entry => syncSegment(entry.target)));
  $$('[data-segmented]').forEach(group => segmentObserver.observe(group));
  syncSegments();
  fontSize = Math.max(15, Math.min(26, settings.fontSize || 18));
  document.documentElement.style.setProperty('--body-size', fontSize + 'px');
  $('#click-assist').checked = settings.clickAssist;
  await loadVault();
  updateModelStatus();
  try {
    await openStorage();
    let id;
    try { id = localStorage.getItem(storagePrefix + '-active'); } catch { /* Nonessential preference. */ }
    await openDocument(id || documents[0].id);
  } catch (error) {
    $('#document-content').innerHTML = `<div class="error-state">无法打开本地存储。请使用普通浏览器窗口并允许站点存储，然后刷新页面。${escape(error.message)}</div>`;
  }
}

init();
