// Library metadata is independent of document parsing and model credentials.
export function categoryName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '';
}
export function categoryNames(documents, saved = []) {
  return [...new Set([...saved, ...documents.map(doc => doc.category)].map(categoryName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
export function filterDocuments(documents, filter = 'all', query = '') {
  const needle = query.trim().normalize('NFKC').toLocaleLowerCase();
  return documents.filter(doc => {
    const category = categoryName(doc.category);
    const included = filter === 'all' || (filter === 'recent' && !!doc.lastOpenedAt) || (filter === 'uncategorized' && !category) || (filter.startsWith('category:') && category === filter.slice(9));
    return included && `${doc.title} ${category}`.normalize('NFKC').toLocaleLowerCase().includes(needle);
  }).sort((a, b) => filter === 'recent' ? (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) : (b.createdAt || 0) - (a.createdAt || 0));
}
export function documentMeta(doc) {
  const type = doc.type === 'sample' ? '教学示例' : String(doc.type || '文本').toUpperCase();
  return type + ' · ' + (doc.pages ? `${doc.pages} ${['ppt', 'pptx'].includes(doc.type) ? '张' : '页'}` : `${doc.blocks?.length || 0} 段`);
}
export function readingPosition(doc) {
  if (!doc.lastOpenedAt) return '未阅读';
  const state = doc.readingState || {};
  if (state.position?.page) return `第 ${state.position.page} ${['ppt', 'pptx'].includes(doc.type) ? '张' : '页'}`;
  if (state.position?.blockId) {
    const index = doc.blocks?.findIndex(block => block.id === state.position.blockId);
    if (index >= 0) return `第 ${index + 1} 段`;
  }
  return state.progress > 0 ? `已读 ${Math.round(Math.min(1, state.progress) * 100)}%` : '开头';
}
