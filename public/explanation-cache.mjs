import { validateModelResult } from './core.mjs';

// Context and model identity are part of the key: equal words need not have equal meanings.
export async function explanationKey({ kind, doc, selected, contexts, model, depth, history = [] }) {
  const target = { ...selected }; delete target.image;
  const value = JSON.stringify(['explanation-v1', kind, doc.id, doc.title, target, contexts, model, depth, history]);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function validateBriefResult(raw, contexts) {
  let parsed;
  try { parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('短释义格式不正确，请重试。'); }
  if (!parsed || typeof parsed.brief !== 'string' || !parsed.brief.trim()) throw new Error('模型没有返回有效的短释义。');
  const brief = parsed.brief.trim().slice(0, 360);
  return { ...validateModelResult(JSON.stringify({ title: parsed.title || '语境释义', brief, summary: brief, context: typeof parsed.context === 'string' ? parsed.context.slice(0, 500) : '', sources: parsed.sources, limitations: typeof parsed.limitations === 'string' ? parsed.limitations.slice(0, 300) : '', logic: [] }), contexts), briefOnly: true };
}
