export function normalizeEndpoint(endpoint) {
  let url;
  try { url = new URL(String(endpoint).trim()); } catch { throw new Error('请输入完整的接口地址。'); }
  if (url.username || url.password || url.hash || url.search) throw new Error('接口地址不能包含账户信息、查询参数或片段。');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('云端接口须使用 HTTPS；本地模型可使用 localhost HTTP 地址。');
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname || /\/v\d+$/.test(pathname)) {
    if (!pathname && url.hostname === 'api.openai.com') pathname = '/v1';
    pathname += '/chat/completions';
  }
  if (!pathname.endsWith('/chat/completions')) throw new Error('请填写基础地址（例如 https://api.deepseek.com）或以 /chat/completions 结尾的完整接口地址。');
  url.pathname = pathname;
  return url.href;
}

export function normalizeModelName(model, endpoint) {
  const value = String(model ?? '').trim();
  let host;
  try { host = new URL(endpoint).hostname; } catch { return value; }
  if (host !== 'api.deepseek.com') return value;
  const id = value.toLowerCase();
  // DeepSeek-V4.1-Flash is the display name; the API ID is deepseek-flash.
  if (id === 'deepseek-v4.1-flash' || id === 'deepseek-flash') return 'deepseek-flash';
  if (id === 'deepseek-v4-pro') return 'deepseek-v4-pro';
  return value;
}

export function normalizeText(text) {
  return String(text ?? '').replace(/\u00ad/g, '').replace(/[\t\u00a0]/g, ' ').replace(/ +/g, ' ').trim();
}

export function splitParagraphs(text, prefix = 'p') {
  const cleaned = String(text).replace(/\r\n?/g, '\n').trim();
  const chunks = cleaned.split(/\n\s*\n+/).flatMap(p => {
    const value = normalizeText(p.replace(/\n/g, ' '));
    if (value.length <= 1400) return value ? [value] : [];
    const out = [];
    let part = '';
    for (const sentence of sentences(value)) {
      if (part.length + sentence.length > 1400 && part) { out.push(part.trim()); part = ''; }
      if (sentence.length > 1400) {
        if (part) { out.push(part.trim()); part = ''; }
        for (let i = 0; i < sentence.length; i += 1400) out.push(sentence.slice(i, i + 1400));
      } else part += sentence + ' ';
    }
    if (part.trim()) out.push(part.trim());
    return out;
  });
  return chunks.map((text, index) => ({ id: `${prefix}-${index + 1}`, text, section: '正文', page: null }));
}

export function sentences(text) {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter('zh', { granularity: 'sentence' }).segment(text), s => s.segment.trim()).filter(Boolean);
  }
  return text.match(/[^。！？.!?]+[。！？.!?]*\s*/g) ?? [text];
}

export function selectionAt(text, offset, kind = 'word') {
  const value = String(text);
  const point = Math.max(0, Math.min(offset, value.length - 1));
  if (typeof Intl.Segmenter === 'function') {
    const parts = new Intl.Segmenter('zh', { granularity: kind === 'sentence' ? 'sentence' : 'word' }).segment(value);
    const part = parts.containing(point);
    if (part && (kind === 'sentence' || part.isWordLike)) return { text: part.segment.trim(), start: part.index, end: part.index + part.segment.length };
    return null;
  }
  const before = value.slice(0, point + 1).match(/[\p{L}\p{N}-]+$/u)?.[0] ?? '';
  const after = value.slice(point + 1).match(/^[\p{L}\p{N}-]+/u)?.[0] ?? '';
  return before || after ? { text: before + after, start: point + 1 - before.length, end: point + 1 + after.length } : null;
}

function queryTokens(text) {
  const normalized = normalizeText(text).toLowerCase();
  const words = normalized.match(/[a-z][a-z0-9_-]{1,}/g) ?? [];
  const chinese = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  const stop = new Set(['the', 'and', 'this', 'that', 'what', 'does', 'with', 'from', 'are', 'for', 'how', 'why']);
  const pairs = chinese.flatMap(v => Array.from({ length: Math.max(0, v.length - 1) }, (_, i) => v.slice(i, i + 2)));
  return [...new Set([...words.filter(w => !stop.has(w)), ...pairs])];
}

// Neighboring blocks always survive retrieval. Exact terms complement the keyword ranking.
export function retrieveContext(doc, selected, question = '', limit = 7) {
  const blocks = (doc.blocks ?? []).filter(b => !b.unreadable);
  const index = blocks.findIndex(b => b.id === selected.blockId);
  const end = blocks.findIndex(b => b.id === selected.endBlockId);
  const rangeEnd = Math.max(index, end);
  const required = new Set();
  if (index >= 0) {
    for (let i = Math.max(0, index - 1); i <= Math.min(blocks.length - 1, rangeEnd + 1) && required.size < limit; i++) required.add(i);
  }
  const terms = queryTokens(`${selected.text} ${question}`);
  const exact = normalizeText(selected.text).toLowerCase();
  const ranked = blocks.map((b, i) => {
    const text = b.text.toLowerCase();
    let score = terms.reduce((n, term) => n + (text.includes(term) ? 1 : 0), 0);
    if (exact && text.includes(exact)) score += 10;
    if (/(defined|refers to|denotes|定义|称为|指的是)/i.test(text) && score) score += 3;
    return { i, score };
  }).filter(v => v.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const item of ranked) { if (required.size >= limit) break; required.add(item.i); }
  return [...required].sort((a, b) => a - b).map(i => ({ ...blocks[i], text: blocks[i].text.slice(0, 2400) }));
}

export function validateModelResult(raw, contexts) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('模型返回了空回答。');
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { return { title: '阅读解读', summary: raw.slice(0, 18000), context: '', logic: [], limitations: '模型未返回结构化引用，请自行核对原文。', sources: [], mode: 'model' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('模型回答格式不正确，请重试。');
  if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) throw new Error('模型没有返回有效的解读内容，请重试。');
  const allowed = new Set(contexts.map(c => c.id));
  return {
    title: String(parsed.title || '阅读解读').slice(0, 200),
    summary: String(parsed.summary || '').slice(0, 14000),
    context: String(parsed.context || '').slice(0, 6000),
    logic: Array.isArray(parsed.logic) ? parsed.logic.slice(0, 8).map(v => String(v).slice(0, 2000)) : [],
    limitations: String(parsed.limitations || '请结合引用原文核对。').slice(0, 2000),
    sources: [...new Set(Array.isArray(parsed.sources) ? parsed.sources.filter(id => typeof id === 'string' && allowed.has(id)) : [])],
    mode: 'model'
  };
}

export function exportMarkdown(records, documents) {
  const titles = new Map(documents.map(d => [d.id, d.title]));
  return '# Clever Read 阅读记录\n\n' + records.map(r => {
    const result = r.result;
    const sources = r.contexts.filter(c => result.sources.includes(c.id));
    return `## ${result.title}\n\n文档：${titles.get(r.docId) || r.docTitle || '已移除文档'}\n\n选区：\n> ${r.selected.text.replace(/\n/g, '\n> ')}\n\n问题：${r.question || '解释选区'}\n\n${result.summary}\n\n${result.context}\n\n${result.logic.map(v => '- ' + v).join('\n')}\n\n说明：${result.limitations}\n\n来源：${result.mode === 'model' ? '模型回答' : '本地辅助，未调用模型'}\n\n${sources.map(c => `> ${c.text}\n\n${c.page ? '第 ' + c.page + ' 页' : c.section} · ${c.id}`).join('\n\n')}\n\n---\n`;
  }).join('\n');
}
