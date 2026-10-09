import { normalizeText, splitParagraphs } from './core.mjs';

let pdfModule;
export async function pdfLibrary() {
  if (!pdfModule) {
    pdfModule = await import('/vendor/pdfjs/build/pdf.mjs');
    pdfModule.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.mjs';
  }
  return pdfModule;
}

export async function loadPdf(blob) {
  const pdf = await pdfLibrary();
  return pdf.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', isEvalSupported: false }).promise;
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

export async function importPdf(file, progress) {
  let pdf;
  try {
    pdf = await loadPdf(file);
    if (pdf.numPages > 150) throw new Error('初版最多支持 150 页 PDF，请拆分文件后导入。');
    const blocks = [];
    let unreadablePages = 0;
    let characters = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      progress(`正在解析 PDF · ${page} / ${pdf.numPages} 页`);
      const pdfPage = await pdf.getPage(page);
      const content = await pdfPage.getTextContent();
      const text = pdfPageText(content.items);
      characters += text.length;
      if (!text) {
        unreadablePages++;
        blocks.push({ id: `pdf-${page}-empty`, text: '此页没有可提取的文字，可能是扫描图像。', section: `第 ${page} 页`, page, unreadable: true });
      } else {
        for (const block of splitParagraphs(text, `pdf-${page}`)) blocks.push({ ...block, section: `第 ${page} 页`, page });
      }
      pdfPage.cleanup();
    }
    if (characters < 10) throw new Error('没有提取到可阅读的文字。这可能是扫描件，初版暂不支持 OCR。');
    return { blocks, pages: pdf.numPages, unreadablePages, blob: file };
  } catch (error) {
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
