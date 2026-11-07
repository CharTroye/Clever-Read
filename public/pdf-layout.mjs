export function spreadStart(page) { return Math.max(1, Math.floor((Math.max(1, Number(page) || 1) - 1) / 2) * 2 + 1); }

export function spreadPages(page, total) {
  if (!Number.isInteger(total) || total < 1) return [];
  const first = spreadStart(Math.min(Math.max(1, page), total));
  return first < total ? [first, first + 1] : [first];
}

export function pageLayout({ requested, original, outlineOpen, assistantOpen, comparing = false }) {
  const available = !!original && !comparing;
  return { available, mode: available && requested === 'double' ? 'double' : 'single' };
}

export function adjacentPdfPage(page, total, direction, layout = 'single') {
  const next = layout === 'double' ? spreadStart(page) + direction * 2 : page + direction;
  return Math.max(1, Math.min(total, next));
}

export function spreadReadingPage(rowPage, previous, total, visible = []) {
  const pair = spreadPages(rowPage, total);
  // Keep the selected right-hand page current while both pages are visible.
  if (visible.length === 1 && pair.includes(visible[0])) return visible[0];
  return pair.includes(previous) ? previous : pair[0];
}

export function facingPageGeometry({ width, height, aspect = 990 / 700, fit = 'width', gap = 6 }) {
  const maximum = Math.max(1, (width - gap) / 2);
  const pageWidth = fit === 'page' ? Math.min(maximum, Math.max(1, height) / aspect) : maximum;
  return { width: pageWidth, height: pageWidth * aspect, gap };
}

export function fitPageInside(source, box) {
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  return { scale, width, height, left: (box.width - width) / 2, top: (box.height - height) / 2 };
}
