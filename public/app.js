import { normalizeText, selectionAt, retrieveContext, exportMarkdown, splitParagraphs, normalizeEndpoint, normalizeModelName } from './core.mjs';
import { sampleDocument, glossary, findTerm, localExplanation } from './sample.mjs';
import { loadPdf, pdfLibrary, importPdf, importDocx } from './documents.mjs';
import { SlideReader } from './slides.mjs';
import { initWorkspaceLayout } from './layout.mjs';
import { readPresentationStream } from './presentation-stream.mjs';
import { importPresentationPdf } from './presentation-pdf.mjs';
import { categoryName, categoryNames, filterDocuments, documentMeta, readingPosition } from './library.mjs';
import { renderExplanation, briefExplanation } from './reading-ui.mjs';
import { sameTarget, conversationTurns, conversationHistory, turnQuestion } from './reading-thread.mjs';
import { appearancePreferences, styleThemes, documentCover } from './appearance.mjs';
import { motionAllowed, move, stopMotion, revealSurface, leaveSurface, captureTransfer, questionTransfer, moveStyleFrame, openDialog, closeDialog } from './motion.mjs';
import { ReadingTools } from './reading-tools.mjs';
import { sentenceSegments, quotedContexts } from './connected-reading.mjs';
import { readAnswerStream, partialAnswer } from './answer-stream.mjs';
import { cropRegion } from './regions.mjs';
import { explanationKey } from './explanation-cache.mjs';
import { validateImportFile } from './outline.mjs';
import { OutlineSidebar } from './outline-ui.mjs';
import { pageLayout, spreadStart, spreadPages, adjacentPdfPage, spreadReadingPage, facingPageGeometry, fitPageInside } from './pdf-layout.mjs';
import { captureReadingMotion, finishReadingMotion } from './reading-motion.mjs';

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
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  library: '<path d="M4 3v18M8 3v18M12 3v18m4-17 5 16"/>',
  more: '<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
  slides: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8M7 12l3-3 3 3 4-5"/>',
  pdf: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 16l3-7 3 7m-5-2h6"/>',
  folder: '<path d="M3 6h7l2 2h9v12H3z"/>'
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

function setPressed(selector, isActive) {
  $$(selector).forEach(button => {
    const pressed = isActive(button);
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  });
  syncSegments();
}

