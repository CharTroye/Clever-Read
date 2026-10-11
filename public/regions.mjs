export function clampRegion(start, end) {
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const x = Math.min(clamp(start.x), clamp(end.x));
  const y = Math.min(clamp(start.y), clamp(end.y));
  return { x, y, w: Math.abs(clamp(end.x) - clamp(start.x)), h: Math.abs(clamp(end.y) - clamp(start.y)) };
}

export function textInRegion(slide, region, width, height) {
  const selected = (slide.words || []).filter(word => {
    const x = (word.x + word.w / 2) / width;
    const y = (word.y + word.h / 2) / height;
    return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
  });
  const groups = new Map();
  for (const word of selected) {
    if (!groups.has(word.block)) groups.set(word.block, []);
    groups.get(word.block).push(word.text);
  }
  return [...groups.values()].map(words => words.join('').trim()).filter(Boolean).join('\n');
}

export async function cropRegion(image, region) {
  await image.decode();
  const sx = Math.floor(region.x * image.naturalWidth), sy = Math.floor(region.y * image.naturalHeight);
  const sw = Math.max(1, Math.ceil(region.w * image.naturalWidth)), sh = Math.max(1, Math.ceil(region.h * image.naturalHeight));
  const scale = Math.min(1, 1400 / sw, 1400 / sh);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  let data;
  for (const quality of [.9, .75, .55]) { data = canvas.toDataURL('image/jpeg', quality); if (data.length < 2500000) return data; }
  throw new Error('框选图片过大，请缩小选区。');
}
