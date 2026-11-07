import { mkdir, readFile, writeFile, open, rename, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectId = directory => createHash('sha256').update(directory).digest('hex').slice(0, 24);

async function health(url) {
  try {
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1000) });
    try { return await response.json(); } catch { return { occupied: true }; }
  } catch { return null; }
}

// The health route can work even when macOS denies this process access to Documents.
// Reuse a server only if it can also read and serve the actual application.
async function homePage(url) {
  try {
    const response = await fetch(url + '/', { signal: AbortSignal.timeout(1000) });
    const content = await response.text();
    if (response.ok && response.headers.get('content-type')?.includes('text/html') && /<html\b/i.test(content)) return { ready: true };
    try { return { ready: false, error: JSON.parse(content).error }; } catch { return { ready: false }; }
  } catch { return { ready: false }; }
}

async function savedState(filename) {
  try { return JSON.parse(await readFile(filename, 'utf8')); } catch { return null; }
}

async function lock(filename) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const file = await open(filename, 'wx', 0o600);
      await file.writeFile(JSON.stringify({ pid: process.pid })); await file.close();
      return async () => { await rm(filename, { force: true }); };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = await savedState(filename);
      if (Number.isInteger(owner?.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') { await rm(filename, { force: true }); continue; } }
      }
      await delay(100);
    }
  }
  throw new Error('另一个启动操作仍在进行，请稍后重试。');
}

export async function launch({ directory = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), port = Number(process.env.PORT || 4173), stop = false, openBrowser = true } = {}) {
  directory = await realpath(directory);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1 到 65535 的整数。');
  const version = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).version;
  const runtime = path.join(directory, '.runtime'), url = `http://127.0.0.1:${port}`, identity = projectId(directory);
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const stateFile = path.join(runtime, `mac-server-${port}.json`);
  const release = await lock(path.join(runtime, `mac-launch-${port}.lock`));
  try {
    const current = await health(url), state = await savedState(stateFile);
    const ours = current?.app === 'clever-read' && current.projectId === identity;
    if (current && !ours) throw new Error(`端口 ${port} 已由其他服务或旧版本占用，请先关闭该服务再启动。`);
    const page = ours && !stop && current.version === version ? await homePage(url) : null;
    if (ours && (stop || current.version !== version || !page?.ready)) {
      if (!Number.isInteger(state?.pid) || state.pid !== current.pid || state.projectId !== identity) throw new Error('该服务不是由此启动器启动的，请关闭它原来的终端后重试。');
      process.kill(state.pid, 'SIGTERM');
      let stopped = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        if (!await health(url)) { stopped = true; break; }
        await delay(100);
      }
      if (!stopped) throw new Error('旧服务尚未停止，请稍后重试。');
      await rm(stateFile, { force: true });
    }
    if (stop) return { url, stopped: ours, reused: false };
    let reused = ours && current.version === version && page?.ready === true;
    if (!reused) {
      const output = await open(path.join(runtime, 'server-output.log'), 'a', 0o600);
      const errors = await open(path.join(runtime, 'server-error.log'), 'a', 0o600);
      let child;
      try { child = spawn(process.execPath, [path.join(directory, 'server.mjs')], { cwd: directory, detached: true, stdio: ['ignore', output.fd, errors.fd], env: { ...process.env, PORT: String(port) } }); }
      finally { await output.close(); await errors.close(); }
      let failure;
      child.once('error', error => { failure = error; });
      child.unref();
      let ready;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (failure || child.exitCode !== null) break;
        const result = await health(url);
        if (result?.app === 'clever-read' && result.projectId === identity && result.pid === child.pid && result.version === version) {
          const page = await homePage(url);
          if (page.ready) ready = result;
          else if (/EPERM|EACCES/.test(page.error || '')) failure = new Error('macOS 拒绝读取项目文件。请在“系统设置 → 隐私与安全性 → 文件与文件夹”中允许用于启动的终端访问“文稿”文件夹，再重新启动。');
          break;
        }
        await delay(100);
      }
      if (!ready) { if (child.pid && child.exitCode === null) child.kill(); throw failure || new Error('Clever Read 启动失败，请查看 .runtime/server-error.log。'); }
      const temporary = stateFile + `.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ pid: child.pid, projectId: identity, version, port }), { mode: 0o600 });
      await rename(temporary, stateFile);
    }
    if (openBrowser) await new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`请在浏览器中打开 ${url}`)));
    });
    return { url, reused };
  } finally { await release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await launch({ stop: process.argv.includes('--stop'), openBrowser: !process.argv.includes('--no-open') });
    console.log(process.argv.includes('--stop') ? result.stopped ? 'Clever Read 已停止。' : 'Clever Read 当前没有运行。' : `Clever Read 已就绪：${result.url}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