document.addEventListener('pointerdown', () => { document.body.dataset.input = 'pointer'; }, { passive: true });
document.addEventListener('keydown', () => { document.body.dataset.input = 'keyboard'; stopMotion(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', stopMotion);
const scrollBehavior = () => motionAllowed() ? 'smooth' : 'auto';

function updateComposer() {
  const button = $('#question-form button');
  const hasTarget = !!selection || !!readingTools?.quotes.length;
  button.disabled = !requestPending && (!hasTarget || !$('#question').value.trim());
  button.dataset.pending = String(requestPending);
  button.title = requestPending ? '停止生成，保留问题' : !selection ? '先选择原文，再发送问题' : '发送问题（Enter）';
  button.setAttribute('aria-label', requestPending ? '停止生成' : '发送问题');
  button.innerHTML = requestPending ? '<span class="stop-mark" aria-hidden="true"></span>' : icon('send');
  $('#depth').disabled = requestPending;
  $('#question-target').textContent = readingTools?.quotes.length ? `结合 ${readingTools.quotes.length} 段引用提问` : selection ? '追问：' + selection.text : currentRecord && !documents.some(d => d.id === currentRecord.docId) ? '原文已移除，仍可查看解读' : '先选择原文';
  $('#question-target').title = selection?.text || '';
  $('[data-action="locate-selection"]').disabled = !selection;
  $('#question-anchor').dataset.selected = String(!!selection);
  $('#question').placeholder = selection ? '针对选区继续提问…' : '选中原文后，在这里提问…';
  $('.assistant-clear').disabled = !selection && !currentRecord && !requestPending;
  const available = !!currentRecord && !requestPending && panel === 'explain';
  $('[data-action="copy-answer"]').disabled = !available;
  const star = $('[data-action="star-current"]');
  star.disabled = !available; star.setAttribute('aria-pressed', String(available && !!currentRecord.starred));
  star.setAttribute('aria-label', available && currentRecord.starred ? '移出术语本' : '加入术语本');
  star.title = star.getAttribute('aria-label');
  $('[data-action="regenerate-answer"]').disabled = !available || !selection;
  sizeQuestion();
}

function sizeQuestion() {
  const textarea = $('#question');
  const expanded = $('#question-form').contains(document.activeElement) || !!textarea.value.trim() || requestPending;
  $('.question-area').dataset.expanded = String(expanded);
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(140, Math.max(expanded ? 44 : 24, textarea.scrollHeight)) + 'px';
}

let db;
let documents = [];
let records = [];
let active;
let selection = null;
let selectionRange = null;
let currentRecord = null;
let view = 'library';
let panel = 'explain';
let selectMode = 'word';
let pdfMode = 'reflow';
let fontSize = 18;
let pdfZoom = 1;
let pdfPageLayout = 'single';
let pdfSpreadFit = 'width';
let pendingReadingMovement = null;
let livePdf = null;
let renderedPageWidth = 0;
let pageObserver = null;
let renderingGeneration = 0;
let requestController = null;
let requestPending = false;
let pendingQuestion = '';
let failedRequest = null;
let requestGeneration = 0;
let liveTurn = null;
let followAnswer = true;
let streamPaint = 0;
let readingTools;
let outlineSidebar;
let visiblePdfPage = 1;
let history = [];
let apiKey = '';
let profiles = [];
let vaultState = { activeId: '', protection: '' };
let vaultError = '';
let editingProfileId = '';
let settingsPane = 'reading';
let termPeekRange = null;
let termPeek = null;
let composerBlurPending = false;
let slideMode = 'region';
let slideZoom = 1;
let importing = false;
let importController = null;
let toastTimer;
let previewExpanded = false;
let workspaceLayout;
let readerDocumentId = null;
let openGeneration = 0;
let restoringPosition = false;
let libraryState = { filter: 'all', query: '', scrollTop: 0, categories: [] };
let featuredDocumentId = null;
const readerSessions = new Map();
const answerCache = new Map();
let cacheWrites = 0;
const qaSession = new URLSearchParams(location.search).get('test-session')?.replace(/[^a-z0-9-]/gi, '').slice(0, 40);
const storagePrefix = qaSession ? `clever-qa-${qaSession}` : 'clever';
const defaults = { enabled: false, endpoint: '', model: '', profileId: '', vision: false, depth: '入门', fontSize: 18, lineHeight: 1.85, clickAssist: true, resumeOnLaunch: false, theme: document.documentElement.dataset.theme || 'gray' };
let hadPreferences = false;
let settings = { ...defaults };
try {
  const saved = localStorage.getItem(storagePrefix + '-settings');
  hadPreferences = !!saved;
  settings = { ...defaults, ...JSON.parse(saved || '{}') };
  if (settings.endpoint) settings.endpoint = normalizeEndpoint(settings.endpoint);
  settings.model = normalizeModelName(settings.model, settings.endpoint);
} catch { /* Use safe defaults for an interrupted settings write. */ }
settings.theme = ['graphite', 'gray'].includes(settings.theme) ? settings.theme : defaults.theme;
Object.assign(settings, appearancePreferences(settings, { existing: hadPreferences, systemTheme: defaults.theme }));
try {
  const saved = JSON.parse(localStorage.getItem(storagePrefix + '-library') || '{}');
  libraryState = { filter: typeof saved.filter === 'string' ? saved.filter : 'all', query: typeof saved.query === 'string' ? saved.query.slice(0, 160) : '', scrollTop: Math.max(0, Number(saved.scrollTop) || 0), categories: Array.isArray(saved.categories) ? saved.categories.map(categoryName).filter(Boolean) : [] };
} catch { /* Library preferences are optional. */ }

const apiHeaders = () => ({ 'Content-Type': 'application/json', ...(qaSession ? { 'X-Clever-Test-Session': qaSession } : {}) });
const isPresentation = () => ['ppt', 'pptx'].includes(active?.type) && Array.isArray(active?.slides);
const slideReader = new SlideReader($('#document-content'), {
  onSelect: (value, rect) => {
    const peek = !value.includeImage && value.text.length <= 80 && settings.clickAssist;
    const accepted = setSelection(value, null, peek);
    if (accepted && peek) { termPeekRange = { getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }) }; ask('explain', '', 'peek'); }
    else if (accepted) showSelectionTools({ getClientRects: () => [rect], getBoundingClientRect: () => rect });
    return accepted;
  },
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
  $('#toast').classList.remove('hidden'); revealSurface($('#toast'), 5, 180);
  toastTimer = setTimeout(() => { leaveSurface($('#toast'), { axis: 'y', distance: 5 }); $('#toast').classList.add('hidden'); }, 4300);
}

function storage(store, method, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, ['getAll', 'get'].includes(method) ? 'readonly' : 'readwrite');
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
    const request = indexedDB.open(qaSession ? 'clever-read-qa-' + qaSession : 'clever-read', 5);
    request.onupgradeneeded = () => {
      for (const name of ['documents', 'records', 'readingStates', 'translations', 'explanations', 'outlines']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error('请关闭或刷新其他 Clever Read 页面，完成本地文档库升级。已有文档和阅读记录会保留。')); };
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
  const savedStates = await storage('readingStates', 'getAll');
  const savedOutlines = await storage('outlines', 'getAll');
  [documents, records] = await Promise.all([storage('documents', 'getAll'), storage('records', 'getAll')]);
  for (const doc of documents) {
    doc.outlineState = savedOutlines.find(state => state.id === doc.id) || doc.outlineState;
    if (doc.outlineState?.status === 'generating') doc.outlineState = { ...doc.outlineState, status: 'interrupted', message: '上次生成被中断，已保存的目录仍可使用；可点击重新生成。' };
  }
  for (const doc of documents) { const saved = savedStates.find(state => state.id === doc.id); if (saved) { doc.readingState = saved; doc.lastOpenedAt = saved.lastOpenedAt; } doc.category = categoryName(doc.category); }
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

function applyTheme(theme = settings.theme, style = settings.style, motion = settings.motion) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.style = style;
  document.documentElement.dataset.motion = motion ? 'on' : 'off';
  if (!motion) stopMotion();
  $('meta[name="theme-color"]').content = theme === 'graphite' ? '#1e1e1e' : style === 'paper' ? '#ece9e2' : '#efefef';
}

function coverHtml(doc) {
  const cover = documentCover(doc);
  const excerpt = doc.blocks?.find(block => !block.unreadable && block.text)?.text?.slice(0, 280) || '';
  return `<span class="document-cover cover-${cover.variant}"><span class="cover-format">${escape(cover.format)}</span><strong class="cover-title">${escape(cover.title)}</strong><span class="cover-excerpt">${escape(excerpt)}</span><span class="cover-art" aria-hidden="true"><i></i><i></i><i></i></span><span class="cover-imprint">CLEVER READ / ${String(cover.variant + 1).padStart(2, '0')}</span></span>`;
}

function renderFeatured(filtered, direction = 0) {
  const last = documents.filter(doc => doc.lastOpenedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
  const featured = filtered.find(doc => doc.id === featuredDocumentId) || filtered.find(doc => doc.id === last?.id) || filtered[0];
  $('#resume-reading').classList.toggle('hidden', !featured);
  if (!featured) return;
  featuredDocumentId = featured.id;
  $('#resume-document').dataset.document = featured.id;
  $('.resume-cover-button').dataset.document = featured.id;
  $('.resume-cover-button').setAttribute('aria-label', '阅读 ' + featured.title);
  $('#resume-title').textContent = featured.title;
  $('.resume-label').textContent = featured.lastOpenedAt ? '继续阅读 / CONTINUE READING' : '从这里开始 / START READING';
  $('#resume-position').textContent = readingPosition(featured) + (featured.readingState?.selected?.text ? ' · ' + featured.readingState.selected.text.slice(0, 60) : '');
  $('#resume-meta').textContent = documentMeta(featured) + (featured.category ? ' / ' + featured.category : ' / 本机文档');
  $('#resume-thumbnail').innerHTML = coverHtml(featured);
  const progress = Math.round(Math.min(1, Math.max(0, featured.readingState?.progress || 0)) * 100);
  const position = readingPosition(featured);
  $('#resume-progress').textContent = featured.lastOpenedAt ? position.startsWith('已读 ') ? position : `已读 ${progress}% · ${position}` : '尚未开始阅读';
  $('#feature-count').textContent = `${String(filtered.indexOf(featured) + 1).padStart(2, '0')} / ${String(filtered.length).padStart(2, '0')}`;
  $('[data-action="feature-previous"]').disabled = filtered.length < 2;
  $('[data-action="feature-next"]').disabled = filtered.length < 2;
  if (direction) {
    move($('#resume-thumbnail .document-cover'), [{ opacity: .35, transform: `translateX(${direction * 24}px) rotate(${direction * 3}deg) scale(.97)` }, { opacity: 1, transform: 'none' }], 280);
    move($('.resume-copy'), [{ opacity: .4, transform: `translateX(${direction * 8}px)` }, { opacity: 1, transform: 'none' }], 200);
  }
}

function updateCounts() {
  $('#notes-count').textContent = records.length;
  $('#terms-count').textContent = records.filter(r => r.starred).length;
  const count = records.filter(r => r.docId === active?.id).length;
  $('#history-count').textContent = count;
}

function renderLibrary() {
  if (!db || !active) return;
  const previousCategory = $('#category-list .active')?.getBoundingClientRect();
  const focusedCategory = document.activeElement?.dataset.libraryFilter;
  $('#document-switch').innerHTML = documents.map(doc => `<option value="${escape(doc.id)}" ${doc.id === active?.id ? 'selected' : ''}>${escape(doc.title)}${doc.type !== 'sample' ? ' · ' + doc.type.toUpperCase() : ''}</option>`).join('');
  const names = categoryNames(documents, libraryState.categories);
  if (libraryState.filter.startsWith('category:') && !names.includes(libraryState.filter.slice(9))) libraryState.filter = 'all';
  const title = libraryState.filter === 'all' ? '文档库' : libraryState.filter === 'recent' ? '最近阅读' : libraryState.filter === 'uncategorized' ? '未分类' : libraryState.filter.slice(9);
  $('#library-title').textContent = title; $('#library-list-title').textContent = libraryState.filter === 'all' ? '所有文档' : title;
  $('#documents-count').textContent = documents.length;
  $('#category-list').innerHTML = `<button class="nav-item" data-library-filter="all">所有文档</button><button class="nav-item" data-library-filter="recent">最近阅读</button>` + names.map(name => `<button class="nav-item" data-library-filter="${escape('category:' + name)}"><span>${escape(name)}</span></button>`).join('') + `<button class="nav-item" data-library-filter="uncategorized">未分类</button><button class="nav-item category-add" data-action="new-category" aria-label="新建分类" title="新建分类">${icon('plus')}</button>`;
  const filtered = filterDocuments(documents, libraryState.filter, libraryState.query);
  $('#library-count').textContent = `${filtered.length} 份文档`;
  $('#library-empty').classList.toggle('hidden', !!filtered.length);
  $('#library-empty').textContent = libraryState.query ? '没有找到匹配的文档。' : libraryState.filter === 'recent' ? '打开文档后，会在这里保留阅读位置。' : '这个分类还没有文档，可以在文档列表中调整分类。';
  $('#document-list').innerHTML = filtered.map(doc => `<div class="library-document-row"><button class="library-document-open" data-document="${escape(doc.id)}"><span class="document-glyph" aria-hidden="true" data-format="${escape(doc.type)}">${icon(['ppt', 'pptx'].includes(doc.type) ? 'slides' : doc.type === 'pdf' ? 'pdf' : 'file')}</span><span class="library-document-copy"><span class="library-document-title">${escape(doc.title)}</span><span class="library-document-meta">${escape(documentMeta(doc) + (doc.category ? ' · ' + doc.category : ''))}</span></span></button><span class="library-document-position">${escape(readingPosition(doc))}</span><div class="document-row-actions"><button class="icon-button document-more" popovertarget="doc-menu-${escape(doc.id)}" aria-label="${escape(doc.title)} 的更多操作">${icon('more')}</button><div id="doc-menu-${escape(doc.id)}" class="document-menu" popover="auto"><button data-document="${escape(doc.id)}">${icon('open-book')}打开阅读</button><label class="menu-category">分类<select class="document-category" data-category-document="${escape(doc.id)}" aria-label="${escape(doc.title)} 的分类"><option value="">未分类</option>${names.map(name => `<option value="${escape(name)}" ${name === doc.category ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></label>${doc.type !== 'sample' ? `<button class="menu-danger" data-delete-document="${escape(doc.id)}">${icon('trash')}移除文档</button>` : ''}</div></div></div>`).join('');
  $$('.document-glyph').forEach((element, index) => { element.innerHTML = coverHtml(filtered[index]); });
  renderFeatured(filtered);
  updateLibraryNavigation(previousCategory);
  if (focusedCategory && document.body.dataset.input === 'keyboard') $$('[data-library-filter]').find(button => button.dataset.libraryFilter === focusedCategory)?.focus({ preventScroll: true });
  updateCounts();
}

function updateLibraryNavigation(previous) {
  $$('[data-library-filter]').forEach(button => { const selected = view === 'library' && button.dataset.libraryFilter === libraryState.filter; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  const group = $('#category-list'), selected = group.querySelector('.active');
  if (!selected?.offsetWidth) return;
  let indicator = group.querySelector('.category-indicator');
  if (!indicator) { indicator = document.createElement('span'); indicator.className = 'category-indicator'; indicator.setAttribute('aria-hidden', 'true'); group.append(indicator); }
  Object.assign(indicator.style, { left: selected.offsetLeft + 'px', top: selected.offsetTop + selected.offsetHeight - 2 + 'px', width: selected.offsetWidth + 'px' });
  const after = selected.getBoundingClientRect();
  if (previous?.width && previous.left !== after.left) move(indicator, [{ transform: `translateX(${previous.left - after.left}px) scaleX(${previous.width / after.width})` }, { transform: 'none' }], 200);
}
function persistLibrary() { try { localStorage.setItem(storagePrefix + '-library', JSON.stringify(libraryState)); } catch { /* Search remains available. */ } }
function readingPositionSnapshot() {
  if (readingTools?.focus?.position) return structuredClone(readingTools.focus.position);
  const scroll = $('#reading-scroll'), top = scroll.getBoundingClientRect().top;
  const selector = isPresentation() ? '.ppt-slide' : pdfMode === 'original' ? '.pdf-page' : '[data-block]';
  const elements = $$(selector); let anchor = elements[0];
  for (const element of elements) { if (element.getBoundingClientRect().top <= top + 48) anchor = element; else break; }
  if (active?.type === 'pdf' && pdfMode === 'original' && currentPdfLayout().mode === 'double' && anchor) {
    const page = spreadReadingPage(Number(anchor.dataset.page), visiblePdfPage, active.pages);
    anchor = elements.find(element => Number(element.dataset.page) === page) || anchor;
  }
  const page = anchor?.dataset.page || (active?.type === 'pdf' ? anchor?.closest('[data-page]')?.dataset.page : null);
  const rect = anchor?.getBoundingClientRect();
  return { scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft, ...(scroll.scrollTop > 0 && anchor ? { position: { ...(page ? { page: Number(page) } : {}), ...(anchor.dataset.block ? { blockId: anchor.dataset.block } : {}), offset: top - rect.top, ...(active?.type === 'pdf' && pdfMode === 'original' && rect.height ? { offsetRatio: (top - rect.top) / rect.height } : {}) } } : {}) };
}
function restoreReadingPosition(saved) {
  if (!saved || view !== 'reader') return;
  restoringPosition = true;
  const element = saved.position?.blockId && !isPresentation() && pdfMode !== 'original' ? $$('[data-block]').find(el => el.dataset.block === saved.position.blockId) : saved.position?.page ? $(`#document-content ${isPresentation() ? '.ppt-slide' : pdfMode === 'original' ? '.pdf-page' : '[data-page]'}[data-page="${Number(saved.position.page)}"]`) : null;
  const scroll = $('#reading-scroll');
  const offset = element && pdfMode === 'original' && Number.isFinite(saved.position?.offsetRatio) ? saved.position.offsetRatio * element.getBoundingClientRect().height : saved.position?.offset || 0;
  scroll.scrollTop = element ? scroll.scrollTop + element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + offset : saved.scrollTop || 0;
  scroll.scrollLeft = saved.scrollLeft || 0; updateProgress();
  requestAnimationFrame(() => { restoringPosition = false; });
}
function rememberReader(persist = true) {
  if (!active || readerDocumentId !== active.id || view !== 'reader' || restoringPosition || pdfPaneMotion) return;
  const position = readingPositionSnapshot(), selected = selection ? { ...selection } : null;
  if (selected) delete selected.image;
  const max = $('#reading-scroll').scrollHeight - $('#reading-scroll').clientHeight;
  active.readingState = { id: active.id, lastOpenedAt: active.lastOpenedAt, ...position, progress: max > 0 ? Math.max(0, Math.min(1, position.scrollTop / max)) : 1, selected, quotes: readingTools?.snapshot() || [], recordId: currentRecord?.id, pdfMode, pdfZoom, pdfPageLayout, pdfSpreadFit, slideMode, slideZoom, selectMode, focused: workspaceLayout?.getState().focused || false, draft: $('#question').value };
  readerSessions.set(active.id, { selection, currentRecord, history: [...history], panel, previewExpanded, assistantScroll: $('#assistant-body').scrollTop });
  if (persist) storage('readingStates', 'put', active.readingState).catch(() => toast('阅读位置未能保存，请检查浏览器存储空间。'));
}
function navigateView(next) {
  if (next === view) return;
  if (view === 'library') { libraryState.scrollTop = $('#library-view').scrollTop; persistLibrary(); }
  const returning = next === 'library' && view === 'reader';
  const transfer = returning ? captureTransfer($('#document-content .document-header') || $('#document-content h1')) : () => {};
  rememberReader();
  view = next; updateView();
  if (next === 'library') { renderLibrary(); requestAnimationFrame(() => { $('#library-view').scrollTop = libraryState.scrollTop; }); }
  if (returning) transfer($('#resume-thumbnail .document-cover'));
  else revealSurface($(next === 'library' ? '#library-view' : next === 'reader' ? '#reader-view' : '#collection-view'));
}

function annotateTerms(text) {
  if (active?.type !== 'sample') return escape(text);
  const terms = glossary.map(g => g.term).filter(t => t.length > 5).sort((a, b) => b.length - a.length);
  const pattern = new RegExp('\\b(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
  let last = 0;
  let output = '';
  for (const match of text.matchAll(pattern)) {
    output += escape(text.slice(last, match.index)) + `<span class="term-inline" data-term="${escape(match[0])}" role="button" tabindex="0" aria-label="解释 ${escape(match[0])}">${escape(match[0])}</span>`;
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
    const pageAttribute = block.page ? ` data-page="${Number(block.page)}"` : '';
    body += block.unreadable ? `<p class="pdf-warning"${pageAttribute}>${escape(block.text)}</p>` : `<section class="reading-block"${pageAttribute}><div class="block-tools"><button type="button" data-reading-action="focus" data-block-id="${escape(block.id)}" aria-label="聚焦 ${escape(block.section)} 的段落" title="聚焦段落">${icon('focus')}</button><button type="button" data-reading-action="quote" data-block-id="${escape(block.id)}" aria-label="引用 ${escape(block.section)} 的段落" title="加入引用">${icon('copy')}</button></div><p class="document-paragraph" data-block="${escape(block.id)}" data-section="${escape(block.section)}">${sentenceSegments(block).map(s => `<span data-sentence="${escape(s.id)}">${annotateTerms(s.text)}</span>`).join(' ')}</p></section>`;
  }
  const chars = active.blocks.reduce((n, b) => n + b.text.length, 0);
  const minutes = Math.max(1, Math.ceil(chars / 950));
  $('#document-content').className = 'document-content';
  $('#document-content').innerHTML = `<div class="document-kicker"><span class="doc-type-pill">${active.type === 'sample' ? '教学示例' : escape(active.type.toUpperCase())}</span><span>在原文里理解与提问</span></div><h1>${escape(active.title)}</h1>${active.subtitle ? `<p class="document-subtitle">${escape(active.subtitle)}</p>` : ''}<div class="document-byline"><span>${icon('file')}${escape(active.author || (active.type === 'docx' ? 'Word 正文 · 流式阅读' : '本地文档'))}</span><span>${icon('clock')}约 ${minutes} 分钟</span>${active.pages ? `<span>${active.pages} 页</span>` : ''}</div><div class="reading-hint">${icon('sparkles')}点击词语查看解释，或选中一句话对原文提问。</div>${active.type === 'pdf' ? '<div class="pdf-warning">流式阅读可能改变双栏与公式顺序，可切换“原版”核对排版。</div>' : ''}${body}`;
}

async function teardownPdf() {
  pdfPaneMotion = null;
  renderingGeneration++;
  pageObserver?.disconnect();
  pageObserver = null;
  const oldPdf = livePdf;
  livePdf = null;
  if (oldPdf) await oldPdf.destroy();
}

function currentPdfLayout() {
  return pageLayout({ requested: pdfPageLayout, original: active?.type === 'pdf' && pdfMode === 'original',
    outlineOpen: $('#reader-workspace').dataset.outlineOpen === 'true',
    assistantOpen: workspaceLayout ? !workspaceLayout.getState().focused : false,
    comparing: $('#reader-view').dataset.compare === 'true' });
}

function revealPdfPageHorizontally(target) {
  const scroll = $('#reading-scroll'), bounds = scroll.getBoundingClientRect(), rect = target.getBoundingClientRect();
  if (rect.width <= bounds.width - 32 && (rect.left < bounds.left + 12 || rect.right > bounds.right - 12)) {
    scroll.scrollLeft += rect.left < bounds.left + 12 ? rect.left - bounds.left - 12 : rect.right - bounds.right + 12;
  } else if (rect.right <= bounds.left + 32 || rect.left >= bounds.right - 32) scroll.scrollLeft += rect.left - bounds.left - 12;
}

function syncPdfPageLayout(position = null) {
  const state = currentPdfLayout(), content = $('#document-content');
  $('.app-shell').dataset.immersive = String(state.available && view === 'reader');
  $('#pdf-page-layout').classList.toggle('hidden', !state.available);
  $('#pdf-spread-fit').classList.toggle('hidden', state.mode !== 'double');
  $('#pdf-spread-fit').value = pdfSpreadFit;
  if (state.available && $('#pdf-page-layout').parentElement !== $('.reader-controls')) $('.reader-controls').append($('#pdf-page-layout'));
  if ($('#pdf-spread-fit').parentElement !== $('#reader-more-menu')) $('#reader-more-menu').append($('#pdf-spread-fit'));
  setPressed('button[data-page-layout]', button => button.dataset.pageLayout === state.mode);
  if (!content.classList.contains('pdf-pages')) return;
  const changed = content.dataset.pageLayout !== state.mode;
  const saved = position || (changed && readerDocumentId === active?.id ? readingPositionSnapshot() : null);
  content.dataset.pageLayout = state.mode;
  $('#pdf-spread-note').textContent = state.mode === 'double' ? '双页等大，保留原排版，等比例适配可用空间' : '';
  if (changed && livePdf && readerDocumentId === active?.id && view === 'reader') { void refreshPdfSurface(saved).catch(error => toast(error.message)); return; }
  if (saved && view === 'reader') {
    restoreReadingPosition(saved);
    const target = content.querySelector(`.pdf-page[data-page="${Number(saved.position?.page) || visiblePdfPage}"]`);
    if (target) revealPdfPageHorizontally(target);
    requestAnimationFrame(() => rememberReader());
  }
}

function changePdfPageLayout(mode) {
  if (!['single', 'double'].includes(mode) || !currentPdfLayout().available) return;
  readingTools?.restoreFocus(); closeTermPeek();
  const position = readingPositionSnapshot();
  pdfPageLayout = mode; pdfZoom = 1;
  $('#font-value').textContent = '100%';
  syncPdfPageLayout(position);
  requestAnimationFrame(() => rememberReader());
}

async function refreshPdfSurface(position) {
  const id = active?.id;
  const movement = pendingReadingMovement || captureReadingMotion($$('.pdf-page[data-rendered]'));
  pendingReadingMovement = null;
  renderingGeneration++; pageObserver?.disconnect(); pageObserver = null;
  const generation = renderingGeneration;
  await renderOriginalPdf({ reuse: true });
  if (generation === renderingGeneration && view === 'reader' && active?.id === id && pdfMode === 'original') {
    if (position) restoreReadingPosition(position);
    const pair = currentPdfLayout().mode === 'double' ? spreadPages(visiblePdfPage, active.pages) : [visiblePdfPage];
    await Promise.all(pair.map(page => { const element = $(`.pdf-page[data-page="${page}"]`); return element ? renderPdfPage(element) : null; }));
    if (generation !== renderingGeneration) return;
    finishReadingMotion(movement);
    requestAnimationFrame(() => rememberReader());
  }
}

$('#pdf-spread-fit').addEventListener('change', async event => {
  const position = readingPositionSnapshot();
  pdfSpreadFit = event.target.value === 'page' ? 'page' : 'width'; pdfZoom = 1;
  $('#font-value').textContent = '100%';
  try { await refreshPdfSurface(position); } catch (error) { toast(error.message); }
});

async function renderOriginalPdf({ reuse = false } = {}) {
  pdfPaneMotion = null;
  const generation = renderingGeneration;
  $('#document-content').className = 'pdf-pages';
  $('#document-content').innerHTML = '<div class="pdf-placeholder">正在打开原版 PDF…</div>';
  const docId = active.id;
  const reused = !!(reuse && livePdf);
  const loaded = reused ? livePdf : await loadPdf(active.blob);
  if (docId !== active.id || pdfMode !== 'original' || generation !== renderingGeneration) { if (!reused) await loaded.destroy(); return; }
  livePdf = loaded;
  const first = await loaded.getPage(1);
  const firstViewport = first.getViewport({ scale: 1 });
  const readingStyle = getComputedStyle($('#reading-scroll'));
  const available = Math.max(200, $('#reading-scroll').clientWidth - parseFloat(readingStyle.paddingLeft) - parseFloat(readingStyle.paddingRight));
  const preferred = parseFloat(getComputedStyle($('#reader-view')).getPropertyValue('--reading-page-width')) || 850;
  renderedPageWidth = preferred;
  const double = currentPdfLayout().mode === 'double';
  const availableHeight = $('#reading-scroll').clientHeight - parseFloat(readingStyle.paddingTop) - parseFloat(readingStyle.paddingBottom);
  const sheet = facingPageGeometry({ width: available, height: availableHeight, aspect: firstViewport.height / firstViewport.width, fit: pdfSpreadFit });
  const width = (double ? sheet.width : Math.min(preferred, available)) * pdfZoom;
  $('#document-content').dataset.pageLayout = double ? 'double' : 'single';
  $('#document-content').style.setProperty('--pdf-page-width', width + 'px');
  $('#document-content').innerHTML = Array.from({ length: loaded.numPages }, (_, i) => {
    const size = active.pageSizes?.[i] || firstViewport;
    const aspect = double ? sheet.height / sheet.width : size.height / size.width;
    return `<div class="pdf-page" data-page="${i + 1}"${double ? ' data-sheet="true"' : ''} style="width:var(--pdf-page-width);height:calc(var(--pdf-page-width) * ${aspect})"><span class="pdf-page-label">${i + 1} / ${loaded.numPages}</span><div class="pdf-placeholder">第 ${i + 1} 页</div></div>`;
  }).join('');
  syncPdfPageLayout();
  observePdfPages(loaded, generation);
}

function observePdfPages(loaded = livePdf, generation = renderingGeneration) {
  pageObserver?.disconnect();
  const visible = new Set(), queued = new Set(); let rendering = 0;
  const drain = () => {
    if (generation !== renderingGeneration) return;
    while (rendering < 2 && queued.size) {
      const element = queued.values().next().value; queued.delete(element);
      if (!visible.has(element) || element.dataset.rendered) continue;
      rendering++;
      renderPdfPage(element, loaded, generation).catch(error => {
        if (generation === renderingGeneration) toast('PDF 页面渲染失败：' + error.message);
      }).finally(() => { rendering--; drain(); });
    }
  };
  pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) { visible.add(entry.target); queued.add(entry.target); }
      else { visible.delete(entry.target); queued.delete(entry.target); }
    }
    drain();
  }, { root: $('#reading-scroll'), rootMargin: '700px 0px' });
  $$('.pdf-page').forEach(page => pageObserver.observe(page));
}

const pdfRenderSizes = new WeakMap();
let pdfPaneMotion = null;
async function renderPdfPage(element, pdf = livePdf, generation = renderingGeneration, redraw = false) {
  if (!pdf || (element.dataset.rendered && !redraw) || element.dataset.rendering) return;
  element.dataset.rendering = 'true';
  let pendingCanvas, pendingLayer, committed = false;
  try {
    const page = await pdf.getPage(Number(element.dataset.page));
    if (generation !== renderingGeneration) return;
    const natural = page.getViewport({ scale: 1 });
    const uniform = element.dataset.sheet === 'true';
    const bounds = element.getBoundingClientRect();
    const inside = uniform ? fitPageInside(natural, bounds) : null;
    const scale = inside ? inside.scale : element.clientWidth / natural.width;
    const viewport = page.getViewport({ scale });
    if (!uniform) element.style.height = `calc(var(--pdf-page-width) * ${natural.height / natural.width})`;
    element.style.setProperty('--scale-factor', viewport.scale);
    element.style.setProperty('--total-scale-factor', viewport.scale);
    const canvas = document.createElement('canvas');
    pendingCanvas = canvas;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const layer = document.createElement('div');
    pendingLayer = layer;
    layer.className = 'textLayer';
    for (const surface of [canvas, layer]) Object.assign(surface.style, { inset: 'auto', left: (inside?.left || 0) + 'px', top: (inside?.top || 0) + 'px', width: viewport.width + 'px', height: viewport.height + 'px' });
    const number = document.createElement('span');
    number.className = 'pdf-page-label';
    number.textContent = `${element.dataset.page} / ${pdf.numPages}`;
    canvas.style.visibility = layer.style.visibility = 'hidden';
    element.append(canvas, layer);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise;
    if (generation !== renderingGeneration) return;
    const library = await pdfLibrary();
    await new library.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport }).render();
    if (generation !== renderingGeneration) return;
    canvas.style.visibility = layer.style.visibility = '';
    element.replaceChildren(canvas, layer, number);
    committed = true;
    pdfRenderSizes.set(element, { natural, width: viewport.width, height: viewport.height });
    if (selection?.page === Number(element.dataset.page) && globalThis.Highlight && CSS.highlights) {
      const spans = Array.from(layer.querySelectorAll('span'));
      const text = spans.map(span => span.textContent).join('');
      const at = text.toLowerCase().indexOf(selection.text.toLowerCase());
      if (at >= 0) { selectionRange = rangeForOffsets(layer, at, at + selection.text.length); if (selectionRange) CSS.highlights.set('read-selection', new Highlight(selectionRange)); }
    }
    element.dataset.rendered = 'true';
    // Keep a bounded number of canvases instead of accumulating the whole textbook.
    const rendered = $$('.pdf-page[data-rendered]');
    if (rendered.length > 8) {
      const center = $('#reading-scroll').getBoundingClientRect().top;
      rendered.sort((a, b) => Math.abs(b.getBoundingClientRect().top - center) - Math.abs(a.getBoundingClientRect().top - center));
      for (const old of rendered.slice(0, rendered.length - 8)) {
        if (old === element || old.dataset.rendering) continue;
        const canvas = old.querySelector('canvas'); if (canvas) { canvas.width = 0; canvas.height = 0; }
        old.innerHTML = `<span class="pdf-page-label">${old.dataset.page} / ${pdf.numPages}</span><div class="pdf-placeholder">第 ${old.dataset.page} 页</div>`;
        delete old.dataset.rendered;
      }
    }
  } finally {
    if (!committed) { if (pendingCanvas) { pendingCanvas.width = pendingCanvas.height = 0; pendingCanvas.remove(); } pendingLayer?.remove(); }
    delete element.dataset.rendering;
  }
}

