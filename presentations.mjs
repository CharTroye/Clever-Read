import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPowerShell } from './vault.mjs';
import { checkPresentationInput } from './presentation-input.mjs';

const project = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(project, 'scripts', 'render-presentation.ps1');
let busy = false;

export async function presentationCapabilities() {
  if (process.platform !== 'win32') return { available: false, preferred: null, renderers: [] };
  return JSON.parse(await runPowerShell(script, ['-ProbeOnly']));
}
export async function presentationCapability() { return (await presentationCapabilities()).available; }

export async function importPresentation(bytes, extension, directory = path.join(project, '.runtime', 'presentation-imports'), { renderer = 'auto' } = {}) {
  if (!['ppt', 'pptx'].includes(extension)) throw new Error('请导入 .ppt 或 .pptx 文件。');
  if (process.platform !== 'win32') throw new Error('保留 PPT 排版需要 Windows 桌面版 WPS 演示或 Microsoft PowerPoint。');
  if (!['auto', 'wps', 'powerpoint'].includes(renderer)) throw new Error('不支持的幻灯片读取方式。');
  if (busy) throw new Error('另一份 PPT 正在解析，请稍候再试。');
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('PPT 文件须小于 30 MB。');
  const pptx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const legacy = bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  if (extension === 'pptx' ? !pptx : !legacy) throw new Error('文件内容与 PPT 格式不符，或文件已加密。');
  checkPresentationInput(bytes, extension);
  busy = true;
  let temporary;
  let input;
  try {
    await mkdir(directory, { recursive: true });
    temporary = await mkdtemp(path.join(path.resolve(directory), 'deck-'));
    input = path.join(temporary, 'source.' + extension);
    await writeFile(input, bytes);
    await runPowerShell(script, ['-InputFile', input, '-OutputDirectory', temporary, '-Renderer', renderer], '', 180000);
    const manifest = JSON.parse(await readFile(path.join(temporary, 'manifest.json'), 'utf8'));
    if (!Array.isArray(manifest.slides) || !manifest.slides.length || manifest.slides.length > 150) throw new Error('没有可阅读的幻灯片。');
    const slides = [];
    const blocks = [];
    let imageBytes = 0;
    for (const slide of manifest.slides) {
      if (slide.image !== `slide-${slide.page}.png`) throw new Error('幻灯片导出结果不正确。');
      const image = await readFile(path.join(temporary, slide.image));
      imageBytes += image.length;
      if (imageBytes > 80 * 1024 * 1024) throw new Error('幻灯片图片过多，请拆分 PPT 后导入。');
      const texts = slide.texts.map((text, index) => ({ ...text, id: `ppt-${slide.page}-${index + 1}` }));
      for (const text of texts) blocks.push({ id: text.id, text: text.text, section: `第 ${slide.page} 张幻灯片`, page: slide.page });
      if (!texts.length) blocks.push({ id: `ppt-${slide.page}-visual`, text: `第 ${slide.page} 张幻灯片只有视觉内容，请依据框选截图解读。`, section: `第 ${slide.page} 张幻灯片`, page: slide.page });
      slides.push({ ...slide, texts, image: 'data:image/png;base64,' + image.toString('base64') });
    }
    return { slides, blocks, pages: slides.length, slideWidth: manifest.width, slideHeight: manifest.height, renderer: manifest.renderer, rendererId: manifest.rendererId };
  } catch (error) {
    if (input) await runPowerShell(script, ['-InputFile', input, '-CleanupOnly'], '', 10000).catch(() => {});
    if (/NO_PRESENTATION_ENGINE/.test(error.message)) throw new Error('未能启动 WPS 演示或 PowerPoint。请确认已安装 Windows 桌面版 WPS（含演示组件）；可先手动打开 WPS 演示后重试，仍失败时修复 WPS 安装。');
    if (/PRESENTATION_RENDER_FAILED|spawn|ENOENT/.test(error.message)) throw new Error('本机 WPS / PowerPoint 无法读取此文件。请先在 WPS 中确认文件可打开、没有密码且未损坏，再另存为 .pptx 后重试。');
    throw error;
  } finally {
    if (temporary) {
      const base = path.resolve(directory) + path.sep;
      if (path.resolve(temporary).startsWith(base)) await rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
    busy = false;
  }
}
