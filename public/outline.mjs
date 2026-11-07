// Shared limits and validation for textbook import and chapter navigation.
export const PDF_LIMITS = Object.freeze({ bytes: 200 * 1024 * 1024, pages: 2000, characters: 8_000_000 });
export const OUTLINE_BATCH_CHARACTERS = 32_000;
const comparable = value => String(value).normalize('NFKC').replace(/\s+/g, '').toLowerCase();

export function validateImportFile(file, extension) {
  const maximum = extension === 'pdf' ? PDF_LIMITS.bytes : 30 * 1024 * 1024;
  if (file.size > maximum) throw new Error(extension === 'pdf' ? 'PDF 超过 200 MB，请压缩后导入。' : '该格式的文件超过 30 MB，请拆分或压缩后导入。');
}

export function outlineBatches(pages) {
  const batches = []; let batch = [], size = 0;
  for (const item of pages) {
    const text = String(item.text || '').trim().slice(0, 2800);
    if (!text) continue;
    if (batch.length && (size + text.length > OUTLINE_BATCH_CHARACTERS || batch.length >= 160)) { batches.push(batch); batch = []; size = 0; }
    batch.push({ page: item.page, text }); size += text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function outlineSamplesFromBlocks(blocks) {
  const pages = new Map();
  for (const block of blocks) {
    if (!block.page || block.unreadable) continue;
    const text = pages.get(block.page) || '';
    if (text.length < 950) pages.set(block.page, (text + '\n' + block.text).trim().slice(0, 950));
  }
  return [...pages].map(([page, text]) => ({ page, text }));
}

export function outlineTextProblem(samples, pages, unreadablePages = 0) {
  const readable = new Set(samples.filter(item => String(item.text || '').trim()).map(item => item.page)).size;
  if (!readable) return '这份 PDF 没有可提取的文字。请先对扫描件做 OCR，再生成目录；本次未调用模型。';
  if (pages >= 20 && unreadablePages / pages >= 0.95 && readable / pages < 0.05) return `这份 PDF 主要是扫描图片（${pages} 页中仅 ${readable} 页有文字层）。请先做 OCR，再生成目录；本次未调用模型。`;
  return '';
}

export function validateOutlineInput(input) {
  if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > PDF_LIMITS.pages) throw new Error('PDF 页数不正确。');
  if (!Array.isArray(input.samples) || !input.samples.length || input.samples.length > 160) throw new Error('目录请求缺少有效的页面片段。');
  const seen = new Set(); let characters = 0;
  const samples = input.samples.map(item => {
    if (!Number.isInteger(item.page) || item.page < 1 || item.page > input.pages || seen.has(item.page) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 2800) throw new Error('目录页面片段不正确。');
    seen.add(item.page); characters += item.text.length;
    return { page: item.page, text: item.text };
  });
  if (characters > OUTLINE_BATCH_CHARACTERS) throw new Error('目录片段过长，请分批生成。');
  return { documentTitle: String(input.documentTitle || '').slice(0, 200), pages: input.pages, samples };
}

export function validateOutlineResult(content, samples, pages) {
  let data;
  try { data = typeof content === 'string' ? JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : content; }
  catch { throw new Error('模型返回的目录格式不完整，请重试。'); }
  if (!data || !Array.isArray(data.entries) || data.entries.length > 500) throw new Error('模型返回的目录格式不正确。');
  const byPage = new Map(samples.map(s => [s.page, comparable(s.text)]));
  const entries = data.entries.flatMap(item => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || !Number.isInteger(item.page) || !byPage.has(item.page)) return [];
    const quote = typeof item.quote === 'string' ? item.quote.trim().slice(0, 160) : '';
    // A model-proposed chapter must be anchored in the supplied physical page.
    if (comparable(quote).length < (/[\u3400-\u9fff]/.test(quote) ? 2 : 4) || !byPage.get(item.page).includes(comparable(quote))) return [];
    return [{ title: item.title.trim().slice(0, 160), page: item.page, level: Math.max(1, Math.min(3, Number(item.level) || 1)), quote }];
  });
  if (data.entries.length && !entries.length) throw new Error('模型目录未能对应到原文页面，请重试。');
  return mergeOutline(entries, pages);
}

export function mergeOutline(entries, pages) {
  const seen = new Set();
  return entries.filter(item => {
    if (!item?.title || !Number.isInteger(item.page) || item.page < 1 || item.page > pages) return false;
    const key = item.page + ':' + comparable(item.title);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.page - b.page || a.level - b.level).slice(0, 800).map((item, index) => ({ ...item, id: 'chapter-' + index, level: Math.max(1, Math.min(3, Math.round(Number(item.level) || 1))) }));
}

export function currentChapter(entries, page) {
  let found = null;
  for (const entry of entries) { if (entry.page > page) break; found = entry; }
  return found?.id || '';
}

export function outlineTree(entries) {
  const roots = [], stack = [];
  for (const entry of entries) {
    const level = Math.max(1, Math.min(3, Number(entry.level) || 1));
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    const node = { ...entry, children: [] };
    if (stack.length) stack.at(-1).children.push(node); else roots.push(node);
    stack.push(node);
  }
  return roots;
}

export function filterOutlineTree(nodes, query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return nodes;
  return nodes.flatMap(node => {
    if (node.title.toLowerCase().includes(term)) return [{ ...node, children: node.children }];
    const children = filterOutlineTree(node.children, term);
    return children.length ? [{ ...node, children }] : [];
  });
}