// Keep the existing page/text DOM while a pane moves; only rescale the visible surfaces.
function resizePdfDuringPane(position, geometry) {
  if (view !== 'reader' || active?.type !== 'pdf' || pdfMode !== 'original' || !livePdf) return;
  if (!pdfPaneMotion) {
    const scroll = $('#reading-scroll'), style = getComputedStyle(scroll);
    const source = active.pageSizes?.[0] || { width: 612, height: 792 };
    const surfaces = $$('.pdf-page[data-rendered]').flatMap(element => {
      const base = pdfRenderSizes.get(element);
      return base ? [{ base, layers: [...element.querySelectorAll('canvas, .textLayer')] }] : [];
    });
    pdfPaneMotion = { scroll, content: $('#document-content'),
      top: scroll.getBoundingClientRect().top,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
      height: scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      double: currentPdfLayout().mode === 'double', aspect: source.height / source.width, surfaces,
      anchor: position?.position?.page ? $(`.pdf-page[data-page="${Number(position.position.page)}"]`) : null };
    pendingReadingMovement = null; renderingGeneration++; pageObserver?.disconnect(); pageObserver = null;
  }
  const { scroll, content, padding, height, double, aspect, surfaces, anchor, top } = pdfPaneMotion;
  const available = Math.max(160, (geometry?.readingWidth ?? scroll.clientWidth) - padding);
  const preferred = geometry?.pageWidth ?? (parseFloat(getComputedStyle($('#reader-view')).getPropertyValue('--reading-page-width')) || 850);
  const sheet = facingPageGeometry({ width: available, height, aspect, fit: pdfSpreadFit });
  const width = (double ? sheet.width : Math.min(preferred, available)) * pdfZoom;
  content.style.setProperty('--pdf-page-width', width + 'px');
  for (const { base, layers } of surfaces) {
    const fit = double ? fitPageInside(base.natural, { width, height: sheet.height * pdfZoom }) : { width, left: 0, top: 0 };
    for (const surface of layers) Object.assign(surface.style, { left: fit.left + 'px', top: fit.top + 'px', transformOrigin: 'top left', transform: `translateZ(0) scale(${fit.width / base.width})` });
  }
  // One layout read anchors the page; progress, TOC and storage update only after settling.
  if (position) {
    const rect = anchor?.getBoundingClientRect();
    const offset = Number.isFinite(position.position?.offsetRatio) ? position.position.offsetRatio * (rect?.height || 0) : position.position?.offset || 0;
    scroll.scrollTop = rect ? scroll.scrollTop + rect.top - top + offset : position.scrollTop || 0;
    scroll.scrollLeft = position.scrollLeft || 0;
  }
}

async function settlePdfPane(position) {
  pdfPaneMotion = null;
  if (!livePdf || view !== 'reader' || pdfMode !== 'original') return;
  const generation = ++renderingGeneration, bounds = $('#reading-scroll').getBoundingClientRect();
  const visible = $$('.pdf-page').filter(element => { const rect = element.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom; });
  await Promise.all(visible.map(element => renderPdfPage(element, livePdf, generation, true)));
  if (generation !== renderingGeneration) return;
  observePdfPages(livePdf, generation);
  if (position) restoreReadingPosition(position);
  requestAnimationFrame(() => rememberReader());
}

function stopRequest() {
  if (liveTurn) retainLiveTurn('stopped');
  if (requestPending && pendingQuestion && !$('#question').value.trim()) $('#question').value = pendingQuestion;
  pendingQuestion = '';
  requestGeneration++;
  requestController?.abort();
  requestController = null;
  requestPending = false;
  updateComposer();
}

function clearSelection() {
  closeTermPeek();
  slideReader.cancelInteraction();
  selection = null; selectionRange = null; history = [];
  previewExpanded = false;
  failedRequest = null;
  $('#question-status').textContent = '';
  $('#selection-tools').classList.add('hidden');
  globalThis.CSS?.highlights?.delete('read-selection');
  slideReader.clearSelection();
  updateComposer();
}

async function openDocument(id, restorePosition = true, source = null) {
  const transfer = view === 'library' ? captureTransfer(source || $('#resume-thumbnail .document-cover')) : () => {};
  featuredDocumentId = id;
  if (view === 'library') { libraryState.scrollTop = $('#library-view').scrollTop; persistLibrary(); }
  if (id === readerDocumentId && restorePosition) {
    view = 'reader'; workspaceLayout?.setState({ focused: true }); updateView(); active.lastOpenedAt = Date.now();
    requestAnimationFrame(() => { restoreReadingPosition(active.readingState); rememberReader(); });
    $('#reader-view .reader-controls button')?.focus({ preventScroll: true });
    transfer($('#document-content .pdf-page, #document-content .slide-canvas') || $('#document-content'));
    return;
  }
  const generation = ++openGeneration;
  const previousDocument = active?.id;
  rememberReader();
  clearTimeout(scrollTimer);
  stopRequest(); clearSelection(); currentRecord = null; panel = 'explain';
  readingTools?.reset();
  readerDocumentId = null;
  await teardownPdf();
  if (generation !== openGeneration) return;
  slideReader.destroy();
  active = documents.find(d => d.id === id) || documents[0];
  const saved = restorePosition ? active.readingState : null;
  const session = restorePosition ? readerSessions.get(active.id) : null;
  readingTools?.reset(saved || {});
  pdfMode = active.type === 'pdf' && (saved?.pdfMode === 'original' || (!saved?.pdfMode && (active.pages > 80 || active.scanned))) ? 'original' : 'reflow'; pdfZoom = Math.max(.6, Math.min(1.6, saved?.pdfZoom || 1));
  pdfPageLayout = saved?.pdfPageLayout === 'double' ? 'double' : 'single';
  pdfSpreadFit = saved?.pdfSpreadFit === 'page' ? 'page' : 'width';
  slideMode = saved?.slideMode === 'text' ? 'text' : 'region'; slideZoom = Math.max(.6, Math.min(1.6, saved?.slideZoom || 1));
  selectMode = saved?.selectMode === 'sentence' ? 'sentence' : 'word';
  active.lastOpenedAt = Date.now();
  view = 'reader';
  outlineSidebar?.show();
  updateView(); workspaceLayout?.setState({ focused: true }); renderLibrary();
  if (isPresentation()) {
    $('#slide-number').innerHTML = active.slides.map(slide => `<option value="${slide.page}">${slide.page} / ${active.pages}</option>`).join('');
    slideReader.render(active, slideMode, slideZoom);
  } else if (pdfMode === 'original') await renderOriginalPdf(); else renderText();
  if (generation !== openGeneration) return;
  readerDocumentId = active.id;
  currentRecord = session?.currentRecord || records.find(record => record.id === saved?.recordId && record.docId === active.id) || null;
  selection = session?.selection || (currentRecord ? structuredClone(currentRecord.selected) : saved?.selected || null);
  history = session?.history || conversationHistory(currentRecord, records);
  panel = session?.panel || 'explain'; previewExpanded = session?.previewExpanded || false;
  $('#question').value = saved?.draft || ''; sizeQuestion();
  renderAssistant();
  if (isPresentation() && selection?.region) {
    slideReader.showSelection(selection);
    if (selection.includeImage && !selection.image) { const canvas = $(`.ppt-slide[data-page="${Number(selection.page)}"] .slide-canvas`); if (canvas) await slideReader.selectRegion(canvas, selection.region, true); }
  } else if (selection?.blockId && pdfMode === 'reflow') {
    const paragraph = $$('[data-block]').find(el => el.dataset.block === selection.blockId);
    const at = paragraph?.textContent.indexOf(selection.text) ?? -1;
    if (at >= 0) { selectionRange = rangeForOffsets(paragraph, at, at + selection.text.length); if (selectionRange && globalThis.Highlight && CSS.highlights) CSS.highlights.set('read-selection', new Highlight(selectionRange)); }
  }
  if (generation !== openGeneration) return;
  $('#pdf-mode').classList.toggle('hidden', active.type !== 'pdf');
  $('#pdf-navigation').classList.toggle('hidden', active.type !== 'pdf');
  $('#pdf-page-number').max = active.pages || 1;
  $('#pdf-page-total').textContent = '/ ' + (active.pages || 1);
  syncPdfPageLayout();
  setPressed('[data-pdf-mode]', b => b.dataset.pdfMode === pdfMode);
  $('#ppt-mode').classList.toggle('hidden', !isPresentation());
  $('#slide-navigation').classList.toggle('hidden', !isPresentation());
  $('[data-select-mode]').closest('.reading-mode').classList.toggle('hidden', isPresentation());
  setPressed('[data-slide-mode]', b => b.dataset.slideMode === slideMode);
  setPressed('[data-select-mode]', b => b.dataset.selectMode === selectMode);
  $('#slide-hint').textContent = '拖动框选图片或文字，再向右侧助手提问';
  $('#font-value').textContent = isPresentation() ? Math.round(slideZoom * 100) + '%' : pdfMode === 'original' ? Math.round(pdfZoom * 100) + '%' : fontSize + ' px';
  $('#source-format').textContent = active.type === 'sample' ? '原创教学示例' : active.type.toUpperCase() + (isPresentation() ? ' · ' + (active.renderer || '原版') : ' · 原文');
  $('#breadcrumb-title').textContent = active.title;
  $('#doc-meta').textContent = isPresentation() ? `${active.pages} 张幻灯片 · ${active.renderer || '演示文稿'} 原版` : active.type === 'sample' ? '原创教学示例 · 可点击标记术语' : active.type === 'pdf' ? `${active.pages} 页 PDF · 本地解析` : active.type === 'docx' ? 'Word 正文 · 本地解析' : '文本 · 本地保存';
  try { localStorage.setItem(storagePrefix + '-active', active.id); } catch { /* Nonessential preference. */ }
  requestAnimationFrame(() => { if (generation !== openGeneration) return; restoreReadingPosition(saved || { scrollTop: restorePosition ? active.scrollTop || 0 : 0 }); $('#assistant-body').scrollTop = session?.assistantScroll || 0; requestAnimationFrame(() => rememberReader()); });
  if (previousDocument && previousDocument !== active.id) revealSurface($('#document-content'));
  transfer($('#document-content .pdf-page, #document-content .slide-canvas') || $('#document-content'));
}

