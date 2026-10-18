import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, cleanupMarkdown } from '../src/lib/markdown/html-to-markdown'
import { render } from '../src/lib/markdown/render'
import { calloutTypeByCard } from '../src/lib/markdown/callouts'

describe('htmlToMarkdown: 基本结构', () => {
  it('keeps heading levels', () => {
    expect(htmlToMarkdown('<h1>标题</h1><h3>小节</h3>')).toBe('# 标题\n\n### 小节')
  })

  it('renders paragraphs and drops empty ones', () => {
    expect(htmlToMarkdown('<p>第一段</p><p></p><p>第二段</p>')).toBe('第一段\n\n第二段')
  })

  it('renders inline emphasis, code and links', () => {
    const html =
      '<p><strong>加粗</strong> 与 <em>斜体</em> 与 <code>code</code> 与 ' +
      '<a href="https://example.com">链接</a></p>'
    expect(htmlToMarkdown(html)).toBe(
      '**加粗** 与 *斜体* 与 `code` 与 [链接](https://example.com)'
    )
  })

  it('renders sibling links as separate links', () => {
    // parse5 会把嵌套 <a> 自动拆成兄弟节点，因此还原结果不会出现嵌套链接
    const html = '<p><a href="https://a.com">外层</a> <a href="https://b.com">内层</a></p>'
    expect(htmlToMarkdown(html)).toBe('[外层](https://a.com) [内层](https://b.com)')
  })

  it('renders horizontal rules', () => {
    expect(htmlToMarkdown('<p>上</p><hr><p>下</p>')).toBe('上\n\n---\n\n下')
  })
})

describe('htmlToMarkdown: 列表', () => {
  it('renders unordered and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li>甲</li><li>乙</li></ul>')).toBe('- 甲\n- 乙')
    expect(htmlToMarkdown('<ol><li>甲</li><li>乙</li></ol>')).toBe('1. 甲\n2. 乙')
  })

  it('keeps the start index of ordered lists', () => {
    expect(htmlToMarkdown('<ol start="3"><li>丙</li><li>丁</li></ol>')).toBe('3. 丙\n4. 丁')
  })

  it('indents nested lists', () => {
    const html = '<ul><li>外层<ul><li>内层</li></ul></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- 外层\n  - 内层')
  })

  it('restores GFM task markers from ✓ / □ symbols', () => {
    const html = '<ul><li>✓ 已完成</li><li>□ 未完成</li></ul>'
    expect(htmlToMarkdown(html)).toBe('- [x] 已完成\n- [ ] 未完成')
  })

  it('strips the bullet glyph the theme injects', () => {
    // 主题把 list-style 关掉后手工插入 <span>• </span>，还原时必须丢掉
    const html =
      '<ul><li><span style="color: currentColor; font-weight: 700;">• </span>' +
      '<span style="display: inline; color: currentColor">第一项</span></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- 第一项')
  })

  it('keeps inline formatting inside list items', () => {
    const html = '<ul><li><strong>标题</strong>：说明</li></ul>'
    expect(htmlToMarkdown(html)).toBe('- **标题**：说明')
  })
})

describe('htmlToMarkdown: 代码块', () => {
  it('keeps language and code content', () => {
    const html = '<pre><code class="language-js">const a = 1</code></pre>'
    expect(htmlToMarkdown(html)).toBe('```js\nconst a = 1\n```')
  })

  it('restores newlines and indentation from <br> / &nbsp;', () => {
    const html =
      '<pre><code class="language-text">line1<br>line2<br>' +
      '&nbsp;&nbsp;&nbsp;&nbsp;indented<br>end</code></pre>'
    expect(htmlToMarkdown(html)).toBe(
      '```text\nline1\nline2\n    indented\nend\n```'
    )
  })

  it('uses a longer fence when the code contains backticks', () => {
    const html = '<pre><code>```inner```</code></pre>'
    const out = htmlToMarkdown(html)
    expect(out.startsWith('````')).toBe(true)
    expect(out).toContain('```inner```')
  })

  it('reads the language from hljs class lists', () => {
    const html = '<pre><code class="hljs language-python">print(1)</code></pre>'
    expect(htmlToMarkdown(html)).toBe('```python\nprint(1)\n```')
  })
})

