import { loadPdf, pdfLibrary } from './documents.mjs';

export function slideTextGeometry(layer, page, width, height, scale = 1, wordBudget = 40000) {
  const origin = layer.getBoundingClientRect(), texts = [], words = [];
  const bounds = rect => {
    const x = Math.max(0, (rect.left - origin.left) / scale), y = Math.max(0, (rect.top - origin.top) / scale);
    return { x, y, w: Math.max(0, Math.min(width - x, rect.width / scale)), h: Math.max(0, Math.min(height - y, rect.height / scale)) };
  };
  for (const span of layer.querySelectorAll('span')) {
    const node = span.firstChild;
    if (node?.nodeType !== 3 || !node.textContent.trim()) continue;
    const text = node.textContent, rect = bounds(span.getBoundingClientRect());
    if (rect.w <= 0 || rect.h <= 0) continue;
    const block = texts.length;
    texts.push({ id: `ppt-${page}-${block + 1}`, text: text.trim(), ...rect });
    if (words.length >= wordBudget) continue;
    for (const match of text.matchAll(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+[ \t]*/gu)) {
      const range = layer.ownerDocument.createRange();
      range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
      const word = bounds(range.getBoundingClientRect());
      if (word.w > 0 && word.h > 0) words.push({ text: match[0], block, ...word });
      if (words.length >= wordBudget) break;
    }
  }
  return { texts, words };
}

export async function importPresentationPdf(value, progress, { signal } = {}) {
  let pdf;
  try {
    signal?.throwIfAborted();
    const bytes = Uint8Array.from(atob(value.pdf), char => char.charCodeAt(0));
    pdf = await loadPdf(new Blob([bytes], { type: 'application/pdf' }));
    if (pdf.numPages > 300) throw new Error(`这份 PPT 有 ${pdf.numPages} 张幻灯片，超过 300 张上限，请拆分后导入。`);
    if (!pdf.numPages || (Number.isInteger(value.pages) && pdf.numPages !== value.pages)) throw new Error('导出的页数与幻灯片数量不一致，请导出为 PDF 后核对。');
    const library = await pdfLibrary(), slides = [], blocks = [];
    let slideWidth, slideHeight, characters = 0, imageBytes = 0, wordCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      progress(`正在整理幻灯片 · ${pageNumber} / ${pdf.numPages}`, pageNumber - 1, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      if (!slideWidth) { slideWidth = natural.width; slideHeight = natural.height; }
      if (Math.abs(natural.width / natural.height - slideWidth / slideHeight) > .01) throw new Error('幻灯片尺寸不一致，请先在演示软件中统一页面尺寸。');
      const viewport = page.getViewport({ scale: Math.min(1600 / natural.width, 1600 / natural.height) });
      const canvas = document.createElement('canvas'), layer = document.createElement('div');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      layer.className = 'textLayer'; layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, { position: 'fixed', left: '0', top: '0', width: `${viewport.width}px`, height: `${viewport.height}px`, opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      layer.style.setProperty('--scale-factor', viewport.scale);
      layer.style.setProperty('--total-scale-factor', viewport.scale);
      let rendering, textLayer;
      const cancel = () => { rendering?.cancel(); textLayer?.cancel(); };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        rendering = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await rendering.promise;
        signal?.throwIfAborted();
        document.body.append(layer);
        textLayer = new library.TextLayer({ textContentSource: await page.getTextContent(), container: layer, viewport });
        await textLayer.render();
        signal?.throwIfAborted();
        const geometry = slideTextGeometry(layer, pageNumber, slideWidth, slideHeight, viewport.scale, 40000 - wordCount);
        wordCount += geometry.words.length;
        for (const text of geometry.texts) {
          characters += text.text.length;
          if (characters > 300000) throw new Error('PPT 文字超过 30 万字符，请拆分后导入。');
          blocks.push({ id: text.id, text: text.text, section: `第 ${pageNumber} 张幻灯片`, page: pageNumber });
        }
        if (!geometry.texts.length) blocks.push({ id: `ppt-${pageNumber}-visual`, text: `第 ${pageNumber} 张幻灯片只有视觉内容，请依据框选截图解读。`, section: `第 ${pageNumber} 张幻灯片`, page: pageNumber });
        const image = canvas.toDataURL('image/png');
        imageBytes += Math.ceil((image.length - image.indexOf(',') - 1) * 3 / 4);
        if (imageBytes > 80 * 1024 * 1024) throw new Error('幻灯片图片过多，请拆分 PPT 后导入。');
        slides.push({ page: pageNumber, image, ...geometry });
      } finally {
        signal?.removeEventListener('abort', cancel);
        layer.remove(); canvas.width = canvas.height = 0; page.cleanup();
      }
    }
    signal?.throwIfAborted();
    return { slides, blocks, pages: slides.length, slideWidth, slideHeight, renderer: value.renderer, rendererId: value.rendererId };
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted();
    throw error;
  } finally { await pdf?.destroy(); }
}
