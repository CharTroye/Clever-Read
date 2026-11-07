import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const browsers = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];

export async function findPrintBrowser() {
  for (const directory of ['/Applications', path.join(homedir(), 'Applications')]) {
    for (const relative of browsers) {
      const executable = path.join(directory, relative);
      try { await access(executable, constants.X_OK); return executable; } catch {}
    }
  }
  return null;
}

export async function macPresentationCapabilities() {
  const available = !!await findPrintBrowser();
  return { available, preferred: available ? 'macos' : null, renderers: available ? [{ id: 'macos', label: 'macOS 本机预览' }] : [] };
}

export function runMacCommand(executable, args, { signal, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('已取消导入。'), { name: 'AbortError' }));
    const child = spawn(executable, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '', timedOut = false, aborted = false;
    const terminate = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} } };
    const cancel = () => { aborted = true; terminate(); };
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    child.stdout.on('data', chunk => { output = (output + chunk.toString('utf8')).slice(-16384); });
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString('utf8')).slice(-16384); });
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup(); terminate();
      if (aborted) return reject(Object.assign(new Error('已取消导入。'), { name: 'AbortError' }));
      if (timedOut) return reject(new Error('本机转换超时，请拆分 PPT 或先导出为 PDF 后导入。'));
      code === 0 ? resolve(output) : reject(new Error(errors.trim() || '本机演示文稿转换失败。'));
    });
  });
}

// Quick Look creates the HTML locally. Restrict resources before printing it.
export function preparePreviewHtml(html, assetNames) {
  const safeAsset = value => assetNames.includes(value) && /^[\w.-]+\.(?:png|jpe?g|gif|webp)$/i.test(value);
  if (/<(?:script|iframe|frame|object|embed|base|link)\b|<[^>]*\son[a-z]+\s*=|<meta[^>]*http-equiv\s*=|@import|javascript:/i.test(html)) throw new Error('此演示文稿的预览包含不支持的外部内容，请先导出为 PDF。');
  for (const match of html.matchAll(/<[^>]*?\s(?:src|poster|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    if (!safeAsset(match[1] ?? match[2] ?? match[3])) throw new Error('幻灯片引用了不支持的外部资源，请先导出为 PDF。');
  }
  for (const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
    if (!safeAsset(match[1])) throw new Error('幻灯片引用了不支持的外部资源，请先导出为 PDF。');
  }
  const dimensions = html.match(/div\.slide\s*,\s*div\.loading-slide\s*\{\s*width:\s*([\d.]+)(?:px)?;\s*height:\s*([\d.]+)(?:px)?;\s*\}/i);
  const width = Number(dimensions?.[1]), height = Number(dimensions?.[2]);
  if (!(width > 0 && height > 0 && width <= 20000 && height <= 20000)) throw new Error('无法识别幻灯片尺寸，请先导出为 PDF。');
  const pages = [...html.matchAll(/<div\b[^>]*\bclass\s*=\s*["']([^"']*)["']/gi)].filter(match => match[1].split(/\s+/).includes('slide')).length;
  if (!pages) throw new Error('没有可阅读的幻灯片。');
  if (pages > 300) throw new Error(`PRESENTATION_SLIDE_LIMIT:300:${pages}`);
  html = html.replace(/<[^>]+>/g, tag => tag.replace(/\s+(?:href|xlink:href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''));
  const print = `<style>@page{size:${width}px ${height}px;margin:0}@media print{html,body{margin:0!important;padding:0!important;background:white!important}div.slide{margin:0!important;box-shadow:none!important;break-after:page;page-break-after:always}div.slide:last-of-type{break-after:auto;page-break-after:auto}}</style>`;
  if (!/<\/head>/i.test(html)) throw new Error('幻灯片预览结构不正确。');
  return { html: html.replace(/<\/head>/i, print + '</head>'), pages };
}

export async function renderMacPresentation(input, directory, { renderer, signal, onProgress } = {}) {
  if (!['auto', 'macos'].includes(renderer)) throw new Error('Mac 版请使用本机预览读取幻灯片。');
  const browser = await findPrintBrowser();
  if (!browser) throw new Error('Mac 的 PPT 导入需要安装 Chrome、Chromium 或 Edge；也可先将演示文稿导出为 PDF 后导入。');
  onProgress?.({ page: 0, total: 0, renderer: 'macOS 本机预览' });
  await runMacCommand('/usr/bin/qlmanage', ['-p', '-o', directory, input], { signal });
  signal?.throwIfAborted();
  const preview = path.join(directory, path.basename(input) + '.qlpreview');
  const entries = await readdir(preview, { withFileTypes: true });
  if (entries.some(entry => entry.isSymbolicLink())) throw new Error('幻灯片预览包含不支持的资源。');
  const assets = entries.filter(entry => entry.isFile()).map(entry => entry.name);
  const filename = path.join(preview, 'Preview.html');
  const { html, pages } = preparePreviewHtml(await readFile(filename, 'utf8'), assets);
  await writeFile(filename, html);
  onProgress?.({ page: 0, total: pages, renderer: 'macOS 本机预览' });
  const output = path.join(directory, 'slides.pdf');
  await runMacCommand(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND', '--no-proxy-server', '--user-data-dir=' + path.join(directory, 'print-profile'), '--no-pdf-header-footer', '--print-to-pdf=' + output, pathToFileURL(filename).href], { signal });
  signal?.throwIfAborted();
  if ((await stat(output)).size > 80 * 1024 * 1024) throw new Error('幻灯片导出内容过大，请拆分 PPT 后导入。');
  const pdf = await readFile(output);
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('本机没有导出有效的幻灯片。');
  return { format: 'pdf', pdf: pdf.toString('base64'), pages, renderer: 'macOS 本机预览', rendererId: 'macos' };
}
