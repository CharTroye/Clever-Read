import { sentences, normalizeText, retrieveContext } from './core.mjs';

export function quoteKey(value) {
  return JSON.stringify([value.blockId, value.endBlockId, value.page, value.text, value.sourceType, value.region]);
}

export function addQuote(quotes, selected) {
  if (!selected?.text) throw new Error('请先选择原文。');
  if (quotes.some(q => quoteKey(q) === quoteKey(selected))) return quotes;
  if (quotes.length >= 4) throw new Error('一次最多引用 4 段内容。');
  if (quotes.reduce((n, q) => n + q.text.length, 0) + selected.text.length > 7600) throw new Error('引用总长度不能超过 7600 字。');
  if (selected.includeImage && quotes.some(q => q.includeImage)) throw new Error('一次提问可附 1 张区域截图，其余引用可使用文字。');
  return [...quotes, structuredClone(selected)];
}

export function combinedSelection(quotes, fallback) {
  if (!quotes.length) return fallback;
  const image = quotes.find(q => q.includeImage);
  return { ...quotes[0], text: quotes.map((q, i) => `[引用 ${i + 1}${q.page ? ' · 第 ' + q.page + ' 页' : ''}]\n${q.text}`).join('\n\n'), quotes: quotes.map(q => { const item = { ...q }; delete item.image; return item; }), includeImage: !!image, image: image?.image, imagePage: image?.page };
}

export function quotedContexts(doc, selected, question = '') {
  const targets = selected.quotes?.length ? selected.quotes : [selected];
  const all = new Map();
  // Selected blocks precede neighbors so multiple quotes cannot crowd each other out.
  for (const target of targets) {
    const start = doc.blocks.findIndex(b => b.id === target.blockId);
    const end = Math.max(start, doc.blocks.findIndex(b => b.id === target.endBlockId));
    for (let i = start; i >= 0 && i <= end; i++) if (!doc.blocks[i].unreadable) all.set(doc.blocks[i].id, doc.blocks[i]);
  }
  for (const target of targets) for (const context of retrieveContext(doc, target, question)) if (!all.has(context.id)) all.set(context.id, context);
  return [...all.values()].slice(0, 12).map(c => ({ ...c, text: c.text.slice(0, 2400) }));
}

export function sentenceSegments(block) {
  return sentences(block.text).map((text, index) => ({ id: `${block.id}:s${index + 1}`, blockId: block.id, text }));
}

export function validateTranslation(raw, segments) {
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('译文格式不正确，请重试。'); }
  if (!Array.isArray(parsed.segments)) throw new Error('模型没有返回逐句译文。');
  const byId = new Map();
  for (const part of parsed.segments) {
    if (!part || typeof part.id !== 'string' || byId.has(part.id) || typeof part.text !== 'string' || !part.text.trim() || part.text.length > 8000) throw new Error('译文对应关系不完整，请重试。');
    byId.set(part.id, part.text.trim());
  }
  if (byId.size !== segments.length || segments.some(s => !byId.has(s.id))) throw new Error('译文缺少对应句子，请重试。');
  return segments.map(s => ({ id: s.id, blockId: s.blockId, text: byId.get(s.id) }));
}

export const translationKey = (docId, block, target, model) => JSON.stringify([docId, block.id, normalizeText(block.text), target, model]);
