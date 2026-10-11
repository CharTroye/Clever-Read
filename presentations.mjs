import { access, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPowerShell } from './vault.mjs';

const project = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(project, 'scripts', 'render-presentation.ps1');
let busy = false;

export async function presentationCapability() {
  if (process.platform !== 'win32') return false;
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
    for (const folder of ['Microsoft Office/root/Office16', 'Microsoft Office/Office16']) {
      try { await access(path.join(base, folder, 'POWERPNT.EXE')); return true; } catch {}
    }
  }
  return false;
}

export async function importPresentation(bytes, extension, directory = path.join(project, '.runtime', 'presentation-imports')) {
  if (!['ppt', 'pptx'].includes(extension)) throw new Error('请导入 .ppt 或 .pptx 文件。');
  if (process.platform !== 'win32') throw new Error('保留 PPT 排版需要 Windows 版 Microsoft PowerPoint。');
  if (busy) throw new Error('另一份 PPT 正在解析，请稍候再试。');
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('PPT 文件须小于 30 MB。');
  const pptx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const legacy = bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  if (extension === 'pptx' ? !pptx : !legacy) throw new Error('文件内容与 PPT 格式不符，或文件已加密。');
  busy = true;
  let temporary;
  let input;
  try {
    await mkdir(directory, { recursive: true });
    temporary = await mkdtemp(path.join(path.resolve(directory), 'deck-'));
    input = path.join(temporary, 'source.' + extension);
    await writeFile(input, bytes);
    await runPowerShell(script, ['-InputFile', input, '-OutputDirectory', temporary], '', 180000);
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
    return { slides, blocks, pages: slides.length, slideWidth: manifest.width, slideHeight: manifest.height, renderer: manifest.renderer };
  } catch (error) {
    if (input) await runPowerShell(script, ['-InputFile', input, '-CleanupOnly'], '', 10000).catch(() => {});
    if (/PowerPoint could not|spawn|ENOENT/.test(error.message)) throw new Error('PowerPoint 无法读取此文件。请确认已安装桌面版 PowerPoint，且文件没有密码、未损坏。');
    throw error;
  } finally {
    if (temporary) {
      const base = path.resolve(directory) + path.sep;
      if (path.resolve(temporary).startsWith(base)) await rm(temporary, { recursive: true, force: true }).catch(() => {});
    }
    busy = false;
  }
}