function updateView() {
  workspaceLayout?.cancelPromotion();
  closeTermPeek();
  $('.app-shell').dataset.view = view;
  $('#focus-toggle').classList.toggle('hidden', view !== 'reader');
  $('.reader-back').classList.toggle('hidden', view !== 'reader');
  $('.brand').classList.toggle('hidden', view === 'reader');
  $('#library-view').classList.toggle('hidden', view !== 'library');
  $('#reader-view').classList.toggle('hidden', view !== 'reader');
  $('#reader-workspace').classList.toggle('hidden', view !== 'reader');
  $('#collection-view').classList.toggle('hidden', !['notes', 'terms'].includes(view));
  $$('[data-view]').forEach(b => {
    const current = b.dataset.view === view;
    b.classList.toggle('active', current);
    if (current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  updateLibraryNavigation(); workspaceLayout?.refresh();
  $('#view-label').textContent = view === 'library' ? '本机阅读空间' : view === 'reader' ? '' : view === 'notes' ? '阅读记录' : '我的术语本';
  $('#breadcrumb-title').textContent = view === 'reader' ? active?.title || '' : '我的阅读空间';
  document.title = view === 'reader' ? `${active?.title || '阅读'} · Clever Read` : `${view === 'library' ? '文档库' : $('#view-label').textContent} · Clever Read`;
  if (view !== 'reader') { $('#selection-tools').classList.add('hidden'); if (view !== 'library') renderCollection(); }
}

function quoteHtml(selected) {
  if (!selected) return '';
  const image = selected.image && /^data:image\/(jpeg|png);base64,/.test(selected.image) ? escape(selected.image) : '';
  const page = selected.quotes?.length ? `原文 · ${selected.quotes.length} 段引用` : selected.page ? '第 ' + selected.page + (selected.sourceType === 'slide' ? ' 张' : ' 页') : '原文';
  return `<section class="selected-quote"><details class="selection-preview"${previewExpanded ? ' open' : ''}><summary>${image ? `<img class="selection-thumb" src="${image}" alt="选区缩略图">` : `<span class="selection-thumb text-thumb">${icon('note')}</span>`}<span class="selection-summary"><strong>${page} · ${selected.includeImage ? '图片与文字' : '文字选区'}</strong><span>${escape(selected.hasText === false ? '框选的图片区域' : selected.text.slice(0, 75))}</span><small>点击查看选区</small></span>${icon('chevron')}</summary><div class="selection-detail">${image ? `<img class="region-preview" src="${image}" alt="框选区域截图">` : ''}<div class="selected-text">${escape(selected.text)}</div><p class="region-caption">${selected.includeImage ? '提问时发送这张截图及选区文字' : '提问时仅发送选区文字'}</p></div></details><button class="selection-cancel icon-button" data-action="dismiss-selection" aria-label="取消选区" title="取消选区（Esc）">${icon('close')}</button></section>`;
}

function renderAssistant() {
  renderAssistantContent();
  if (view === 'reader' && !workspaceLayout?.getState().focused && !$('.assistant-panel').classList.contains('assistant-morphing')) revealSurface($('#assistant-body'), 3, 180);
}

function renderAssistantContent() {
  setPressed('[data-panel]', b => b.dataset.panel === panel);
  updateComposer();
  const target = $('#assistant-body');
  target.setAttribute('aria-live', requestPending ? 'off' : 'polite');
  target.setAttribute('aria-busy', 'false');
  if (panel === 'history') {
    const docRecords = records.filter(r => r.docId === active?.id);
    target.innerHTML = docRecords.length ? docRecords.map(r => `<div class="mini-record"><button data-record="${escape(r.id)}"><strong>${escape(r.result.title)}</strong><p>${escape(r.question || r.selected.text)}</p><span>${timeLabel(r.createdAt)} · ${r.result.mode === 'model' ? '模型解读' : '内置词典 / 原文对照'}</span></button></div>`).join('') : '<div class="empty-collection"><p>本篇还没有阅读记录。<br>选中一段原文，开始第一个问题。</p></div>';
    return;
  }
  if (requestPending) {
    target.setAttribute('aria-busy', 'true');
    renderLiveTurn();
    return;
  }
  if (failedRequest?.docId === active?.id) {
    if (currentRecord) renderAnswer(currentRecord); else target.innerHTML = quoteHtml(selection);
    target.insertAdjacentHTML('beforeend', `<div class="error-state" role="alert"><h2>暂时无法完成解读</h2>${escape(failedRequest.message)}<br><button data-action="retry-answer">重试</button><button data-action="models">检查模型连接</button></div>`);
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
  const dictionaryResult = r.localKind === 'dictionary' || !r.localKind && record.action === 'explain' && !!findTerm(record.selected.text);
  const sources = record.contexts.filter(c => r.sources.includes(c.id));
  const previousTurns = conversationTurns(record, records).slice(0, -1);
  const sourceLinks = (items, sourceRecord) => `<div class="source-links">${items.map((c, i) => `<button class="source-link" data-source="${escape(c.id)}" data-source-record="${escape(sourceRecord.id)}" title="${escape(c.text)}">${i + 1} · ${escape(c.page ? '第 ' + c.page + (sourceRecord.selected.sourceType === 'slide' ? ' 张' : ' 页') : c.section || '原文')}${icon('arrow-right')}</button>`).join('')}</div>`;
  const thread = previousTurns.length ? `<details class="answer-thread"><summary>前文 · ${previousTurns.length} 轮问答${icon('chevron')}</summary><div class="thread-turns">${previousTurns.map(turn => `<details class="thread-turn"><summary>${escape(turnQuestion(turn))}${icon('chevron')}</summary><div class="prose">${renderExplanation(turn.result.summary)}</div>${sourceLinks(turn.contexts.filter(c => turn.result.sources.includes(c.id)), turn)}</details>`).join('')}</div></details>` : '';
  const question = record.question ? `<p class="answer-question">${escape(record.question)}</p>` : '';
  const detail = (title, content, open = false) => `<details class="answer-detail"${open ? ' open' : ''}><summary>${title}${icon('chevron')}</summary>${content}</details>`;
  const background = r.background ? detail('知识补充', `<div class="answer-mode">通用背景知识</div><div class="answer-context prose">${renderExplanation(r.background)}</div>`) : '';
  $('#assistant-body').innerHTML = `${quoteHtml(record.selected)}${thread}
    <div class="answer-heading"><h2 class="answer-title">${escape(r.title)}</h2><span class="answer-mode">${record.status === 'stopped' ? '已停止 · 部分回答' : record.status === 'failed' ? '生成中断 · 部分回答' : r.mode === 'model' ? (r.briefOnly ? '语境短释义' : '模型解读 · ' + escape(record.depth)) + (r.cached ? ' · 本机缓存' : '') : dictionaryResult ? '内置词典 · 未调用模型' : '原文对照 · 未调用模型'}</span></div>
    ${question}<div class="answer-summary prose">${renderExplanation(r.summary)}</div>
    ${r.context ? r.context.length <= 140 ? `<section class="answer-context-inline"><h3>本文语境</h3><div class="prose">${renderExplanation(r.context)}</div></section>` : detail('本文语境', `<div class="answer-context prose">${renderExplanation(r.context)}</div>`) : ''}${background}
    ${r.logic.length ? detail('逻辑拆解', `<ol class="answer-logic">${r.logic.map(item => `<li class="prose">${renderExplanation(item)}</li>`).join('')}</ol>`, record.action === 'logic') : ''}
    ${sources.length ? `<div class="answer-sources"><span>${r.mode === 'model' ? '原文定位' : '相关原文'}</span>${sourceLinks(sources, record)}</div>` : ''}
    ${r.limitations ? `<div class="answer-limits">${escape(r.limitations)}</div>` : ''}${record.status ? `<div class="answer-actions"><button data-action="regenerate-answer">重新生成这条回答</button></div>` : ''}
    ${r.mode !== 'model' ? `<div class="answer-actions"><button data-action="models">${icon('message')}连接模型，按本文语境解释</button></div>` : ''}`;
}

function closeTermPeek(keepRequest = false, restoreFocus = false, animate = true) {
  const trigger = termPeek?.trigger;
  if (animate && !$('#term-peek').classList.contains('hidden')) leaveSurface($('#term-peek'), { axis: 'y', distance: 3 });
  if (keepRequest !== true) termPeek?.controller?.abort();
  termPeek = null; termPeekRange = null;
  $('#term-peek').classList.add('hidden');
  globalThis.CSS?.highlights?.delete('read-peek');
  if (restoreFocus) trigger?.focus({ preventScroll: true });
}
function positionTermPeek() {
  if (!termPeekRange || view !== 'reader') return closeTermPeek();
  const rect = termPeekRange.getBoundingClientRect(), peek = $('#term-peek');
  const reading = $('#reading-scroll').getBoundingClientRect();
  if (!rect.width || rect.bottom < reading.top || rect.top > reading.bottom) return closeTermPeek();
  peek.style.maxHeight = '';
  const left = Math.max(reading.left + 8, Math.min(rect.left, reading.right - peek.offsetWidth - 8));
  const belowSpace = Math.min(reading.bottom, innerHeight - 12) - rect.bottom - 18;
  const aboveSpace = rect.top - Math.max(reading.top, 12) - 18;
  const below = belowSpace >= peek.offsetHeight || belowSpace >= aboveSpace;
  peek.style.maxHeight = Math.max(120, below ? belowSpace : aboveSpace) + 'px';
  const top = below ? rect.bottom + 10 : rect.top - peek.offsetHeight - 10;
  peek.style.left = Math.max(12, Math.min(left, innerWidth - peek.offsetWidth - 12)) + 'px'; peek.style.top = Math.min(top, innerHeight - peek.offsetHeight - 12) + 'px';
  peek.style.transformOrigin = `${Math.max(10, Math.min(peek.offsetWidth - 10, rect.left - parseFloat(peek.style.left) + Math.min(rect.width / 2, 24)))}px ${below ? '0' : '100%'} `;
}
function renderTermPeek() {
  if (!termPeekRange || !termPeek || view !== 'reader') return;
  const peek = $('#term-peek'), entering = peek.classList.contains('hidden');
  const { selected, result, pending, error } = termPeek;
  const focusedAction = peek.contains(document.activeElement) ? document.activeElement.dataset.action : '';
  const unknown = result?.mode === 'local' && result.localKind === 'context';
  const label = pending ? '生成中…' : error ? '未完成' : result?.cached ? '本机缓存' : result?.mode === 'model' ? '语境释义' : unknown ? '未收录' : '内置词典';
  const copy = result?.brief || result?.summary;
  peek.innerHTML = `<div class="term-peek-heading"><strong>${escape(selected.text)}</strong><span class="term-peek-label">${label}</span>${result?.cached ? `<button class="icon-button" data-action="retry-peek" aria-label="重新生成短释义" title="重新生成短释义">${icon('refresh')}</button>` : ''}<button class="icon-button" data-action="close-peek" aria-label="关闭术语解释">${icon('close')}</button></div><div class="term-peek-copy">${escape(error || (copy ? briefExplanation(copy) : pending ? '正在结合语境解读…' : ''))}</div><div class="term-peek-actions">${error ? '<button data-action="retry-peek">重试</button><button data-action="models">模型连接</button>' : unknown ? '<button data-action="models">连接模型解释' + icon('arrow-right') + '</button><button data-action="peek-detail">查看原文</button>' : '<button data-action="peek-detail">继续解读' + icon('arrow-right') + '</button><button data-action="ask-focus">追问</button>'}</div>`;
  peek.setAttribute('aria-busy', String(pending));
  peek.classList.remove('hidden'); positionTermPeek();
  if (entering) move(peek, [{ opacity: 0, transform: 'translateY(4px) scale(.97)' }, { opacity: 1, transform: 'none' }], 200);
  if (focusedAction) peek.querySelector(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
}

function timeLabel(timestamp) { return new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }); }

function renderCollection() {
  $('#collection-title').textContent = view === 'terms' ? '我的术语本' : '阅读记录';
  $('#collection-description').textContent = view === 'terms' ? '记住概念，也保留它出现的语境。' : '保存的疑问与解读，随时回到原文。';
  const query = $('#record-search').value.toLowerCase().trim();
  const filtered = records.filter(r => (view !== 'terms' || r.starred) && `${r.result.title} ${r.result.summary} ${r.selected.text} ${r.question} ${r.docTitle}`.toLowerCase().includes(query));
  $('#records-list').innerHTML = filtered.length ? filtered.map(r => `<article class="record-card"><div class="record-card-meta"><span>${escape(r.docTitle)}</span><span>${timeLabel(r.createdAt)}</span></div><h2>${escape(r.result.title)}</h2><blockquote>${escape(r.selected.text)}</blockquote><p>${escape(r.result.summary)}</p><div class="record-card-footer"><button data-record="${escape(r.id)}">${icon('open-book')}查看解读</button><button data-delete-record="${escape(r.id)}" aria-label="删除这条记录">${icon('trash')}</button></div></article>`).join('') : `<div class="empty-collection">${icon(view === 'terms' ? 'bookmark' : 'note')}<p>${query ? '没有找到匹配的记录。' : view === 'terms' ? '术语本还空着。<br>在解读中点击“加入术语本”，保存值得记住的概念。' : '还没有阅读记录。<br>打开文档，选中内容，开始提问。'}</p></div>`;
}

function setSelection(value, range, inline = false) {
  workspaceLayout?.cancelPromotion();
  closeTermPeek();
  const text = normalizeText(value.text);
  if (!text) return false;
  if (text.length > 8000) { toast('选区过长，请选择不超过 8000 字的一段内容。'); return false; }
  if (inline) {
    const node = range?.commonAncestorContainer;
    const trigger = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('[data-term]');
    termPeek = { docId: active.id, selected: { ...value, text }, range: range?.cloneRange() || null, trigger, pending: false, result: null, error: '', controller: null };
    if (range && globalThis.Highlight && CSS.highlights) CSS.highlights.set('read-peek', new Highlight(range));
    return true;
  }
  const changed = !sameTarget(selection, { ...value, text });
  if (changed) { stopRequest(); history = []; currentRecord = null; previewExpanded = false; failedRequest = null; $('#question-status').textContent = ''; }
  selection = { ...value, text };
  selectionRange = range?.cloneRange() || null;
  panel = 'explain';
  if (selectionRange && globalThis.Highlight && CSS.highlights) CSS.highlights.set('read-selection', new Highlight(selectionRange));
  renderAssistant();
  rememberReader();
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

$('#document-content').addEventListener('keydown', event => {
  const term = event.target.closest('[data-term]');
  if (!term || !settings.clickAssist || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  const found = blockForNode(term); if (!found) return;
  const range = document.createRange(); range.selectNodeContents(term);
  if (!setSelection({ text: term.textContent, blockId: found.block.id, page: found.block.page }, range, true)) return;
  termPeekRange = range;
  ask('explain', '', 'peek');
  $('#term-peek [data-action="close-peek"]')?.focus({ preventScroll: true });
});

$('#document-content').addEventListener('click', async event => {
  if (!settings.clickAssist || event.detail > 1 || window.getSelection()?.toString().trim()) return;
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
  if (!setSelection({ text: part.text, blockId: found.block.id, page: found.block.page }, range, selectMode === 'word')) return;
  if (selectMode === 'word' && range) {
    const peekRange = range.cloneRange(), x = event.clientX, y = event.clientY;
    termPeekRange = { getBoundingClientRect: () => {
      const rect = peekRange.getBoundingClientRect();
      const clicked = Array.from(peekRange.getClientRects()).find(part => x >= part.left && x <= part.right && y >= part.top && y <= part.bottom);
      return clicked ? { top: rect.top, bottom: rect.bottom, left: clicked.left, right: clicked.right, width: clicked.width, height: rect.height } : rect;
    } };
    await ask('explain', '', 'peek');
  }
  else showSelectionTools(range);
});

function modelReady() {
  if (!settings.enabled) return false;
  if (!settings.endpoint || !settings.model) return false;
  try { return !!apiKey || !!profiles.find(profile => profile.id === settings.profileId)?.hasKey || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(settings.endpoint).hostname); } catch { return false; }
}

function updateModelStatus() {
  const label = !settings.enabled ? '内置词典' : modelReady() ? profiles.find(profile => profile.id === settings.profileId)?.name || settings.model : '待补充模型设置';
  $('#model-status').innerHTML = icon('message') + `<span class="status-label">${escape(label)}</span>`;
  $('#model-status').dataset.state = modelReady() ? 'ready' : 'local';
  outlineSidebar?.render();
  $('#model-status').title = !settings.enabled ? '内置词典与原文对照 · 未调用模型，点击选择连接' : (settings.model || '点击设置') + ' · ' + (settings.vision ? '支持图片与文字' : '仅文字');
}

const modelIdentity = () => [settings.endpoint, settings.model, settings.profileId];

async function loadCachedExplanation(key) {
  const memory = answerCache.get(key);
  if (memory) return { ...memory, cached: true };
  try {
    const entry = await storage('explanations', 'get', key);
    if (entry?.result && Date.now() - entry.createdAt < 30 * 86400_000) { answerCache.set(key, entry.result); return { ...entry.result, cached: true }; }
  } catch { /* Cache failure must never prevent a model request. */ }
  return null;
}

async function saveCachedExplanation(key, result, docId, kind) {
  answerCache.set(key, result);
  if (answerCache.size > 80) answerCache.delete(answerCache.keys().next().value);
  try {
    await storage('explanations', 'put', { id: key, docId, kind, result, createdAt: Date.now() });
    if (++cacheWrites % 20 === 1) {
      const entries = await storage('explanations', 'getAll');
      const expired = entries.sort((a, b) => b.createdAt - a.createdAt).slice(800);
      if (expired.length) { const tx = db.transaction('explanations', 'readwrite'); for (const item of expired) tx.objectStore('explanations').delete(item.id); }
    }
  } catch { /* The received answer remains usable without persistent cache. */ }
}

async function briefFor(doc, selected, contexts, controller, force, onPartial) {
  if (!modelReady()) return localExplanation(doc, selected, 'explain', contexts);
  const connection = { profileId: settings.profileId || undefined, endpoint: settings.endpoint, model: settings.model, apiKey };
  const key = await explanationKey({ kind: 'brief', doc, selected, contexts, model: [connection.endpoint, connection.model, connection.profileId || ''], depth: 'brief' });
  const cached = force ? null : await loadCachedExplanation(key);
  controller.signal.throwIfAborted();
  if (cached) return cached;
  const requestSelection = { ...selected }; delete requestSelection.image;
  const response = await fetch('/api/answer', { method: 'POST', signal: controller.signal, headers: apiHeaders(), body: JSON.stringify({ ...connection, brief: true, stream: true, action: 'explain', selected: requestSelection, documentTitle: doc.title, contexts }) });
  let raw = '';
  const result = await readAnswerStream(response, delta => { raw += delta; onPartial(partialAnswer(raw)); });
  controller.signal.throwIfAborted();
  await saveCachedExplanation(key, result, doc.id, 'brief');
  return result;
}

async function explanationFor(doc, selected, action, question, contexts, requestHistory, controller, force = false, onDelta = null) {
  const requestSelection = { ...selected }; delete requestSelection.image;
  const cacheKey = JSON.stringify([doc.id, requestSelection, action, question, contexts, settings.depth, settings.enabled, settings.endpoint, settings.model, settings.profileId, settings.vision, requestHistory]);
  const persistentKey = modelReady() ? await explanationKey({ kind: 'full:' + action + ':' + question, doc, selected, contexts, model: modelIdentity(), depth: settings.depth, history: requestHistory }) : null;
  let result = force ? null : persistentKey ? await loadCachedExplanation(persistentKey) : answerCache.get(cacheKey);
  controller.signal.throwIfAborted();
  if (!result) {
    if (modelReady()) {
      const response = await fetch('/api/answer', { method: 'POST', signal: controller.signal, headers: apiHeaders(), body: JSON.stringify({ profileId: settings.profileId || undefined, endpoint: settings.endpoint, model: settings.model, apiKey, vision: settings.vision, stream: !!onDelta, image: selected.includeImage ? selected.image : undefined, action, question, depth: settings.depth, selected: requestSelection, documentTitle: doc.title, contexts, history: requestHistory }) });
      if (onDelta) result = await readAnswerStream(response, onDelta);
      else { const data = await response.json(); if (!response.ok) throw new Error(data.error || '模型请求失败。'); result = data.result; }
    } else result = localExplanation(doc, selected, action, contexts);
    controller.signal.throwIfAborted();
    answerCache.set(cacheKey, result);
    if (answerCache.size > 80) answerCache.delete(answerCache.keys().next().value);
    if (persistentKey) await saveCachedExplanation(persistentKey, result, doc.id, 'full');
  }
  return result;
}

async function finishPromotedPeek(state) {
  if (state.panelGeneration !== requestGeneration || active.id !== state.docId) return;
  requestPending = false; requestController = null;
  $('#question-status').textContent = '';
  if (state.error) {
    failedRequest = { action: 'explain', question: '', surface: 'panel', docId: state.docId, message: state.error };
    renderAssistant(); return;
  }
  const record = { id: crypto.randomUUID(), parentId: null, docId: state.docId, docTitle: active.title, selected: state.selected, question: '', action: 'explain', contexts: state.contexts, result: state.result, depth: state.depth, createdAt: Date.now(), starred: false };
  try {
    await storage('records', 'put', record);
    records.unshift(record); updateCounts();
    if (state.panelGeneration !== requestGeneration || active.id !== state.docId) return;
    currentRecord = record;
    history = conversationHistory(record, records);
    renderAssistant(); $('#assistant-body').scrollTop = 0; rememberReader();
    if (state.result.briefOnly && !state.focusQuestion) await ask('explain');
  } catch { if (state.panelGeneration === requestGeneration) { failedRequest = { action: 'explain', question: '', surface: 'panel', docId: state.docId, message: '无法保存阅读记录，请检查本机存储空间后重试。' }; renderAssistant(); } }
}

async function askTermPeek(force = false) {
  const state = termPeek;
  if (!state) return;
  state.controller?.abort();
  const controller = new AbortController(); state.controller = controller;
  state.pending = true; state.error = ''; state.result = null; state.depth = settings.depth;
  state.contexts = retrieveContext(active, state.selected, '', 4);
  renderTermPeek();
  try {
    if (settings.enabled && !modelReady()) throw new Error('请在模型连接中补充模型信息或密钥。');
    state.result = await briefFor(active, state.selected, state.contexts, controller, force, result => {
      if (controller.signal.aborted) return;
      state.result = result;
      if (termPeek === state && !state.promoted) { $('#term-peek .term-peek-copy').textContent = result.brief || result.summary || '正在结合语境解读…'; positionTermPeek(); }
    });
  } catch (error) {
    if (controller.signal.aborted) return;
    state.error = error.message;
  }
  if (controller.signal.aborted) return;
  state.pending = false;
  if (state.promoted) await finishPromotedPeek(state);
  else if (termPeek === state) renderTermPeek();
}

async function promoteTermPeek(focusQuestion = false) {
  const state = termPeek;
  if (!state || active.id !== state.docId) return;
  const origin = { rect: $('#term-peek').getBoundingClientRect(), content: $('#term-peek').cloneNode(true) };
  closeTermPeek(true, false, false);
  stopRequest();
  setSelection(state.selected, state.range);
  state.promoted = true; state.focusQuestion = focusQuestion; state.panelGeneration = requestGeneration;
  workspaceLayout?.promoteAssistant(origin, { focusQuestion });
  if (state.pending) {
    requestPending = true; requestController = state.controller;
    renderAssistant();
  } else await finishPromotedPeek(state);
}

function renderLiveTurn() {
  const turn = liveTurn;
  const previous = turn?.previous;
  const target = $('#assistant-body');
  target.setAttribute('aria-live', 'off');
  const prior = previous ? `<details class="answer-thread" open><summary>上一轮 · ${escape(turnQuestion(previous))}${icon('chevron')}</summary><div class="prose">${renderExplanation(previous.result.summary)}</div></details>` : '';
  target.innerHTML = prior + `<section class="live-answer"><p class="pending-question">${escape(turn?.record.question || (turn?.record.action === 'logic' ? '拆解选区逻辑' : '解释当前选区'))}</p><div class="stream-state" role="status">${turn?.raw ? '正在生成' : '正在连接模型…'}</div><h2 class="answer-title live-title"></h2><div class="live-summary"></div><div class="live-context"></div><button type="button" class="quiet-button" data-action="cancel-request">停止生成</button></section>`;
  if (turn?.raw) updateLiveTurn();
}

function updateLiveTurn() {
  if (!liveTurn || panel !== 'explain') return;
  const target = $('#assistant-body');
  if (!target.querySelector('.live-answer')) renderLiveTurn();
  const partial = partialAnswer(liveTurn.raw);
  target.querySelector('.live-title').textContent = partial.title;
  target.querySelector('.live-summary').textContent = partial.summary || partial.brief;
  target.querySelector('.live-context').textContent = partial.context;
  const status = partial.summary ? '正在生成' : '正在整理语境…';
  if (target.querySelector('.stream-state').textContent !== status) target.querySelector('.stream-state').textContent = status;
  if (followAnswer) target.scrollTop = target.scrollHeight;
}

function retainLiveTurn(status, error = '') {
  const turn = liveTurn; if (!turn) return;
  liveTurn = null;
  const result = partialAnswer(turn.raw);
  result.summary ||= '尚未收到回答正文。';
  const record = { ...turn.record, status, result: { ...result, limitations: error || '回答已停止，内容可能尚不完整。' } };
  currentRecord = record; records.unshift(record); updateCounts();
  storage('records', 'put', record).catch(() => toast('部分回答未能保存，请检查本机存储空间。'));
  rememberReader();
}

async function ask(action, question = '', surface = 'panel', force = false) {
  if (surface === 'peek') return askTermPeek();
  readingTools?.closeComparison();
  if (surface !== 'peek') { closeTermPeek(); workspaceLayout?.revealAssistant(); }
  previewExpanded = false;
  if (!selection && !readingTools?.quotes.length) { toast('请先点击词语或选中一段原文。'); return; }
  if (settings.enabled && !modelReady()) { toast('请在设置中补充模型信息或密钥。'); showSettings('models'); return; }
  const candidate = force && currentRecord ? structuredClone(currentRecord.selected) : structuredClone(readingTools?.combined() || selection);
  if (candidate.includeImage && (!modelReady() || !settings.vision)) { toast('图片提问需要连接支持图片输入的模型；也可仅使用选区文字。'); renderAssistant(); return; }
  if (candidate.includeImage && !candidate.image) {
    const imageQuote = candidate.quotes?.find(q => q.includeImage) || candidate;
    const image = $(`.ppt-slide[data-page="${Number(imageQuote.page)}"] .slide-image`);
    if (!image || !imageQuote.region) { toast('截图无法恢复，请重新框选。'); return; }
    candidate.image = await cropRegion(image, imageQuote.region);
  }
  stopRequest();
  const generation = requestGeneration;
  requestPending = true;
  pendingQuestion = action === 'ask' ? question : '';
  failedRequest = null;
  $('#question-status').textContent = '正在生成…';
  const selected = candidate;
  const doc = active;
  const contexts = quotedContexts(doc, selected, question);
  panel = 'explain';
  setPressed('[data-panel]', b => b.dataset.panel === panel);
  $('#selection-tools').classList.add('hidden');
  updateComposer();
  $('#assistant-body').setAttribute('aria-busy', 'true');
  const previous = currentRecord?.docId === doc.id && sameTarget(currentRecord.selected, selected) ? currentRecord : null;
  const parentId = force ? previous?.parentId || null : previous?.id || null;
  liveTurn = { raw: '', previous, record: { id: crypto.randomUUID(), parentId, replacesId: force ? previous?.id : undefined, docId: doc.id, docTitle: doc.title, selected, question, action, contexts, depth: settings.depth, createdAt: Date.now(), starred: false } };
  followAnswer = true; renderLiveTurn();
  if (pendingQuestion) {
    questionTransfer(pendingQuestion, $('#question-form'), $('.pending-question'));
    if ($('#question').value.trim() === question) $('#question').value = '';
    updateComposer();
  }
  const parent = records.find(record => record.id === parentId);
  const requestHistory = action === 'ask' ? conversationHistory(parent, records) : [];
  try {
    requestController = new AbortController();
    const result = await explanationFor(doc, selected, action, question, contexts, requestHistory, requestController, force, delta => {
      if (generation !== requestGeneration || !liveTurn) return;
      liveTurn.raw += delta;
      if (!streamPaint) streamPaint = requestAnimationFrame(() => { streamPaint = 0; updateLiveTurn(); });
    });
    if (generation !== requestGeneration || active.id !== doc.id) return;
    const record = { ...liveTurn.record, result };
    liveTurn = null;
    await storage('records', 'put', record);
    records.unshift(record);
    if (generation !== requestGeneration || active.id !== doc.id) { updateCounts(); return; }
    currentRecord = record;
    requestPending = false;
    pendingQuestion = '';
    history = conversationHistory(record, records);
    const previousScroll = $('#assistant-body').scrollTop;
    updateCounts(); renderAssistant();
    $('#assistant-body').scrollTop = followAnswer ? $('#assistant-body').scrollHeight : previousScroll;
    sizeQuestion();
    if (view === 'reader') rememberReader();
    else if (active.readingState) { const selectedState = { ...selected }; delete selectedState.image; active.readingState = { ...active.readingState, recordId: record.id, selected: selectedState, draft: $('#question').value }; await storage('readingStates', 'put', active.readingState); const session = readerSessions.get(active.id); if (session) Object.assign(session, { currentRecord: record, history: [...history] }); }
  } catch (error) {
    if (generation !== requestGeneration || error.name === 'AbortError') return;
    retainLiveTurn('failed', error.message);
    failedRequest = { action, question, surface, docId: doc.id, message: error.message };
    if (pendingQuestion && !$('#question').value.trim()) $('#question').value = pendingQuestion;
    pendingQuestion = '';
    $('#question-status').textContent = '生成失败，问题已保留。';
    if (currentRecord) renderAnswer(currentRecord);
    $('#assistant-body').insertAdjacentHTML('beforeend', `<div class="error-state" role="alert">${escape(error.message)}<br><button data-action="retry-answer">重试</button><button data-action="models">检查模型连接</button></div>`);
  } finally {
    if (generation === requestGeneration) { requestController = null; requestPending = false; if (!failedRequest) $('#question-status').textContent = ''; updateComposer(); $('#assistant-body').setAttribute('aria-busy', 'false'); }
  }
}

async function showRecord(id) {
  const record = records.find(r => r.id === id);
  if (!record) return;
  if (documents.some(d => d.id === record.docId) && record.docId !== readerDocumentId) await openDocument(record.docId);
  else if (!readerDocumentId) await openDocument(active?.id || documents[0].id);
  view = 'reader'; updateView();
  workspaceLayout?.revealAssistant();
  stopRequest();
  selection = structuredClone(record.selected); currentRecord = record; panel = 'explain'; history = [];
  history = conversationHistory(record, records);
  if (!documents.some(d => d.id === record.docId)) {
    selection = null;
    toast('原文已移除，保留的解读和摘录仍可查看。');
  }
  renderAssistant();
  if (isPresentation() && selection?.region) { slideReader.jump(selection.page, scrollBehavior()); slideReader.showSelection(selection); }
  rememberReader();
}

async function locateSelection() {
  if (!selection || !active) return;
  const contexts = retrieveContext(active, selection);
  const source = contexts.find(c => c.id === selection.blockId) || contexts.find(c => c.page === selection.page) || contexts[0];
  if (source) await jumpToSource(source.id, { docId: active.id, selected: selection, contexts });
}

async function jumpToSource(id, record = currentRecord, returning = true) {
  const source = record?.contexts.find(c => c.id === id);
  if (!source) return;
  if (!documents.some(d => d.id === record.docId)) { toast('原文已移除，无法跳转。'); return; }
  if (active.id !== record.docId) { await openDocument(record.docId, false); selection = record.selected; currentRecord = record; renderAssistant(); }
  if (returning) return readingTools.navigateSource(source, () => jumpToSource(id, record, false));
  if (isPresentation() && source.page) { slideReader.jump(source.page, scrollBehavior()); if (record.selected.page === source.page) slideReader.showSelection(record.selected); return; }
  if (pdfMode === 'original' && source.page) {
    const page = document.querySelector(`.pdf-page[data-page="${source.page}"]`);
    if (!page) { toast('原文页面不存在，请重新导入文档。'); return; }
    page.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
    await renderPdfPage(page);
    const layer = page.querySelector('.textLayer');
    const text = layer?.textContent || '';
    const needle = source.text;
    const at = text.indexOf(needle);
    if (at >= 0 && text.indexOf(needle, at + 1) < 0 && globalThis.Highlight && CSS.highlights) {
      const range = rangeForOffsets(layer, at, at + needle.length);
      if (range) { CSS.highlights.set('source-link', new Highlight(range)); setTimeout(() => CSS.highlights.delete('source-link'), 3500); }
    } else { page.classList.add('source-flash'); setTimeout(() => page.classList.remove('source-flash'), 3000); toast('已定位到原文页面；当前排版无法精确对应句子。'); }
    return;
  }
  const element = Array.from($('#document-content').querySelectorAll('[data-block]')).find(el => el.dataset.block === id);
  if (element) {
    element.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }); element.classList.add('source-flash');
    setTimeout(() => element.classList.remove('source-flash'), 3000);
  }
}

function renderProfiles() {
  const radio = (id, checked, name, description, extra = '') => `<label><input type="radio" name="active-connection" value="${escape(id)}" ${checked ? 'checked' : ''}><span class="profile-copy"><span><strong>${escape(name)}</strong>${extra}</span>${description}</span></label>`;
  $('#model-profiles').innerHTML = '<legend class="sr-only">当前解读连接</legend>' + profiles.map(profile => `<article class="model-profile ${profile.id === settings.profileId && settings.enabled ? 'current' : ''}">${radio(profile.id, profile.id === settings.profileId && settings.enabled, profile.name, `<small>${escape(profile.model)}</small><small>${escape(profile.endpoint)}</small><small class="profile-key-status">${profile.hasKey ? '密钥已加密保存' : '未保存密钥'}</small>`, `<span class="profile-capability">${profile.vision ? '图文' : '文字'}</span>`)}<div class="profile-actions"><button type="button" data-edit-profile="${escape(profile.id)}" aria-label="编辑 ${escape(profile.name)}">编辑</button><button type="button" data-remove-profile="${escape(profile.id)}" aria-label="移除 ${escape(profile.name)}">移除</button></div></article>`).join('') + (!settings.profileId && settings.enabled && settings.model ? `<article class="model-profile">${radio('session', true, settings.model + ' · 本次会话', `<small>${escape(settings.endpoint)}</small><small>密钥未保存，关闭页面后失效。</small>`)}</article>` : '') + `<article class="model-profile">${radio('local', !settings.enabled, '内置词典 / 原文对照', '<small>内置术语与相关原文 · 未调用模型</small>')}</article>`;
  $('#vault-error').textContent = vaultError;
  $('#vault-error').classList.toggle('hidden', !vaultError);
  $('#vault-protection').textContent = vaultState.protection === 'windows-dpapi' ? 'API Key 使用本机 Windows 账户加密保存，重启后仍可使用。' : 'API Key 加密保存在本机，重启后仍可使用。';
}

$('#model-profiles').addEventListener('change', async event => {
  if (event.target.name !== 'active-connection') return;
  const id = event.target.value, submit = $('#settings-form button[type="submit"]');
  submit.disabled = true;
  $('#model-profiles').querySelectorAll('input').forEach(input => input.disabled = true);
  try {
    if (id === 'local') { stopRequest(); settings.enabled = false; }
    else if (id !== 'session') {
      await vaultRequest('/api/vault/activate', { method: 'POST', body: JSON.stringify({ id }) });
      stopRequest(); applyProfile(profiles.find(profile => profile.id === vaultState.activeId));
    }
    persistPreferences(); answerCache.clear(); updateModelStatus(); renderAssistant();
    toast(id === 'local' ? '已切换为内置词典与原文对照。' : '已切换模型连接。');
  } catch (error) {
    $('#settings-error').textContent = error.message; $('#settings-error').classList.remove('hidden');
  } finally {
    renderProfiles(); submit.disabled = false;
    Array.from($('#model-profiles').querySelectorAll('input')).find(input => input.checked)?.focus({ preventScroll: true });
  }
});

function setSettingsPane(next, focus = false) {
  settingsPane = next;
  $('#settings-dialog').dataset.pane = next;
  $('#reading-settings').classList.toggle('hidden', next !== 'reading');
  $('#model-settings').classList.toggle('hidden', next !== 'models');
  $('#model-editor').classList.toggle('hidden', next !== 'editor');
  setPressed('.settings-navigation [data-settings-pane]', b => b.dataset.settingsPane === (next === 'editor' ? 'models' : next));
  $('#key-help').classList.toggle('hidden', next === 'reading');
  $('#settings-error').classList.add('hidden');
  $('#settings-form button[type="submit"]').textContent = next === 'editor' ? '保存并使用' : next === 'models' ? '完成' : '保存设置';
  $('#settings-save-note').textContent = next === 'editor' ? '密钥留空可保留已保存密钥' : next === 'models' ? '切换模型后即时生效' : '外观可预览，保存后保留';
  // A hidden URL field must not validate an abandoned editor draft.
  $('#model-editor').querySelectorAll('input').forEach(input => input.disabled = next !== 'editor');
  $('.settings-body').scrollTop = 0;
  if ($('#settings-dialog').open) revealSurface($('.settings-body'), 4, 180);
  if (focus) (next === 'editor' ? $('#profile-name') : $('[data-action="new-profile"]')).focus({ preventScroll: true });
}

function fillModelDraft(profile = null) {
  editingProfileId = profile?.id || '';
  $('#profile-name').value = profile?.name || '';
  $('#endpoint').value = profile?.endpoint || '';
  $('#model').value = profile?.model || '';
  $('#model-vision').checked = profile?.vision ?? false;
  $('#api-key').value = '';
  $('#api-key').placeholder = profile?.hasKey ? '已保存；留空保留原密钥' : '输入对应模型服务的 API Key';
  $('#save-profile').checked = true;
  $('#model-editor-title').textContent = profile ? '编辑模型' : '新增模型';
  setSettingsPane('editor', true);
}

function showSettings(pane = 'reading') {
  closeTermPeek();
  $('#resume-on-launch').checked = settings.resumeOnLaunch;
  $('#reading-font').value = String(fontSize);
  $('#reading-leading').value = String(settings.lineHeight);
  $$('input[name="reading-theme"]').forEach(input => input.checked = input.value === settings.theme);
  $$('input[name="reading-style"]').forEach(input => input.checked = input.value === settings.style);
  $('#reading-motion').checked = settings.motion;
  $('#click-assist').checked = settings.clickAssist;
  $('#api-key').value = '';
  renderProfiles();
  setSettingsPane(pane);
  openDialog($('#settings-dialog'));
  moveStyleFrame();
}
$('#settings-dialog').addEventListener('close', () => { $('#api-key').value = ''; applyTheme(); });
$('#settings-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog($('#settings-dialog')); });
function previewAppearance() {
  applyTheme($('input[name="reading-theme"]:checked')?.value || settings.theme, $('input[name="reading-style"]:checked')?.value || settings.style, $('#reading-motion').checked);
}
$$('input[name="reading-theme"]').forEach(input => input.addEventListener('change', previewAppearance));
$$('input[name="reading-style"]').forEach(input => input.addEventListener('change', () => {
  if (!input.checked) return;
  $$('input[name="reading-theme"]').forEach(radio => radio.checked = radio.value === styleThemes[input.value]);
  previewAppearance(); moveStyleFrame();
}));
$('#reading-motion').addEventListener('change', previewAppearance);
new ResizeObserver(moveStyleFrame).observe($('.style-choices'));

$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#settings-form button[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    if (settingsPane !== 'editor') {
      if (settingsPane === 'reading') {
        const position = view === 'reader' ? readingPositionSnapshot() : null;
        fontSize = Number($('#reading-font').value);
        settings = { ...settings, fontSize, lineHeight: Number($('#reading-leading').value), clickAssist: $('#click-assist').checked, resumeOnLaunch: $('#resume-on-launch').checked, ...appearancePreferences({ style: $('input[name="reading-style"]:checked')?.value, theme: $('input[name="reading-theme"]:checked')?.value, motion: $('#reading-motion').checked }) };
        applyTheme();
        document.documentElement.style.setProperty('--body-size', fontSize + 'px');
        document.documentElement.style.setProperty('--body-leading', String(settings.lineHeight));
        if (!isPresentation() && pdfMode !== 'original') $('#font-value').textContent = fontSize + ' px';
        if (position) requestAnimationFrame(() => { restoreReadingPosition(position); requestAnimationFrame(() => rememberReader()); });
        persistPreferences();
      }
      await closeDialog($('#settings-dialog')); if (settingsPane === 'reading') toast('外观与阅读偏好已保存。');
      return;
    }
    let endpoint = normalizeEndpoint($('#endpoint').value.trim());
    const enteredModel = $('#model').value.trim();
    const model = normalizeModelName(enteredModel, endpoint);
    const key = $('#api-key').value.trim(), vision = $('#model-vision').checked;
    const save = $('#save-profile').checked;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname);
    if (!model) throw new Error('请填写模型 ID。');
    if (!local && !key && !(save && profiles.find(profile => profile.id === editingProfileId)?.hasKey)) throw new Error('请填写 API Key。');
    stopRequest();
    if (save) {
      await vaultRequest('/api/vault', { method: 'POST', body: JSON.stringify({ id: editingProfileId || undefined, name: $('#profile-name').value.trim() || model, endpoint, model, apiKey: key, vision }) });
      applyProfile(profiles.find(profile => profile.id === vaultState.activeId));
    } else { apiKey = key; settings = { ...settings, enabled: true, endpoint, model, profileId: '', vision }; }
    persistPreferences(); updateModelStatus(); answerCache.clear();
    $('#api-key').value = '';
    renderProfiles(); setSettingsPane('models'); renderAssistant();
    toast(model !== enteredModel ? `已保存并使用。模型 ID 已转换为 ${model}。` : save ? '模型已保存并启用。' : '已启用，仅用于本次会话。');
  } catch (error) {
    const message = $('#settings-error'); message.textContent = error.message;
    message.classList.remove('hidden'); message.focus(); message.scrollIntoView({ block: 'nearest', behavior: 'auto' });
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
  if (libraryState.filter.startsWith('category:')) doc.category = libraryState.filter.slice(9);
  await storage('documents', 'put', doc);
  documents.unshift(doc);
  closeDialog($('#import-dialog'));
  await openDocument(doc.id, false);
  toast('文档已加入阅读空间。');
}

