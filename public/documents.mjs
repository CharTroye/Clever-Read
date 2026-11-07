import { normalizeText, splitParagraphs } from './core.mjs';
import { PDF_LIMITS, mergeOutline } from './outline.mjs';

let pdfModule;
export async function pdfLibrary() {
  if (!pdfModule) {
    pdfModule = await import('/vendor/pdfjs/build/pdf.mjs');
    pdfModule.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.mjs';
  }
  return pdfModule;
}

export async function loadPdf(blob, { signal } = {}) {
  signal?.throwIfAborted();
  const pdf = await pdfLibrary();
  const data = new Uint8Array(await blob.arrayBuffer());
  signal?.throwIfAborted();
  const task = pdf.getDocument({ data, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', isEvalSupported: false });
  const abort = () => { task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try { const loaded = await task.promise; signal?.throwIfAborted(); return loaded; }
  finally { signal?.removeEventListener('abort', abort); }
}

export async function pdfBookmarks(pdf) {
  const entries = [], destinations = new Map();
  async function visit(items, level = 1) {
    for (const item of items || []) {
      if (entries.length >= 800) return;
      try {
        const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        const ref = destination?.[0];
        if (ref !== undefined) {
          const key = typeof ref === 'object' ? `${ref.num}:${ref.gen}` : ref;
          if (!destinations.has(key)) destinations.set(key, Number.isInteger(ref) ? ref + 1 : await pdf.getPageIndex(ref) + 1);
          entries.push({ title: String(item.title || '').trim().slice(0, 160), page: destinations.get(key), level: Math.min(level, 3) });
        }
      } catch { /* An invalid bookmark must not prevent importing the book. */ }
      if (level < 12) await visit(item.items, level + 1);
    }
  }
  await visit(await pdf.getOutline());
  return mergeOutline(entries, pdf.numPages);
}

export function pdfOutlineText(items, page) {
  const lines = []; let line = '', lastY = null, height = 0;
  const finish = () => { if (line.trim()) lines.push({ text: line.trim(), height }); line = ''; height = 0; };
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (lastY !== null && Math.abs(y - lastY) > 3 && line.trim()) finish();
    line += (line ? ' ' : '') + item.str; lastY = y;
    height = Math.max(height, Math.abs(item.height || item.transform?.[3] || 0));
    if (item.hasEOL && line.trim()) finish();
  }
  finish();
  const text = lines.map(line => line.text).join('\n');
  if (page <= 24 && /目录|contents/i.test(lines.slice(0, 8).map(line => line.text).join(' '))) return text.slice(0, 2800);
  const sizes = lines.map(line => line.height).filter(Boolean).sort((a, b) => a - b);
  const bodyHeight = sizes[Math.floor(sizes.length / 2)] || Infinity;
  const headings = lines.filter(line => line.text.length <= 160 && (
    /^(?:第[\d一二三四五六七八九十百零〇]+[章篇部节]|(?:chapter|part|section|appendix|preface|introduction)\b|\d{1,2}(?:\.\d{1,2}){1,2}[.\s、])/i.test(line.text) || line.height >= bodyHeight * 1.2
  )).slice(0, 8).map(line => line.text);
  // Keep opening context plus title candidates from anywhere on this physical page.
  // This avoids sending almost a full page for every page of a long textbook.
  const opening = text.slice(0, 260);
  return [opening, ...headings.filter(heading => !opening.includes(heading))].join('\n').slice(0, 1600);
}

export function pdfPageText(items) {
  const lines = [];
  let line = '';
  let lastY = null;
  for (const item of items) {
    if (!('str' in item)) continue;
    const y = item.transform?.[5];
    if (lastY !== null && Number.isFinite(y) && Math.abs(y - lastY) > 3 && line.trim()) { lines.push(line.trim()); line = ''; }
    const str = item.str;
    const adjacentChinese = /[\u4e00-\u9fff]$/.test(line) && /^[\u4e00-\u9fff]/.test(str);
    line += (line && !adjacentChinese && !line.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str;
    lastY = y;
    if (item.hasEOL && line.trim()) { lines.push(line.trim()); line = ''; }
  }
  if (line.trim()) lines.push(line.trim());
  return normalizeText(lines.join(' ').replace(/([a-z])-\s+([a-z])/g, '$1$2'));
}

export async function importPdf(file, progress, { signal } = {}) {
  let pdf;
  try {
    pdf = await loadPdf(file, { signal });
    if (pdf.numPages > PDF_LIMITS.pages) throw new Error('PDF 最多支持 2000 页，请拆分后导入。');
    const blocks = [];
    const outlinePages = [], pageSizes = [];
    let unreadablePages = 0;
    let characters = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      signal?.throwIfAborted();
      progress(`正在解析 PDF · ${page} / ${pdf.numPages} 页`, page, pdf.numPages);
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1 });
      pageSizes.push({ width: viewport.width, height: viewport.height });
      const content = await pdfPage.getTextContent();
      signal?.throwIfAborted();
      const text = pdfPageText(content.items);
      characters += text.length;
      if (characters > PDF_LIMITS.characters) throw new Error('PDF 文字超过 800 万字符，请分卷导入。');
      if (text) outlinePages.push({ page, text: pdfOutlineText(content.items, page) });
      if (!text) {
        unreadablePages++;
        blocks.push({ id: `pdf-${page}-empty`, text: '此页没有可提取的文字，可能是扫描图像。', section: `第 ${page} 页`, page, unreadable: true });
      } else {
        for (const block of splitParagraphs(text, `pdf-${page}`)) blocks.push({ ...block, section: `第 ${page} 页`, page });
      }
      pdfPage.cleanup();
      if (page % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    progress('正在读取 PDF 原有目录…');
    const outline = await pdfBookmarks(pdf).catch(() => []);
    return { blocks, pages: pdf.numPages, unreadablePages, scanned: characters < 10, outline, outlinePages, pageSizes, blob: file };
  } catch (error) {
    signal?.throwIfAborted();
    if (error.name === 'PasswordException') throw new Error('该 PDF 已加密，请先在阅读器中解密后导入。');
    throw error;
  } finally { await pdf?.destroy(); }
}

export function parseDocxXml(xml, prefix = 'word') {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Word 文件包含不支持的 XML 声明。');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new Error('Word 正文格式损坏，无法读取。');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paragraphs = Array.from(document.getElementsByTagNameNS(namespace, 'p'));
  const blocks = [];
  let section = '正文';
  let ordinal = 0;
  for (const paragraph of paragraphs) {
    const content = Array.from(paragraph.getElementsByTagNameNS(namespace, '*')).filter(el => ['t', 'tab', 'br', 'cr'].includes(el.localName)).map(el => el.localName === 't' ? el.textContent : el.localName === 'tab' ? '\t' : '\n').join('');
    const text = normalizeText(content);
    if (!text) continue;
    const style = paragraph.getElementsByTagNameNS(namespace, 'pStyle')[0]?.getAttributeNS(namespace, 'val') || '';
    const heading = /^(heading[1-6]|标题[1-6]|title|subtitle)$/i.test(style);
    if (heading) section = text.slice(0, 160);
    for (const part of splitParagraphs(text, `${prefix}-${++ordinal}`)) blocks.push({ ...part, section, heading });
  }
  return blocks;
}

export async function importDocx(file, progress) {
  progress('正在读取 Word 正文…');
  const zip = await globalThis.JSZip.loadAsync(await file.arrayBuffer());
  const body = zip.file('word/document.xml');
  if (!body) throw new Error('这不是有效的 .docx 文档，缺少 Word 正文。');
  if ((body._data?.uncompressedSize || 0) > 12_000_000) throw new Error('Word 正文过大，请拆分后导入。');
  const xml = await body.async('string');
  if (xml.length > 12_000_000) throw new Error('Word 正文过大，请拆分后导入。');
  const blocks = parseDocxXml(xml);
  if (!blocks.length) throw new Error('没有找到 Word 正文。图片中的文字暂不支持识别。');
  return { blocks, pages: null, blob: file };
}
