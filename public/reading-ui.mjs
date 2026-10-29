import katex from './vendor/katex/katex.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function math(text, displayMode = false) {
  if (text.length > 4000) return '<code>' + escapeHtml(text) + '</code>';
  try {
    return katex.renderToString(text, { displayMode, throwOnError: true, trust: false, strict: 'error', maxExpand: 200, maxSize: 10, output: 'htmlAndMathml' });
  } catch { return '<code class="math-fallback">' + escapeHtml(text) + '</code>'; }
}

// Model output remains text: only these small, explicit formatting rules create markup.
function inline(text) {
  const pattern = /`([^`\n]+)`|\\\((.+?)\\\)|\$([^$\n]+)\$|\*\*([^*\n]+)\*\*/g;
  let html = '', cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    html += escapeHtml(text.slice(cursor, match.index));
    if (match[1] !== undefined) html += '<code>' + escapeHtml(match[1]) + '</code>';
    else if (match[2] !== undefined || match[3] !== undefined) html += math(match[2] ?? match[3]);
    else html += '<strong>' + inline(match[4]) + '</strong>';
    cursor = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}

function tableCells(line) {
  // Pipes inside inline code and escaped pipes are cell content.
  const cells = []; let cell = '', code = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { cell += '|'; i++; }
    else if (line[i] === '`') { code = !code; cell += line[i]; }
    else if (line[i] === '|' && !code) { cells.push(cell.trim()); cell = ''; }
    else cell += line[i];
  }
  cells.push(cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells;
}

export function renderExplanation(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let paragraph = [], items = [], listType = '', code = null;
  const flushParagraph = () => { if (paragraph.length) output.push('<p>' + paragraph.map(inline).join('<br>') + '</p>'); paragraph = []; };
  const flushList = () => { if (items.length) output.push(`<${listType}>${items.map(item => '<li>' + inline(item) + '</li>').join('')}</${listType}>`); items = []; listType = ''; };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList();
      if (code) { output.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const display = line.trim().match(/^(\$\$|\\\[)(.*)$/);
    if (display) {
      const end = display[1] === '$$' ? '$$' : '\\]';
      let formula = display[2], closed = formula.endsWith(end);
      if (closed) formula = formula.slice(0, -end.length);
      let next = index;
      while (!closed && next + 1 < lines.length) {
        const part = lines[++next];
        closed = part.trimEnd().endsWith(end);
        formula += '\n' + (closed ? part.trimEnd().slice(0, -end.length) : part);
      }
      if (closed) { flushParagraph(); flushList(); output.push('<div class="math-block">' + math(formula.trim(), true) + '</div>'); index = next; continue; }
    }
    const head = line.includes('|') ? tableCells(line) : [];
    const divider = lines[index + 1] ? tableCells(lines[index + 1]) : [];
    if (head.length > 1 && head.length <= 12 && divider.length === head.length && divider.every(cell => /^:?-{3,}:?$/.test(cell))) {
      flushParagraph(); flushList();
      const rows = []; index++;
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim() && rows.length < 100) rows.push(tableCells(lines[++index]));
      output.push('<div class="explanation-table" role="region" aria-label="解读表格" tabindex="0"><table><thead><tr>' + head.map(cell => '<th scope="col">' + inline(cell) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + head.map((_, i) => '<td>' + inline(row[i] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) { flushParagraph(); flushList(); output.push('<h3>' + inline(heading[1]) + '</h3>'); continue; }
    const item = line.match(/^\s*(?:([-*+])|\d+[.)、])\s+(.+)$/);
    if (item) {
      flushParagraph(); const type = item[1] ? 'ul' : 'ol';
      if (listType && listType !== type) flushList();
      listType = type; items.push(item[2]); continue;
    }
    flushList(); paragraph.push(line);
  }
  if (code) output.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
  flushParagraph(); flushList();
  return output.join('');
}

export function briefExplanation(text, limit = 180) {
  const plain = String(text ?? '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= limit) return plain;
  const prefix = plain.slice(0, limit);
  const end = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'), prefix.lastIndexOf('. '));
  return (end + 1 >= limit / 2 ? prefix.slice(0, end + 1) : prefix.trimEnd() + '…');
}
