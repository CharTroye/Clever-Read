// Conversation lineage is explicit. The same word on another page is a new target.
export function sameTarget(a, b) {
  if (!a || !b) return false;
  const key = s => JSON.stringify([s.text, s.blockId ?? null, s.endBlockId ?? s.blockId ?? null, s.page ?? null, s.sourceType ?? null, !!s.includeImage, s.region ? [s.region.x, s.region.y, s.region.w, s.region.h] : null, s.quotes?.map(q => [q.blockId, q.page, q.text, q.region]) || null]);
  return key(a) === key(b);
}

export function conversationTurns(record, records) {
  if (!record) return [];
  const byId = new Map(records.map(r => [r.id, r]));
  const seen = new Set(), turns = [];
  let next = record;
  while (next && !seen.has(next.id) && turns.length < 100) {
    if (next.docId !== record.docId || !sameTarget(next.selected, record.selected)) break;
    seen.add(next.id); turns.unshift(next);
    next = next.parentId ? byId.get(next.parentId) : null;
  }
  return turns;
}

export const turnQuestion = record => record.question || (record.action === 'logic' ? '拆解这段内容的逻辑' : '解释当前选区');

export function conversationHistory(record, records) {
  // Only model answers belong in model history; dictionary entries are not prior reasoning.
  return conversationTurns(record, records).filter(r => r.result.mode === 'model' && !r.status && !r.result.briefOnly).slice(-3).flatMap(r => [
    { role: 'user', content: turnQuestion(r) },
    { role: 'assistant', content: JSON.stringify({ ...r.result, cached: undefined }) }
  ]);
}
