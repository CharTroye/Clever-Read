import { spreadPages, adjacentPdfPage, facingPageGeometry } from '../pdf-layout.mjs';
import { captureReadingMotion, finishReadingMotion } from '../reading-motion.mjs';
const reader = document.querySelector('.reader');
const primaryPaper = document.querySelector('.paper');
const pair = document.querySelector('.paper-pair');
const otherPaper = document.createElement('article'); otherPaper.className = 'paper';
otherPaper.innerHTML = '<div class="running-head">第一章　统计学习基础<span></span></div><div class="chapter-number">1.2.1</div><h1>模型与假设空间</h1><p class="lead">从可能的关系中选择一个模型。</p><p>统计学习从有限的训练样本出发，尝试寻找能够解释数据、并对新数据作出预测的关系。我们需要先说明，允许模型采用哪些形式。</p><h2>假设空间</h2><p>所有允许使用的模型组成假设空间。选择不同的假设空间，意味着对输入和输出的关系作出不同的假设。</p><div class="equation">y = f(x),　f ∈ 𝓕</div><h2>模型复杂度</h2><p>更复杂的模型可以表达更多变化，也可能对训练样本中的偶然差异过度敏感。模型评估需要同时考虑拟合能力与对新数据的表现。</p><h2>从模型到学习</h2><p>明确候选模型以后，还需要定义比较这些模型的准则，并选择相应的求解方法。这就把模型、策略和算法联系起来。</p><div class="paper-note">相邻页布局示例。字号与单页模式一致。</div>';
const primarySheet = document.createElement('div'), otherSheet = document.createElement('div');
primarySheet.className = otherSheet.className = 'preview-sheet';
primarySheet.append(primaryPaper); otherSheet.append(otherPaper); otherSheet.hidden = true;
pair.replaceChildren(primarySheet, otherSheet);
const followingSheets = Array.from({ length: 2 }, () => {
  const sheet = document.createElement('div'); sheet.className = 'preview-sheet';
  const paper = otherPaper.cloneNode(true); paper.querySelector('.paper-note').textContent = '连续双页示例，向下滚动继续阅读。';
  sheet.append(paper); return sheet;
});
let currentPage = 8, requestedSpread = 'single', spreadFit = 'width';
function renderSpread() {
  const mode = requestedSpread;
  document.querySelector('#preview-page-layout').hidden = false;
  reader.dataset.immersive = String(requestedSpread === 'double' || (reader.dataset.toc === 'false' && reader.dataset.ai === 'false'));
  reader.dataset.spread = mode;
  document.querySelector('#preview-spread-fit').hidden = mode !== 'double';
  document.querySelectorAll('[data-page-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pageLayout === mode)));
  const pages = spreadPages(currentPage, 286);
  const otherPage = pages.find(page => page !== currentPage);
  otherSheet.hidden = mode !== 'double' || !otherPage;
  if (otherPage) {
    otherPaper.querySelector('.running-head span').textContent = otherPage;
    otherPaper.setAttribute('aria-label', `第 ${otherPage} 页`);
    otherPaper.querySelector('.chapter-number').textContent = otherPage < currentPage ? '1.1' : '1.2.1';
    otherPaper.querySelector('h1').textContent = otherPage < currentPage ? '学习问题与数据' : '模型与假设空间';
  }
  primaryPaper.setAttribute('aria-label', `第 ${currentPage} 页`);
  const ordered = mode === 'double' && currentPage % 2 === 0 ? [otherSheet, primarySheet] : [primarySheet, otherSheet];
  if (mode === 'double' && spreadFit === 'width') {
    followingSheets.forEach((sheet, index) => {
      const page = pages.at(-1) + index + 1;
      if (page > 286) return;
      sheet.querySelector('.running-head span').textContent = page;
      sheet.querySelector('article').setAttribute('aria-label', `第 ${page} 页`);
      sheet.querySelector('h1').textContent = index ? '评估与验证' : '训练与泛化';
      ordered.push(sheet);
    });
  }
  if (pair.children.length !== ordered.length || ordered.some((sheet, index) => pair.children[index] !== sheet)) pair.replaceChildren(...ordered);
  let scale = 1;
  if (mode === 'double') {
    const stage = document.querySelector('.paper-stage'), style = getComputedStyle(stage);
    const geometry = facingPageGeometry({ width: stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom), fit: spreadFit });
    reader.style.setProperty('--spread-sheet-width', geometry.width + 'px');
    reader.style.setProperty('--spread-sheet-height', geometry.height + 'px');
    scale = geometry.width / 700;
    reader.style.setProperty('--spread-scale', scale);
  }
  document.querySelector('#page-number').textContent = mode === 'double' ? pages.join('–') : currentPage;
  document.querySelector('#spread-status').textContent = mode === 'double' ? `等比例 · ${Math.round(scale * 100)}%` : '保留原排版';
}
function panel(name, open) {
  const movement = captureReadingMotion(document.querySelectorAll('.preview-sheet:not([hidden])'));
  reader.dataset[name] = String(open); document.querySelector('#toggle-' + name).setAttribute('aria-expanded', String(open));
  renderSpread(); finishReadingMotion(movement);
  const side = document.querySelector(name === 'ai' ? '.ai' : '.toc');
  if (open && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.body.dataset.input !== 'keyboard') side.animate([{opacity:0,transform:`translateX(${name === 'ai' ? '12px' : '-12px'})`},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
}
document.querySelectorAll('[data-page-layout]').forEach(button => button.onclick = () => {
  requestedSpread = button.dataset.pageLayout;
  renderSpread(); document.querySelector('.paper-stage').scrollLeft = 0;
});
document.querySelector('#preview-spread-fit').onchange = event => { spreadFit = event.target.value; renderSpread(); };
document.querySelector('#immersive-tone').onclick = () => { document.documentElement.dataset.tone = document.documentElement.dataset.tone === 'graphite' ? 'gray' : 'graphite'; };
document.addEventListener('keydown', () => { document.body.dataset.input = 'keyboard'; });
document.addEventListener('pointerdown', () => { document.body.dataset.input = 'pointer'; }, { passive:true });
document.querySelector('#toggle-toc').onclick = () => panel('toc', reader.dataset.toc !== 'true');
document.querySelector('#close-toc').onclick = () => panel('toc', false);
document.querySelector('#toggle-ai').onclick = () => panel('ai', reader.dataset.ai !== 'true');
document.querySelector('#close-ai').onclick = () => panel('ai', false);
document.querySelector('#explain-sentence').onclick = () => panel('ai', true);
document.querySelectorAll('button[data-tone]').forEach(button => button.onclick = () => {
  document.documentElement.dataset.tone = button.dataset.tone;
  document.querySelectorAll('button[data-tone]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
});
function page(number, heading) {
  currentPage = Math.max(1, Math.min(286, number));
  for (const id of ['page-number', 'paper-number', 'quote-page', 'source-page']) document.getElementById(id).textContent = currentPage;
  if (heading) { document.querySelector('#paper-heading').textContent = heading; document.querySelector('#breadcrumb').textContent = heading; }
  renderSpread();
  document.querySelector('.paper-stage').scrollTo({ top: 0 });
}
document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-page]').forEach(b => { b.classList.toggle('active', b === button); if (b === button) b.setAttribute('aria-current', 'location'); else b.removeAttribute('aria-current'); });
  page(Number(button.dataset.page), button.dataset.heading);
  if (matchMedia('(max-width:800px)').matches) panel('toc', false);
});
document.querySelector('#search').oninput = event => {
  const query = event.target.value.trim();
  document.querySelectorAll('.toc details').forEach(details => { details.hidden = !!query && !details.textContent.includes(query); if (query && !details.hidden) details.open = true; });
};
document.querySelector('#previous').onclick = () => page(adjacentPdfPage(currentPage, 286, -1, reader.dataset.spread));
document.querySelector('#next').onclick = () => page(adjacentPdfPage(currentPage, 286, 1, reader.dataset.spread));
document.querySelector('#locate').onclick = () => { document.querySelector('#explain-sentence').scrollIntoView({ block: 'center', behavior: 'auto' }); };
if (matchMedia('(max-width:800px)').matches) panel('toc', false);
new ResizeObserver(() => { if (reader.dataset.spread === 'double') renderSpread(); }).observe(document.querySelector('.paper-stage'));
renderSpread();