describe('htmlToMarkdown: 表格', () => {
  it('renders a GFM table with header divider', () => {
    const html =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('pads short rows to the table width', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 |  |')
  })

  it('escapes pipes inside cells', () => {
    const html = '<table><tr><th>a|b</th></tr><tr><td>c</td></tr></table>'
    expect(htmlToMarkdown(html)).toContain('a\\|b')
  })
})

describe('htmlToMarkdown: 引用与 callout', () => {
  it('renders blockquotes', () => {
    const html = '<blockquote><p>第一段</p><p>第二段</p></blockquote>'
    expect(htmlToMarkdown(html)).toBe('> 第一段\n>\n> 第二段')
  })

  it('restores callout cards to [!type] syntax', () => {
    const html =
      '<section style="margin:1.5em 0;padding:14px 16px;background:#eef8f2;' +
      'border-left:4px solid #2e9968;border-radius:8px;font-size:14px;line-height:1.8;">' +
      '<p style="margin:0 0 8px;color:#2e9968;font-weight:600;">三条要点</p>' +
      '<p>正文内容</p></section>'
    expect(htmlToMarkdown(html)).toBe('> [!tip] 三条要点\n> 正文内容')
  })

  it('restores callouts without an explicit title', () => {
    const html =
      '<section style="background:#fdf3e7;border-left:4px solid #d07815;">' +
      '<p style="color:#d07815;">警告</p><p>小心</p></section>'
    expect(htmlToMarkdown(html)).toBe('> [!warning] 警告\n> 小心')
  })

  it('treats unknown colored cards as plain containers', () => {
    const html =
      '<section style="background:#ffffff;border-left:4px solid #000000;">' +
      '<p>普通内容</p></section>'
    expect(htmlToMarkdown(html)).toBe('普通内容')
  })

  it('matches callout colors after the editor reserializes them as rgb()', () => {
    expect(calloutTypeByCard('rgb(46, 153, 104)', 'rgb(238, 248, 242)')).toBe('tip')
    expect(calloutTypeByCard('#2e9968', '#eef8f2')).toBe('tip')
    expect(calloutTypeByCard('#2e9968', '#ffffff')).toBeNull()
  })
})

describe('htmlToMarkdown: 公式', () => {
  const katex = (tex: string, display: boolean): string =>
    `<span class="katex${display ? '-display' : ''}">` +
    `<span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${tex}</annotation>` +
    `</semantics></math></span>` +
    `<span class="katex-html" aria-hidden="true">视觉排版</span></span>`

  it('restores inline math from the TeX annotation', () => {
    const html = `<p>公式 ${katex('a+b', false)} 结束</p>`
    expect(htmlToMarkdown(html)).toBe('公式 $a+b$ 结束')
  })

  it('restores display math on its own block', () => {
    const html = `<p>前</p>${katex('E=mc^2', true)}<p>后</p>`
    expect(htmlToMarkdown(html)).toBe('前\n\n$$\nE=mc^2\n$$\n\n后')
  })

  it('drops KaTeX visual markup when no annotation exists', () => {
    const html =
      '<p>正文<span class="katex"><span class="katex-html">排版产物</span></span></p>'
    expect(htmlToMarkdown(html)).toBe('正文')
  })
})

describe('htmlToMarkdown: 图片', () => {
  it('renders images as markdown', () => {
    expect(htmlToMarkdown('<p><img src="https://cdn/x.png" alt="说明"></p>')).toBe(
      '![说明](https://cdn/x.png)'
    )
  })

  it('reads the real address from data-src on lazy-loaded images', () => {
    // 公众号草稿里的图片普遍是懒加载：src 为空/占位，真实地址在 data-src
    const html =
      '<section style="text-align:center;">' +
      '<img class="rich_pages" data-src="https://mmbiz.qpic.cn/a.jpg" data-type="png">' +
      '</section>'
    expect(htmlToMarkdown(html)).toBe('![](https://mmbiz.qpic.cn/a.jpg)')
  })

  it('prefers data-src over a placeholder src', () => {
    const html =
      '<p><img src="data:image/gif;base64,R0lGOD" data-src="https://mmbiz.qpic.cn/real.jpg"></p>'
    expect(htmlToMarkdown(html)).toBe('![](https://mmbiz.qpic.cn/real.jpg)')
  })

  it('drops images that only carry a placeholder source', () => {
    const html = '<p><img src="data:image/gif;base64,R0lGOD"></p>'
    expect(htmlToMarkdown(html)).toBe('')
  })

  it('keeps images inside a bare section wrapper', () => {
    // <section><img></section> 这种结构曾整块丢失
    const html = '<section><img data-src="https://mmbiz.qpic.cn/b.jpg"></section>'
    expect(htmlToMarkdown(html)).toBe('![](https://mmbiz.qpic.cn/b.jpg)')
  })

  it('rewrites image sources through the provided hook', () => {
    const html = '<p><img src="https://mmbiz.qpic.cn/a.png" alt=""></p>'
    const out = htmlToMarkdown(html, {
      rewriteImageSrc: (src) => (src.includes('mmbiz') ? 'assets/a.png' : null)
    })
    expect(out).toBe('![](assets/a.png)')
  })

  it('rewrites lazy-loaded images through the hook too', () => {
    const html = '<section><img data-src="https://mmbiz.qpic.cn/c.jpg"></section>'
    const out = htmlToMarkdown(html, {
      rewriteImageSrc: (src) => (src.includes('mmbiz') ? 'attachments/c.jpg' : null)
    })
    expect(out).toBe('![](attachments/c.jpg)')
  })

  it('keeps the original source when the hook returns null', () => {
    const html = '<p><img src="https://cdn/x.png"></p>'
    expect(htmlToMarkdown(html, { rewriteImageSrc: () => null })).toBe(
      '![](https://cdn/x.png)'
    )
  })
})

describe('htmlToMarkdown: 公众号特有结构', () => {
  it('unwraps nested section wrappers', () => {
    const html = '<section><section><p>内容</p></section></section>'
    expect(htmlToMarkdown(html)).toBe('内容')
  })

  it('drops hidden placeholder nodes', () => {
    const html = '<section style="display: none;"><p>隐藏</p></section><p>可见</p>'
    expect(htmlToMarkdown(html)).toBe('可见')
  })

  it('keeps leaf span text', () => {
    const html = '<section><span leaf="">第一句</span><span leaf="">第二句</span></section>'
    expect(htmlToMarkdown(html)).toBe('第一句第二句')
  })

  it('restores highlight spans as ==text==', () => {
    const html =
      '<p>前 <span style="background-color: #fff3bf; padding: 0 2px; border-radius: 2px;">' +
      '高亮</span> 后</p>'
    expect(htmlToMarkdown(html)).toBe('前 ==高亮== 后')
  })

  it('renders highlight paragraphs in one line', () => {
    const html = '<p><span style="background-color: #fff3bf; padding: 0 2px;">高亮</span></p>'
    expect(htmlToMarkdown(html)).toBe('==高亮==')
  })
})

describe('cleanupMarkdown', () => {
  it('collapses runs of blank lines', () => {
    expect(cleanupMarkdown('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('trims trailing spaces outside fenced code', () => {
    expect(cleanupMarkdown('a   \nb')).toBe('a\nb')
  })

  it('keeps whitespace inside fenced code', () => {
    expect(cleanupMarkdown('```\na   \nb\n```')).toBe('```\na   \nb\n```')
  })
})

describe('render → htmlToMarkdown 往返', () => {
  it('round-trips a representative article', async () => {
    const markdown = [
      '# 手冲咖啡入门',
      '',
      '这是一段**加粗**与*斜体*的说明。',
      '',
      '## 器具',
      '',
      '- 手冲壶',
      '- 滤杯',
      '  - V60',
      '  - 蛋糕杯',
      '',
      '| 参数 | 数值 |',
      '| --- | --- |',
      '| 水温 | 92℃ |',
      '',
      '> [!tip] 小技巧',
      '> 先温杯再称豆。',
      '',
      '```js',
      'const ratio = 1 / 15',
      '```',
    ].join('\n')

    const html = await render({ markdown })
    const back = htmlToMarkdown(html)

    expect(back).toContain('# 手冲咖啡入门')
    expect(back).toContain('**加粗**')
    expect(back).toContain('## 器具')
    expect(back).toContain('- 手冲壶')
    expect(back).toContain('  - V60')
    expect(back).toContain('| 水温 | 92℃ |')
    expect(back).toContain('> [!tip] 小技巧')
    expect(back).toContain('```js\nconst ratio = 1 / 15\n```')
    // 主题注入的项目符号不能漏进源码
    expect(back).not.toContain('• ')
  })

  it('round-trips math without leaking KaTeX markup', async () => {
    // 行内 $$…$$ 与文本同段时 remark-math 按行内公式处理，还原成 $…$
    const html = await render({ markdown: '公式 $a+b$ 与 $$E=mc^2$$ 同段' })
    const back = htmlToMarkdown(html)
    expect(back).toContain('$a+b$')
    expect(back).toContain('$E=mc^2$')
    expect(back).not.toContain('katex')
  })

  it('round-trips block math as $$ fences', async () => {
    const html = await render({ markdown: '前文\n\n$$\nE = mc^2\n$$\n\n后文' })
    const back = htmlToMarkdown(html)
    expect(back).toBe('前文\n\n$$\nE = mc^2\n$$\n\n后文')
  })

  it('round-trips task lists', async () => {
    const html = await render({ markdown: '- [x] 完成\n- [ ] 待办' })
    expect(htmlToMarkdown(html)).toBe('- [x] 完成\n- [ ] 待办')
  })
})

describe('htmlToMarkdown: 转义', () => {
  it('does not escape ordered-list markers inside headings', () => {
    // `### 1. 什么是…` 曾被写成 `### 1\. 什么是…`，反斜杠会出现在笔记里
    expect(htmlToMarkdown('<h3>1. 什么是 Claude Code？</h3>')).toBe(
      '### 1. 什么是 Claude Code？'
    )
    expect(htmlToMarkdown('<h2>2. 为什么选择</h2>')).toBe('## 2. 为什么选择')
  })

  it('does not escape markers inside list items', () => {
    expect(htmlToMarkdown('<ul><li>1. 列表项内的数字</li></ul>')).toBe(
      '- 1. 列表项内的数字'
    )
  })

  it('still escapes a paragraph that starts with a list marker', () => {
    expect(htmlToMarkdown('<p>1. 这段不该变成列表</p>')).toBe('1\\. 这段不该变成列表')
    expect(htmlToMarkdown('<p>- 这段也不该</p>')).toBe('\\- 这段也不该')
  })

  it('still escapes a paragraph that starts with a heading or quote marker', () => {
    expect(htmlToMarkdown('<p># 不是标题</p>')).toBe('\\# 不是标题')
    expect(htmlToMarkdown('<p>&gt; 不是引用</p>')).toBe('\\> 不是引用')
  })

  it('escapes inline emphasis characters', () => {
    expect(htmlToMarkdown('<p>2 * 3 = 6</p>')).toBe('2 \\* 3 = 6')
  })
})

describe('htmlToMarkdown: 嵌套块级结构', () => {
  it('keeps multi-line code blocks inside list items', async () => {
    // 列表项里的 <pre> 曾被当行内节点，多行代码被压成一行
    const html = await render({
      markdown: '- 步骤\n\n  ```js\n  const a = 1\n  const b = 2\n  ```\n\n- 下一步'
    })
    const out = htmlToMarkdown(html)
    expect(out).toContain('```js')
    expect(out).toContain('const a = 1')
    expect(out).toContain('const b = 2')
    expect(out).not.toContain('const a = 1const b = 2')
  })

  it('keeps tables inside list items', () => {
    const html = '<ul><li>说明<table><tr><th>a</th></tr><tr><td>1</td></tr></table></li></ul>'
    const out = htmlToMarkdown(html)
    expect(out).toContain('| a |')
    expect(out).toContain('| 1 |')
  })

  it('keeps blockquotes inside list items', () => {
    const html = '<ul><li>说明<blockquote><p>引用</p></blockquote></li></ul>'
    expect(htmlToMarkdown(html)).toContain('> 引用')
  })
})

describe('htmlToMarkdown: 表格单元格内容', () => {
  it('keeps inline formatting in cells', () => {
    const html = '<table><tr><th>h</th></tr><tr><td><strong>粗</strong></td></tr></table>'
    expect(htmlToMarkdown(html)).toContain('| **粗** |')
  })

  it('keeps inline code in cells', () => {
    const html = '<table><tr><th>h</th></tr><tr><td><code>x=1</code></td></tr></table>'
    expect(htmlToMarkdown(html)).toContain('| `x=1` |')
  })

  it('keeps links in cells', () => {
    const html = '<table><tr><th>h</th></tr><tr><td><a href="https://x">y</a></td></tr></table>'
    expect(htmlToMarkdown(html)).toContain('| [y](https://x) |')
  })

  it('keeps images in cells instead of dropping them', () => {
    const html =
      '<table><tr><th>h</th></tr><tr><td><img data-src="https://x/y.jpg"></td></tr></table>'
    expect(htmlToMarkdown(html)).toContain('![](https://x/y.jpg)')
  })

  it('collapses cell line breaks into a single line', () => {
    const html = '<table><tr><th>h</th></tr><tr><td>甲<br>乙</td></tr></table>'
    const out = htmlToMarkdown(html)
    expect(out).toContain('| 甲 乙 |')
  })
})
