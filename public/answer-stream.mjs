// Streaming boundaries are transport boundaries, never text or JSON boundaries.
export async function* readLines(body) {
  if (!body) throw new Error('服务没有返回响应内容。');
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 200_000) throw new Error('模型响应过长。');
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) { yield buffer.slice(0, index).replace(/\r$/, ''); buffer = buffer.slice(index + 1); }
      if (done) { if (buffer) yield buffer; break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* readSSE(body) {
  let data = [];
  for await (const line of readLines(body)) {
    if (!line) { if (data.length) { yield data.join('\n'); data = []; } }
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield data.join('\n');
}

export async function readAnswerStream(response, onDelta = () => {}) {
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || '模型请求失败。'); }
  let complete = false, result;
  for await (const line of readLines(response.body)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === 'delta') onDelta(String(event.text || ''));
    if (event.type === 'error') throw new Error(event.error || '生成失败，已收到的内容保留。');
    if (event.type === 'complete') { complete = true; result = event.result; }
  }
  if (!complete || !result) throw new Error('连接中断，已收到的内容保留。可以重新生成。');
  return result;
}

function partialString(raw, key) {
  const match = new RegExp('"' + key + '"\\s*:\\s*"').exec(raw);
  if (!match) return '';
  let value = '';
  for (let i = match.index + match[0].length; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') break;
    if (char !== '\\') { value += char; continue; }
    const next = raw[++i];
    if (!next) break;
    if (next === 'u') {
      const hex = raw.slice(i + 1, i + 5);
      if (!/^[a-f0-9]{4}$/i.test(hex)) break;
      value += String.fromCharCode(parseInt(hex, 16)); i += 4;
    } else value += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' })[next] ?? next;
  }
  return value;
}

export function partialAnswer(raw) {
  const fields = Object.fromEntries(['title', 'brief', 'summary', 'context', 'background'].map(key => [key, partialString(raw, key)]));
  if (!fields.summary && raw.trim() && !/^[{`]/.test(raw.trim())) fields.summary = raw;
  return { ...fields, title: fields.title || '阅读解读', logic: [], sources: [], limitations: '', mode: 'model' };
}
