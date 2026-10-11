import { inflateRawSync } from 'node:zlib';

const macroError = () => new Error('此演示文件包含宏或脚本。请在 WPS 中另存为不含宏的 .pptx 后导入。');
const invalidError = () => new Error('PPT 文件结构损坏或格式不支持，请在 WPS 中另存为 .pptx 后重试。');
const activeName = /(?:^|\/)(?:_?vba|_VBA_PROJECT_CUR|vbaProject(?:Signature)?(?:\..*)?|jsa(?:Project)?(?:\..*)?|javascriptProject(?:\..*)?|jsProject(?:\..*)?|scriptProject(?:\..*)?|Macros?)$/i;

// Inspect passive file metadata before handing a document to the installed renderer.
export function checkPresentationInput(bytes, extension) {
  if (extension === 'pptx') {
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
    }
    if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalidError();
    const count = bytes.readUInt16LE(end + 10);
    let cursor = bytes.readUInt32LE(end + 16), total = 0;
    if (!count || count > 8000 || cursor + bytes.readUInt32LE(end + 12) > end) throw invalidError();
    let hasPresentation = false;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalidError();
      const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
      const compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
      const nameSize = bytes.readUInt16LE(cursor + 28), extraSize = bytes.readUInt16LE(cursor + 30), commentSize = bytes.readUInt16LE(cursor + 32);
      const local = bytes.readUInt32LE(cursor + 42);
      const next = cursor + 46 + nameSize + extraSize + commentSize;
      if (next > end || flags & 1 || local + 30 > cursor || bytes.readUInt32LE(local) !== 0x04034b50) throw invalidError();
      const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
      if (activeName.test(name) || /\.(?:js|vbs|hta)$/i.test(name)) throw macroError();
      if (name === 'ppt/presentation.xml') hasPresentation = true;
      total += expanded;
      if (total > 200 * 1024 * 1024) throw new Error('PPT 解压内容过大，请拆分文件后导入。');
      if (name === '[Content_Types].xml' || name.endsWith('.rels')) {
        const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
        if (expanded > 2 * 1024 * 1024 || start + compressed > cursor) throw invalidError();
        const raw = bytes.subarray(start, start + compressed);
        let text;
        try { text = (method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: 2 * 1024 * 1024 }) : (() => { throw invalidError(); })()).toString('utf8'); }
        catch { throw invalidError(); }
        if (/macroenabled|vbaproject|jsaproject|javascriptproject/i.test(text)) throw macroError();
      }
      cursor = next;
    }
    if (!hasPresentation) throw invalidError();
  } else {
    if (bytes.length < 512 || !bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) throw invalidError();
    // CFB directory entries are 128-byte records. Both VBA and WPS JSA use named storages.
    for (let offset = 512; offset + 128 <= bytes.length; offset += 128) {
      const length = bytes.readUInt16LE(offset + 64), type = bytes[offset + 66];
      if (length < 2 || length > 64 || length % 2 || ![1, 2, 5].includes(type) || bytes.readUInt16LE(offset + length - 2) !== 0) continue;
      const name = bytes.subarray(offset, offset + length - 2).toString('utf16le');
      if (activeName.test(name) || /encryptedpackage/i.test(name)) throw macroError();
    }
    // MS-PPT VBAInfoAtom (0x0400) can reference a compressed VBA storage.
    const signature = Buffer.from([2, 0, 0, 4, 12, 0, 0, 0]);
    let offset = bytes.indexOf(signature, 512);
    while (offset >= 0) {
      if (offset + 20 <= bytes.length && bytes.readUInt32LE(offset + 12) === 1) throw macroError();
      offset = bytes.indexOf(signature, offset + 1);
    }
  }
}