async function choosePdfOutline(file) {
  const dialog = $('#outline-import-dialog');
  $('#outline-choice-file').textContent = file.name;
  $('#outline-choice-model').textContent = modelReady() ? `使用当前模型：${settings.model}。生成期间可以继续阅读。` : '尚未连接模型：选择生成后会保留入口，连接模型后再点击生成。';
  dialog.returnValue = '';
  return new Promise(resolve => {
    const choose = event => { const button = event.target.closest('[data-outline-choice]'); if (button) closeDialog(dialog, button.dataset.outlineChoice); };
    dialog.addEventListener('click', choose);
    dialog.addEventListener('close', () => { dialog.removeEventListener('click', choose); resolve(dialog.returnValue); }, { once: true });
    openDialog(dialog);
  });
}

async function handleFile(file) {
  if (!file || importing) return;
  importing = true; $('#file-input').disabled = true;
  try {
    const extension = file.name.split('.').at(-1).toLowerCase();
    validateImportFile(file, extension);
    if (extension === 'doc') throw new Error('旧版 .doc 暂不支持，请在文档编辑器中另存为 .docx。');
    if (!['pdf', 'docx', 'ppt', 'pptx', 'txt', 'md'].includes(extension)) throw new Error('请导入 PDF、Word (.docx)、PPT (.ppt / .pptx)、TXT 或 Markdown。');
    importController = new AbortController();
    $('#cancel-import').classList.remove('hidden'); $('#cancel-import').disabled = false;
    importProgress('正在检查文档…');
    const capacity = await navigator.storage?.estimate?.().catch(() => null);
    if (capacity?.quota && capacity.quota - capacity.usage < file.size * 1.2 + 8_000_000) throw new Error('浏览器可用存储空间不足，请先移除不需要的本地文档。');
    const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
    importController.signal.throwIfAborted();
    const duplicate = documents.find(d => d.checksum === checksum);
    if (duplicate) { closeDialog($('#import-dialog')); await openDocument(duplicate.id); toast('这份文档已在文档库中。'); return; }
    let generateOutline = false;
    if (extension === 'pdf') {
      const choice = await choosePdfOutline(file);
      if (!['yes', 'no'].includes(choice)) throw new DOMException('已取消', 'AbortError');
      generateOutline = choice === 'yes';
    }
    importController.signal.throwIfAborted();
    importProgress('正在读取文件…');
    let parsed;
    if (extension === 'pdf') parsed = await importPdf(file, importProgress, { signal: importController.signal });
    else if (extension === 'docx') parsed = await importDocx(file, importProgress);
    else if (['ppt', 'pptx'].includes(extension)) {
      $('#cancel-import').classList.remove('hidden'); $('#cancel-import').disabled = false;
      importProgress('正在打开演示文件…');
      const response = await fetch('/api/presentations/import?extension=' + extension + '&progress=1', { method: 'POST', signal: importController.signal, headers: { ...apiHeaders(), 'Content-Type': 'application/octet-stream' }, body: file });
      const value = await readPresentationStream(response, ({ page, total, renderer }) => importProgress(!total ? `${renderer} · 正在转换幻灯片…` : page === total ? `${total} 张已读取，正在整理文档…` : `${renderer} · 已读取 ${page} / ${total} 张幻灯片`, page, total));
      importController.signal.throwIfAborted();
      parsed = { ...(value.format === 'pdf' ? await importPresentationPdf(value, importProgress, { signal: importController.signal }) : value), blob: file };
      importController.signal.throwIfAborted();
      $('#cancel-import').classList.add('hidden');
      importProgress('正在保存文档…', parsed.pages, parsed.pages);
    }
    else {
      const text = await file.text();
      if (text.includes('\u0000')) throw new Error('文本文件的编码不支持，请另存为 UTF-8。');
      if (text.length > 300000) throw new Error('初版文本上限为 30 万字符，请拆分后导入。');
      parsed = { blocks: splitParagraphs(text), pages: null };
      if (!parsed.blocks.length) throw new Error('文件没有可阅读的内容。');
    }
    importController.signal.throwIfAborted();
    importProgress('正在保存文档…');
    const doc = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), type: extension, author: extension === 'docx' ? 'Word 正文 · 本地解析' : ['ppt', 'pptx'].includes(extension) ? `${parsed.renderer || '演示软件'} · 本机读取` : '本地文档', createdAt: Date.now(), checksum, outlineRequested: generateOutline, ...parsed };
    await saveDocument(doc);
    if (generateOutline) { if (!outlineSidebar.open) outlineSidebar.setOpen(true); void outlineSidebar.generate(doc).catch(error => toast(error.message)); }
  } catch (error) { importProgress(error.name === 'AbortError' ? '已取消导入，可以重新选择文件。' : error.name === 'QuotaExceededError' ? '本机文档存储空间不足，请清理后重新导入。' : error.message.includes('Invalid') ? '文档损坏或格式不支持，请检查文件。' : error.message); }
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

