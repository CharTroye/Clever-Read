import test from 'node:test';
import assert from 'node:assert/strict';
import { renderExplanation, briefExplanation } from '../public/reading-ui.mjs';

test('explanations keep paragraphs, lists and code while escaping untrusted markup', () => {
  const html = renderExplanation('## 机制\n\n**前提**与 `a < b`。\n\n- 条件一\n- <img src=x onerror=alert(1)>\n\n1. 第一步\n2. 第二步\n\n```html\n<script>alert(1)</script>\n```');
  assert.match(html, /<h3>机制<\/h3>/);
  assert.match(html, /<strong>前提<\/strong>/);
  assert.match(html, /<code>a &lt; b<\/code>/);
  assert.match(html, /<ul><li>条件一<\/li><li>&lt;img/);
  assert.match(html, /<ol><li>第一步<\/li><li>第二步<\/li><\/ol>/);
  assert.match(html, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);
  assert.doesNotMatch(html, /<img|<script|<a /);
});

test('incomplete code fences and inline markup cannot escape their text containers', () => {
  assert.equal(renderExplanation('```\n</code><svg onload=alert(1)>'), '<pre><code>&lt;/code&gt;&lt;svg onload=alert(1)&gt;</code></pre>');
  assert.equal(renderExplanation('`**text**` **<script>**'), '<p><code>**text**</code> <strong>&lt;script&gt;</strong></p>');
});

test('term previews are bounded and prefer a complete sentence before the detail link', () => {
  assert.equal(briefExplanation('**术语**\n解释。'), '术语 解释。');
  assert.equal(briefExplanation('这是第一句。这里是很长的进一步解释。', 12), '这是第一句。');
  assert.equal(briefExplanation('a'.repeat(300)).length, 181);
});

test('math is typeset locally, code stays literal and unsupported or unsafe TeX falls back to text', () => {
  const html = renderExplanation('行内 $x^2$ 与 \\(y_1\\)。\n\n$$\n\\frac{QK^T}{\\sqrt{d_k}}\n$$\n\n`$literal$`');
  assert.match(html, /class="katex"/);
  assert.match(html, /class="math-block"/);
  assert.match(html, /<math/);
  assert.match(html, /<code>\$literal\$<\/code>/);
  const attack = renderExplanation('$\\href{javascript:alert(1)}{click}$ $\\htmlClass{foo}{bar}$ $\\includegraphics{https://example.com/x}$\n\n$\\def\\x{\\x}\\x$');
  assert.doesNotMatch(attack, /<a\b|<img\b|class="foo"|href="javascript:/);
  assert.match(attack, /math-fallback/);
  assert.match(renderExplanation('$\\unknowncommand{x}$'), /math-fallback/);
});

test('tables escape markup, preserve inline code and escaped pipes, and scroll as one region', () => {
  const html = renderExplanation('| 含义 | 示例 |\n| --- | :---: |\n| **定义** | `a|b` |\n| a\\|b | <img src=x onerror=alert(1)> |');
  assert.match(html, /role="region" aria-label="解读表格" tabindex="0"/);
  assert.match(html, /<th scope="col">含义<\/th>/);
  assert.match(html, /<td><code>a\|b<\/code><\/td>/);
  assert.match(html, /<td>a\|b<\/td>/);
  assert.doesNotMatch(html, /<img\b/);
  assert.doesNotMatch(renderExplanation('a|b\nnot a divider'), /<table/);
});
