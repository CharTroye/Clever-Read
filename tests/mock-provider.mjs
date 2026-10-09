// Disposable localhost integration endpoint. It is not a language model.
import http from 'node:http';
http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.model === 'test-invalid-model') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Model Not Exist: test-invalid-model', code: 'invalid_request_error' } }));
      return;
    }
    const input = JSON.parse(body.messages.at(-1).content);
    const result = { title: '本地接口联调回执', summary: `测试收到问题：${input.question || input.task}。\n选区：${input.selection}。`, context: `收到 ${input.sourceFragments.length} 个原文片段及 ${body.messages.length - 2} 条对话历史。`, logic: [], limitations: '这是本机模拟接口，仅验证数据传递，不是实际模型推理。', sources: [input.sourceFragments.find(p => p.text.includes(input.selection))?.id || input.sourceFragments[0]?.id, 'invented-source'].filter(Boolean) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  } catch { res.writeHead(400); res.end('{}'); }
}).listen(4174, '127.0.0.1', () => console.log('Test-only model interface: http://127.0.0.1:4174/v1/chat/completions'));