$('#question-form').addEventListener('submit', event => { event.preventDefault(); if (requestPending) { closeTermPeek(); stopRequest(); renderAssistant(); $('#question-status').textContent = '已停止生成，问题仍保留。'; rememberReader(); return; } if ($('#question-form button').disabled) return; const q = $('#question').value.trim(); if (q) ask('ask', q); else toast('请输入想问的问题。'); });
$('#depth').addEventListener('change', () => { settings.depth = $('#depth').value; persistPreferences(); });
$('#question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#question-form').requestSubmit(); } });
$('#question').addEventListener('input', updateComposer);
$('#assistant-body').addEventListener('scroll', () => { const el = $('#assistant-body'); followAnswer = el.scrollHeight - el.scrollTop - el.clientHeight < 70; }, { passive: true });
$('#question').addEventListener('focus', sizeQuestion);
$('#question-form').addEventListener('focusout', () => {
  if (document.body.dataset.input === 'pointer') composerBlurPending = true;
  else queueMicrotask(() => { if (!$('#question-form').contains(document.activeElement)) sizeQuestion(); });
});
// A pointer click must finish before collapsing a surface can move its target.
document.addEventListener('click', () => {
  if (!composerBlurPending) return;
  composerBlurPending = false;
  if (!$('#question-form').contains(document.activeElement)) sizeQuestion();
});
$('#question').addEventListener('input', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => rememberReader(), 500); });
$('#library-search').addEventListener('input', event => { libraryState.query = event.target.value; libraryState.scrollTop = 0; renderLibrary(); persistLibrary(); });
$('#library-view').addEventListener('scroll', () => { if (view === 'library') { libraryState.scrollTop = $('#library-view').scrollTop; persistLibrary(); } }, { passive: true });
$('#document-list').addEventListener('change', async event => {
  const id = event.target.dataset.categoryDocument, doc = documents.find(doc => doc.id === id);
  if (!doc) return;
  const previous = doc.category; doc.category = categoryName(event.target.value);
  try { const stored = { ...doc }; delete stored.readingState; delete stored.lastOpenedAt; await storage('documents', 'put', stored); renderLibrary(); $$('[popovertarget]').find(el => el.getAttribute('popovertarget') === 'doc-menu-' + id)?.focus({ preventScroll: true }); }
  catch { doc.category = previous; event.target.value = previous || ''; toast('分类未能保存，请检查浏览器存储空间。'); }
});
$('#category-form').addEventListener('submit', event => {
  event.preventDefault(); const name = categoryName($('#category-name').value), names = categoryNames(documents, libraryState.categories);
  if (!name || name === '未分类' || names.includes(name)) { $('#category-error').textContent = !name ? '请输入分类名称。' : '这个分类已经存在。'; $('#category-error').classList.remove('hidden'); return; }
  libraryState.categories.push(name); persistLibrary(); renderLibrary(); closeDialog($('#category-dialog')); toast('分类已创建，可在文档列表中选择。');
});
$('#record-search').addEventListener('input', renderCollection);
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
  if (active?.type === 'pdf') {
    const pages = $$('#document-content ' + (pdfMode === 'original' ? '.pdf-page' : '[data-page]'));
    const top = el.getBoundingClientRect().top + 48;
    let lo = 0, hi = pages.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (pages[mid].getBoundingClientRect().top <= top) lo = mid; else hi = mid - 1; }
    visiblePdfPage = Number(pages[lo]?.dataset.page) || 1;
    if (pdfMode === 'original' && currentPdfLayout().mode === 'double') {
      const rowPage = visiblePdfPage, bounds = el.getBoundingClientRect();
      const visible = spreadPages(rowPage, active.pages).filter(page => {
        const rect = pages[page - 1]?.getBoundingClientRect();
        return rect && rect.right > bounds.left + 40 && rect.left < bounds.right - 40;
      });
      const previous = Number($('#pdf-page-number').value) || rowPage;
      visiblePdfPage = spreadReadingPage(rowPage, previous, active.pages, visible);
    }
    if (document.activeElement !== $('#pdf-page-number')) $('#pdf-page-number').value = visiblePdfPage;
    const double = currentPdfLayout().mode === 'double';
    $('#pdf-previous').disabled = double ? spreadStart(visiblePdfPage) === 1 : visiblePdfPage <= 1;
    $('#pdf-next').disabled = double ? spreadStart(visiblePdfPage) + 2 > active.pages : visiblePdfPage >= active.pages;
    outlineSidebar?.updatePage(visiblePdfPage);
  }
}

