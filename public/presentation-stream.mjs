export async function readPresentationStream(response, onProgress) {
  if (!response.ok) {
    const value = await response.json(); throw new Error(value.error || '无法读取演示文件。');
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', document;
  function consume(line) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.error || '导入失败。');
    if (event.type === 'progress') onProgress(event);
    if (event.type === 'complete') document = event.document;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (done) { consume(buffer); break; }
    }
  } finally { reader.releaseLock(); }
  if (!document) throw new Error('导入连接中断，请重新选择文件。');
  return document;
}
