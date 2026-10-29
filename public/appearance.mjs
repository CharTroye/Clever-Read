// Appearance preferences stay separate from model connections and document data.
export const styleThemes = { swiss: 'gray', editorial: 'gray', classic: 'graphite', paper: 'gray' };

export function appearancePreferences(saved = {}, { existing = false, systemTheme = 'gray' } = {}) {
  const style = Object.hasOwn(styleThemes, saved.style) ? saved.style : existing ? 'classic' : 'swiss';
  const theme = ['gray', 'graphite'].includes(saved.theme) ? saved.theme : existing ? systemTheme : styleThemes[style];
  return { style, theme, motion: saved.motion !== false };
}

// Stable, local cover art; never uploads documents or replaces their real pages.
export function documentCover(doc) {
  const title = String(doc.title || '未命名文档');
  let hash = 0;
  for (const char of String(doc.id || title)) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
  return { variant: hash % 3, title, format: doc.type === 'sample' ? 'READING SAMPLE' : String(doc.type || 'TEXT').toUpperCase() };
}