async function jumpToPdfPage(page) {
  if (active?.type !== 'pdf' || !Number.isInteger(page) || page < 1 || page > active.pages) return;
  readingTools?.restoreFocus(); closeTermPeek();
  const target = $(`#document-content ${pdfMode === 'original' ? '.pdf-page' : '[data-page]'}[data-page="${page}"]`);
  if (!target) return;
  const scroll = $('#reading-scroll');
  scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12, behavior: 'auto' });
  visiblePdfPage = page; $('#pdf-page-number').value = page;
  if (pdfMode === 'original') revealPdfPageHorizontally(target);
  updateProgress();
  if (pdfMode === 'original') await renderPdfPage(target);
  updateProgress(); rememberReader();
}
$('#pdf-navigation').addEventListener('submit', event => { event.preventDefault(); void jumpToPdfPage(Number($('#pdf-page-number').value)).catch(error => toast(error.message)); });
$('#pdf-previous').addEventListener('click', () => void jumpToPdfPage(adjacentPdfPage(visiblePdfPage, active.pages, -1, currentPdfLayout().mode)).catch(error => toast(error.message)));
$('#pdf-next').addEventListener('click', () => void jumpToPdfPage(adjacentPdfPage(visiblePdfPage, active.pages, 1, currentPdfLayout().mode)).catch(error => toast(error.message)));
let scrollTimer;
$('#reading-scroll').addEventListener('scroll', () => {
  closeTermPeek();
  if (view !== 'reader' || restoringPosition || pdfPaneMotion) return;
  updateProgress(); $('#selection-tools').classList.add('hidden'); clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => rememberReader(), 350);
}, { passive: true });

async function confirmRemoval(title, message) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal confirm-content';
  dialog.innerHTML = `<h2>${escape(title)}</h2><p>${escape(message)}</p><div class="modal-actions"><button class="button secondary" value="cancel">取消</button><button class="button primary" value="remove">移除</button></div>`;
  document.body.append(dialog); openDialog(dialog);
  return new Promise(resolve => {
    dialog.addEventListener('click', e => { const button = e.target.closest('button'); if (button) closeDialog(dialog, button.value); });
    dialog.addEventListener('close', () => { const ok = dialog.returnValue === 'remove'; dialog.remove(); resolve(ok); }, { once: true });
  });
}

async function changePdfMode(mode) {
  readingTools?.restoreFocus();
  if (active.type !== 'pdf' || mode === pdfMode) return;
  const page = visiblePdfPage;
  stopRequest(); clearSelection(); currentRecord = null;
  await teardownPdf(); pdfMode = mode;
  syncPdfPageLayout();
  setPressed('[data-pdf-mode]', b => b.dataset.pdfMode === mode);
  $('#font-value').textContent = mode === 'original' ? Math.round(pdfZoom * 100) + '%' : fontSize + ' px';
  renderAssistant();
  if (mode === 'original') await renderOriginalPdf(); else renderText();
  await jumpToPdfPage(page); updateProgress();
  revealSurface($('#document-content'));
}

document.addEventListener('pointerdown', event => {
  if (termPeekRange && !event.target.closest('#term-peek, #document-content')) closeTermPeek();
}, { passive: true });
document.addEventListener('toggle', event => {
  if (!event.target.matches('.document-menu') || event.newState !== 'open') return;
  const menu = event.target, trigger = $$('[popovertarget]').find(button => button.getAttribute('popovertarget') === menu.id);
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, rect.right - menu.offsetWidth)) + 'px';
  menu.style.top = (rect.bottom + menu.offsetHeight + 8 > innerHeight ? rect.top - menu.offsetHeight - 6 : rect.bottom + 6) + 'px';
  revealSurface(menu, 4, 180);
}, true);
document.addEventListener('beforetoggle', event => {
  if (event.target.matches('.document-menu') && event.oldState === 'open' && event.newState === 'closed') leaveSurface(event.target, { axis: 'y', distance: 4 });
}, true);
document.addEventListener('cancel', event => {
  if (event.target.tagName !== 'DIALOG' || event.defaultPrevented) return;
  event.preventDefault();
  if (event.target.id === 'import-dialog' && importing) { toast('正在解析文档，请稍候。'); return; }
  closeDialog(event.target);
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.closest('.document-menu')) button.closest('.document-menu').hidePopover();
  try {
    if (button.dataset.close) { if (importing && button.dataset.close === 'import-dialog') return toast('正在解析文档，请稍候。'); await closeDialog($('#' + button.dataset.close)); return; }
    if (button.dataset.libraryFilter) { navigateView('library'); libraryState.filter = button.dataset.libraryFilter; libraryState.scrollTop = 0; $('#library-view').scrollTop = 0; renderLibrary(); persistLibrary(); return; }
    if (button.dataset.view) { navigateView(button.dataset.view); return; }
    if (button.dataset.document) { await openDocument(button.dataset.document, true, button.querySelector('.document-cover') || $('#resume-thumbnail .document-cover')); return; }
    if (button.dataset.panel) { const changed = panel !== button.dataset.panel; panel = button.dataset.panel; renderAssistant(); if (changed) revealSurface($('#assistant-body'), 3); return; }
    if (button.dataset.selectMode) { selectMode = button.dataset.selectMode; setPressed('[data-select-mode]', b => b === button); return; }
    if (button.dataset.pdfMode) { await changePdfMode(button.dataset.pdfMode); return; }
    if (button.dataset.pageLayout) { changePdfPageLayout(button.dataset.pageLayout); return; }
    if (button.dataset.slideMode) { slideMode = button.dataset.slideMode; slideReader.setMode(slideMode); setPressed('[data-slide-mode]', b => b === button); $('#slide-hint').textContent = slideMode === 'region' ? '拖动框选图片或文字，再向右侧提问' : '点击幻灯片上的文字区域，再向右侧提问'; return; }
    if (button.dataset.settingsPane) { setSettingsPane(button.dataset.settingsPane); return; }
    if (button.dataset.editProfile) { fillModelDraft(profiles.find(profile => profile.id === button.dataset.editProfile)); return; }
    if (button.dataset.removeProfile) {
      const profile = profiles.find(profile => profile.id === button.dataset.removeProfile);
      if (await confirmRemoval('移除这个模型配置？', `“${profile.name}”及其 API Key 将从本机模型库移除。`)) {
        await vaultRequest('/api/vault', { method: 'DELETE', body: JSON.stringify({ id: profile.id }) });
        if (settings.profileId === profile.id) { stopRequest(); apiKey = ''; settings = { ...settings, profileId: '', enabled: false, endpoint: '', model: '', vision: false }; persistPreferences(); answerCache.clear(); updateModelStatus(); renderAssistant(); }
        renderProfiles();
      } return;
    }
    if (button.dataset.importTab) {
      if (importing) return toast('正在解析文档，请稍候。');
      const file = button.dataset.importTab === 'file';
      $('#file-import').classList.toggle('hidden', !file); $('#text-import').classList.toggle('hidden', file);
      setPressed('[data-import-tab]', b => b === button); return;
    }
    if (button.dataset.record) { await showRecord(button.dataset.record); return; }
    if (button.dataset.source) { await jumpToSource(button.dataset.source, records.find(r => r.id === button.dataset.sourceRecord) || currentRecord); return; }
    if (button.dataset.followup) { await ask('ask', button.dataset.followup); return; }
    if (button.dataset.deleteDocument) {
      const doc = documents.find(d => d.id === button.dataset.deleteDocument);
      if (await confirmRemoval('移除这份文档？', `“${doc.title}”将从此浏览器移除。阅读记录会保留，但无法再跳转原文。`)) {
        outlineSidebar?.remove(doc);
        await storage('documents', 'delete', doc.id); documents = documents.filter(d => d.id !== doc.id);
        await storage('outlines', 'delete', doc.id);
        await storage('readingStates', 'delete', doc.id); readerSessions.delete(doc.id);
        if (active?.id === doc.id) { stopRequest(); clearSelection(); await teardownPdf(); slideReader.destroy(); readerDocumentId = null; currentRecord = null; active = documents[0]; navigateView('library'); }
        renderLibrary();
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
    if (action === 'feature-previous' || action === 'feature-next') {
      const filtered = filterDocuments(documents, libraryState.filter, libraryState.query);
      if (!filtered.length) return;
      const direction = action === 'feature-next' ? 1 : -1;
      const index = Math.max(0, filtered.findIndex(doc => doc.id === featuredDocumentId));
      featuredDocumentId = filtered[(index + direction + filtered.length) % filtered.length].id;
      renderFeatured(filtered, direction);
    }
    else if (action === 'import') { $('#import-progress').classList.add('hidden'); openDialog($('#import-dialog')); }
    else if (action === 'settings') showSettings(button.closest('.assistant-panel') ? 'models' : 'reading');
    else if (action === 'models') showSettings('models');
    else if (action === 'locate-selection') await locateSelection();
    else if (action === 'widen-assistant') workspaceLayout?.widen();
    else if (action === 'retry-answer' && failedRequest?.docId === active?.id) { const failed = failedRequest; await ask(failed.action, failed.question, failed.surface); }
    else if (action === 'new-category') { $('#category-form').reset(); $('#category-error').classList.add('hidden'); openDialog($('#category-dialog')); }
    else if (action === 'new-profile') fillModelDraft();
    else if (action === 'profile-back') { $('#api-key').value = ''; setSettingsPane('models', true); }
    else if (action === 'close-peek') closeTermPeek(false, document.body.dataset.input === 'keyboard');
    else if (action === 'collapse-assistant') workspaceLayout?.hideAssistant();
    else if (action === 'finish-assistant-transition') workspaceLayout?.finishPromotion();
    else if (action === 'focus-assistant-question') workspaceLayout?.finishPromotion(true);
    else if (action === 'peek-detail') await promoteTermPeek();
    else if (action === 'retry-peek') await askTermPeek(true);
    else if (action === 'regenerate-answer' && currentRecord) await ask(currentRecord.action, currentRecord.question, 'panel', true);
    else if (action === 'text-only' && selection?.hasText) { setSelection({ ...selection, includeImage: false }); renderAssistant(); toast('接下来的提问只发送选区文字。'); }
    else if (action === 'slide-previous' || action === 'slide-next') slideReader.jump(slideReader.current + (action === 'slide-next' ? 1 : -1), scrollBehavior());
    else if (action === 'explain' || action === 'logic') await ask(action);
    else if (action === 'ask-focus') { if (termPeek) await promoteTermPeek(true); else { workspaceLayout?.revealAssistant(); $('#question').focus({ preventScroll: true }); } $('#selection-tools').classList.add('hidden'); }
    else if (action === 'dismiss-selection') { stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); rememberReader(); }
    else if (action === 'clear-answer') { stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); rememberReader(); }
    else if (action === 'cancel-request') { closeTermPeek(); stopRequest(); renderAssistant(); $('#question-status').textContent = '已停止生成，问题仍保留。'; rememberReader(); }
    else if (action === 'star-current' && currentRecord) {
      currentRecord.starred = !currentRecord.starred; await storage('records', 'put', currentRecord);
      updateCounts(); updateComposer(); toast(currentRecord.starred ? '已加入术语本。' : '已从术语本移除。');
    }
    else if (action === 'copy-answer' && currentRecord) { await navigator.clipboard.writeText(exportMarkdown([currentRecord], documents)); toast('解读与原文依据已复制。'); }
    else if (action === 'export') {
      const subset = view === 'terms' ? records.filter(r => r.starred) : records;
      if (!subset.length) return toast('还没有可导出的记录。');
      const url = URL.createObjectURL(new Blob([exportMarkdown(subset, documents)], { type: 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = view === 'terms' ? 'CleverRead-术语本.md' : 'CleverRead-阅读记录.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    else if (action === 'font-up' || action === 'font-down') {
      readingTools?.restoreFocus();
      const direction = action === 'font-up' ? 1 : -1;
      if (isPresentation()) {
        const page = slideReader.current; slideZoom = Math.max(.6, Math.min(1.6, slideZoom + direction * .1));
        $('#font-value').textContent = Math.round(slideZoom * 100) + '%'; slideReader.render(active, slideMode, slideZoom); slideReader.jump(page); if (selection?.region) slideReader.showSelection(selection);
      } else if (pdfMode === 'original') {
        await teardownPdf(); pdfZoom = Math.max(.6, Math.min(1.6, pdfZoom + direction * .1));
        $('#font-value').textContent = Math.round(pdfZoom * 100) + '%'; await renderOriginalPdf();
      } else {
        fontSize = Math.max(15, Math.min(26, fontSize + direction)); settings.fontSize = fontSize; persistPreferences();
        document.documentElement.style.setProperty('--body-size', fontSize + 'px'); $('#font-value').textContent = fontSize + ' px';
      }
    }
  } catch (error) { toast(error.message || '操作失败，请重试。'); }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (view !== 'reader' || document.querySelector('.document-menu:popover-open')) return;
  if (termPeekRange) { event.preventDefault(); closeTermPeek(false, true); return; }
  if (!workspaceLayout?.getState().focused) { event.preventDefault(); workspaceLayout.hideAssistant(); return; }
  if (slideReader.cancelInteraction()) { event.preventDefault(); return; }
  if (selection) { event.preventDefault(); stopRequest(); clearSelection(); currentRecord = null; window.getSelection()?.removeAllRanges(); renderAssistant(); }
});
$('#assistant-body').addEventListener('toggle', event => { if (event.target.matches('.selection-preview')) previewExpanded = event.target.open; }, true);
window.addEventListener('scroll', closeTermPeek, { passive: true });
let resizeTimer;
window.addEventListener('resize', () => {
  readingTools?.restoreFocus();
  closeTermPeek(); syncSegments(); updateLibraryNavigation(); $('#selection-tools').classList.add('hidden'); clearTimeout(resizeTimer);
  if (view !== 'reader') return;
  const documentId = active?.id, position = readingPositionSnapshot();
  resizeTimer = setTimeout(async () => {
    if (view !== 'reader' || active?.id !== documentId) return;
    try {
      if (isPresentation()) { slideReader.render(active, slideMode, slideZoom); if (selection?.region) slideReader.showSelection(selection); }
      else if (pdfMode === 'original') { if (view !== 'reader' || active?.id !== documentId) return; await refreshPdfSurface(position); }
      else return;
      if (view === 'reader' && active?.id === documentId) requestAnimationFrame(() => { restoreReadingPosition(position); requestAnimationFrame(() => rememberReader()); });
    } catch { toast('页面重绘失败，请切换阅读模式重试。'); }
  }, isPresentation() ? 200 : 300);
});

async function init() {
  fetch('/api/capabilities').then(response => response.json()).then(({ platform, presentations }) => {
    const support = $('#presentation-support');
    if (platform === 'darwin') support.textContent = presentations.available ? 'PDF 最大 200 MB、2000 页，PPT 最多 300 张。支持在 Mac 上直接导入 PPT / PPTX；旧版 Word .doc 请先另存为 .docx。' : 'PDF 最大 200 MB、2000 页。PPT 导入需要本机安装 Chrome、Chromium 或 Edge；也可先将课件导出为 PDF。';
  }).catch(() => {});
  applyTheme();
  hydrateIcons();
  workspaceLayout = initWorkspaceLayout(storagePrefix, { beforeChange: () => { if (view !== 'reader') return null; readingTools?.restoreFocus(); if (readingTools?.comparing) readingTools.closeComparison(); closeTermPeek(); $('#selection-tools').classList.add('hidden'); pendingReadingMovement = captureReadingMotion($$('.pdf-page[data-rendered]')); rememberReader(); return readingPositionSnapshot(); }, duringChange: resizePdfDuringPane, afterChange: async (position, { live = false } = {}) => {
    if (active?.readingState) { active.readingState.focused = workspaceLayout.getState().focused; storage('readingStates', 'put', active.readingState).catch(() => {}); }
    const documentId = active?.id;
    try {
      if (isPresentation() && view === 'reader') slideReader.resize();
      else if (pdfMode === 'original' && view === 'reader') { if (live) await settlePdfPane(position); else await refreshPdfSurface(position); }
      if (position && view === 'reader' && active?.id === documentId) requestAnimationFrame(() => { restoreReadingPosition(position); requestAnimationFrame(() => rememberReader()); });
    } catch { toast('页面重绘失败，请切换阅读模式重试。'); }
  } });
  readingTools = new ReadingTools({ getDoc: () => active, getSelection: () => selection, getRange: () => selectionRange, layout: () => workspaceLayout,
    readPosition: readingPositionSnapshot, restorePosition: restoreReadingPosition, rangeOffsets: rangeForOffsets, renderPage: renderPdfPage,
    remember: rememberReader, onQuotes: updateComposer, onError: toast,
    modelIdentity: () => JSON.stringify([settings.endpoint, settings.model, settings.profileId]),
    loadTranslation: key => new Promise((resolve, reject) => { const request = db.transaction('translations').objectStore('translations').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }),
    saveTranslation: value => storage('translations', 'put', value),
    locate: block => jumpToSource(block.id, { docId: active.id, selected: selection || {}, contexts: [block] }, false),
    requestTranslation: async (segments, target, signal) => {
      if (!modelReady()) throw new Error('请先在设置中连接模型，再翻译原文。');
      const response = await fetch('/api/translate', { method: 'POST', signal, headers: apiHeaders(), body: JSON.stringify({ profileId: settings.profileId || undefined, endpoint: settings.endpoint, model: settings.model, apiKey, segments, target, documentTitle: active.title }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '翻译失败。'); return data.result;
    }
  });
  outlineSidebar = new OutlineSidebar({
    getDocument: () => active,
    getConnection: () => modelReady() ? { profileId: settings.profileId || undefined, endpoint: settings.endpoint, model: settings.model, apiKey } : null,
    save: state => storage('outlines', 'put', state),
    request: async (input, signal) => {
      const response = await fetch('/api/outline', { method: 'POST', signal, headers: apiHeaders(), body: JSON.stringify(input) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '目录生成失败。'); return data;
    },
    onNavigate: page => void jumpToPdfPage(page).catch(error => toast(error.message)),
    readPosition: readingPositionSnapshot,
    onModels: () => showSettings('models'), onError: message => toast(String(message)),
    onLayout: (position, { outlineOpen }) => {
      if (workspaceLayout?.setOutlineOpen(outlineOpen, position)) return;
      $('#reader-workspace').dataset.outlineOpen = String(outlineOpen);
      workspaceLayout?.refresh();
      if (view === 'reader' && active?.type === 'pdf' && pdfMode === 'original' && livePdf) void refreshPdfSurface(position).catch(error => toast(error.message));
      else { window.dispatchEvent(new Event('resize')); requestAnimationFrame(() => restoreReadingPosition(position)); }
    }
  });
  const pdfLayoutObserver = new MutationObserver(() => syncPdfPageLayout());
  for (const element of [$('.app-shell'), $('#reader-workspace'), $('#reader-view')]) {
    pdfLayoutObserver.observe(element, { attributes: true, attributeFilter: ['data-focus', 'data-outline-open', 'data-compare'] });
  }
  new ResizeObserver(() => { if (isPresentation() && view === 'reader') slideReader.resize(); }).observe($('#reading-scroll'));
  const segmentObserver = new ResizeObserver(entries => entries.forEach(entry => syncSegment(entry.target)));
  $$('[data-segmented]').forEach(group => segmentObserver.observe(group));
  syncSegments();
  fontSize = Math.max(15, Math.min(26, settings.fontSize || 18));
  settings.lineHeight = [1.6, 1.85, 2].includes(Number(settings.lineHeight)) ? Number(settings.lineHeight) : 1.85;
  $('#reading-font').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 15}">${i + 15} px</option>`).join('');
  document.documentElement.style.setProperty('--body-size', fontSize + 'px');
  document.documentElement.style.setProperty('--body-leading', String(settings.lineHeight));
  $('#depth').value = ['入门', '专业', '深入'].includes(settings.depth) ? settings.depth : '入门';
  $('#click-assist').checked = settings.clickAssist;
  await loadVault();
  updateModelStatus();
  try {
    await openStorage();
    let id;
    try { id = localStorage.getItem(storagePrefix + '-active'); } catch { /* Nonessential preference. */ }
    active = documents.find(doc => doc.id === id) || documents[0];
    // Bring the last document from the previous reader into the new library.
    if (active?.id === id && !active.readingState) {
      active.lastOpenedAt = active.createdAt || Date.now();
      active.readingState = { id, lastOpenedAt: active.lastOpenedAt, scrollTop: active.scrollTop || 0, scrollLeft: 0 };
      await storage('readingStates', 'put', active.readingState);
    }
    $('#library-search').value = libraryState.query;
    if (settings.resumeOnLaunch && id && documents.some(doc => doc.id === id)) await openDocument(id);
    else { updateView(); renderLibrary(); $('#library-view').scrollTop = libraryState.scrollTop; }
  } catch (error) {
    $('#library-empty').classList.add('hidden');
    $('#library-count').textContent = '本机文档库暂不可用';
    $('#document-list').innerHTML = `<div class="error-state">无法打开本地存储。${escape(error.message)}</div>`;
  }
}

init();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rememberReader(); });
window.addEventListener('pagehide', () => rememberReader());
