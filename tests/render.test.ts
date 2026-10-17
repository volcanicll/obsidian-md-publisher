import { describe, it, expect } from 'vitest'
import { render, convertWikiEmbeds, convertHighlights } from '../src/lib/markdown/render'
import {
  LIST_TEXT_SPAN_STYLE,
  cleanFootnotes,
  replaceMarkTags,
  stabilizeLists,
  transformTaskLists,
  wrapWideTables,
} from '../src/lib/markdown/post-process'
import { getAllMarkdownStyles } from '../src/themes/markdown-style'

describe('render pipeline', () => {
  it('renders markdown to HTML with inlined styles', async () => {
    const html = await render({ markdown: '# Hello\n\nA **bold** paragraph.' })
    expect(html).toContain('<h1')
    expect(html).toContain('<strong')
    expect(html).toContain('id="bm-md"')
    expect(html).toContain('style=')
  })

  it('strips YAML frontmatter', async () => {
    const md = '---\ntitle: Test\nplatform: wechat\n---\n# Real Title\n'
    const html = await render({ markdown: md })
    expect(html).toContain('Real Title')
    expect(html).not.toContain('platform: wechat')
  })

  it('supports GFM tables and task lists', async () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n'
    const html = await render({ markdown: md })
    expect(html).toContain('<table')
    // 公众号会过滤 <input>，任务项换成 ✓ / □ 文本符号
    expect(html).toContain('✓')
    expect(html).toContain('□')
    expect(html).not.toContain('type="checkbox"')
  })

  it('renders KaTeX math', async () => {
    const html = await render({ markdown: '公式 $$E=mc^2$$' })
    expect(html).toContain('katex')
  })

  it('highlights code blocks', async () => {
    const md = '```js\nconst a = 1\n```\n'
    const html = await render({ markdown: md })
    expect(html).toContain('hljs')
  })

  it('applies the chosen markdown theme via inlined styles', async () => {
    const md = '# Heading\n'
    const html = await render({ markdown: md, markdownStyle: 'mist' })
    // Theme 内联到 h1（juice 按选择器匹配元素后写入 style 属性）
    expect(html).toContain('<h1')
    expect(html).toContain('style=')
  })

  it('injects custom CSS', async () => {
    const md = '# X\n'
    const html = await render({ markdown: md, customCss: '#bm-md h1 { color: rgb(1, 2, 3); }' })
    expect(html).toContain('rgb(1, 2, 3)')
  })

  it('sanitizes script tags but keeps safe raw HTML', async () => {
    const md = '<script>alert(1)</script># Safe\n'
    const html = await render({ markdown: md })
    expect(html).not.toContain('<script')
    expect(html).toContain('Safe')
  })

  it('opens external links in a new window', async () => {
    const md = '[link](https://example.com)\n'
    const html = await render({ markdown: md })
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})

describe('convertWikiEmbeds', () => {
  it('converts wiki embeds to standard markdown images', async () => {
    expect(convertWikiEmbeds('![[images/photo.png]]')).toBe('![](images/photo.png)')
  })

  it('drops the size suffix from wiki embeds', async () => {
    expect(convertWikiEmbeds('![[photo.png|300]]')).toBe('![](photo.png)')
  })

  it('encodes spaces in embed paths', async () => {
    expect(convertWikiEmbeds('![[Pasted image 1.png]]')).toBe('![](Pasted%20image%201.png)')
  })

  it('leaves code fences and inline code untouched', () => {
    const md = '```\n![[inside-fence.png]]\n```\n\n`![[inline.png]]`\n\n![[real.png]]'
    const out = convertWikiEmbeds(md)
    expect(out).toContain('![[inside-fence.png]]')
    expect(out).toContain('`![[inline.png]]`')
    expect(out).toContain('![](real.png)')
  })

  it('toggles fence state across multiple blocks', () => {
    const md = '```\n![[a.png]]\n```\n\n![[outside.png]]\n\n~~~\n![[b.png]]\n~~~'
    const out = convertWikiEmbeds(md)
    expect(out).toContain('![[a.png]]')
    expect(out).toContain('![](outside.png)')
    expect(out).toContain('![[b.png]]')
  })

  it('converts inline wikilinks to their display text', () => {
    // 公众号不支持 vault 内跳转，保留 [[…]] 只会让源码出现在正文里
    expect(convertWikiEmbeds('[[some note]]')).toBe('some note')
  })

  it('uses the alias of a piped wikilink', () => {
    expect(convertWikiEmbeds('[[笔记|别名]]')).toBe('别名')
  })

  it('renders a heading link as note > heading', () => {
    expect(convertWikiEmbeds('[[笔记#小节]]')).toBe('笔记 > 小节')
  })

  it('leaves wikilinks inside code untouched', () => {
    const md = '`[[inline]]`\n\n```\n[[fenced]]\n```\n\n[[real]]'
    const out = convertWikiEmbeds(md)
    expect(out).toContain('`[[inline]]`')
    expect(out).toContain('[[fenced]]')
    expect(out).toContain('real')
    expect(out).not.toContain('[[real]]')
  })

  it('degrades an unresolved note embed to plain text', () => {
    // 正常流程由 resolveNoteEmbeds 换成引用块；漏网时至少不留语法源码
    expect(convertWikiEmbeds('![[某篇笔记]]')).toBe('某篇笔记')
  })

  it('renders wiki embeds into img tags', async () => {
    const html = await render({ markdown: '![[photo.png]]\n' })
    expect(html).toContain('<img')
    expect(html).toContain('photo.png')
  })
})

describe('dollar signs in prose (currency safety)', () => {
  it('keeps two money amounts in one line as plain text', async () => {
    const html = await render({ markdown: '从 $10 到 $20 不等' })
    expect(html).not.toContain('katex')
    expect(html).toContain('$10')
    expect(html).toContain('$20')
  })

  it('keeps currency ranges with units intact', async () => {
    const html = await render({ markdown: '粗估 $150-250/月（集群 ~$30 + LB ~$20）' })
    expect(html).not.toContain('katex')
    expect(html).toContain('$150-250/月')
    expect(html).toContain('~$30')
  })

  it('keeps shell variables intact', async () => {
    const html = await render({ markdown: 'export A=$1 B=$2' })
    expect(html).not.toContain('katex')
    expect(html).toContain('$1')
    expect(html).toContain('$2')
  })

  it('still renders block math delimited by double dollars', async () => {
    const html = await render({ markdown: '$$\n\\int_0^1 x dx\n$$' })
    expect(html).toContain('katex')
  })

  it('still renders inline math delimited by double dollars', async () => {
    const html = await render({ markdown: '行内 $$E=mc^2$$ 成立' })
    expect(html).toContain('katex')
  })

  it('leaves a single lone amount as plain text', async () => {
    const html = await render({ markdown: '价格 $100 元' })
    expect(html).not.toContain('katex')
    expect(html).toContain('$100')
  })

  it('restores single-dollar inline math when explicitly enabled', async () => {
    const html = await render({ markdown: '公式 $E=mc^2$ 成立', inlineDollarMath: true })
    expect(html).toContain('katex')
  })
})

describe('list markers survive publishing', () => {
  it('emits a styled bullet for every built-in theme', async () => {
    // 公众号会丢弃 ::marker，列表符号改用 ::before 生成真实 span 才能保留主题色
    const styles = getAllMarkdownStyles([]).filter((s) => s.id !== 'custom')
    for (const style of styles) {
      const html = await render({ markdown: '- 第一项\n- 第二项', markdownStyle: style.id })
      expect(html, `${style.id} 缺少可发布的列表符号`).toMatch(
        /<span style="[^"]*color:[^"]*">• <\/span>/
      )
    }
  })

  it('keeps native ordered-list numbering so start is respected', async () => {
    const html = await render({ markdown: '3. 第三\n4. 第四' })
    expect(html).toContain('<ol start="3"')
    // 有序列表不能用 CSS 计数器编号：会忽略 start 属性，从 1 重新计数
    expect(html).not.toMatch(/<ol[\s\S]*?<span[^>]*>\d+\. <\/span>/)
  })

  it('does not add a bullet to task list items', async () => {
    const html = await render({ markdown: '- [x] 完成\n- [ ] 待办' })
    expect(html).toContain('✓')
    expect(html).toContain('□')
    expect(html).not.toMatch(/task-list-item[^>]*>\s*<span[^>]*>• /)
  })

  it('indents nested lists with a bullet each', async () => {
    const html = await render({ markdown: '- A\n  - A1' })
    expect(html.match(/• <\/span>/g)).toHaveLength(2)
  })
})

describe('convertHighlights', () => {
  it('converts ==text== to a mark tag', () => {
    expect(convertHighlights('这是 ==重点== 内容')).toBe('这是 <mark>重点</mark> 内容')
  })

  it('handles multiple highlights on one line', () => {
    expect(convertHighlights('==A== 和 ==B==')).toBe('<mark>A</mark> 和 <mark>B</mark>')
  })

  it('leaves comparison operators in code untouched', () => {
    const md = '```bash\n[[ $a == $b ]]\n```\n\n行内 `a == b`\n\n正文 ==高亮=='
    const out = convertHighlights(md)
    expect(out).toContain('[[ $a == $b ]]')
    expect(out).toContain('`a == b`')
    expect(out).toContain('<mark>高亮</mark>')
  })

  it('leaves spaced comparisons in prose untouched', () => {
    // `if a == b` 这类写法在 Obsidian 里也不会高亮
    expect(convertHighlights('判断 a == b 是否成立')).toBe('判断 a == b 是否成立')
  })

  it('supports a single-character highlight', () => {
    expect(convertHighlights('==高==')).toBe('<mark>高</mark>')
  })

  it('does not match across line breaks', () => {
    expect(convertHighlights('==开头\n结尾==')).toBe('==开头\n结尾==')
  })
})

describe('post-process helpers', () => {
  it('transformTaskLists replaces checked and unchecked checkboxes with symbols', () => {
    const html = '<li><input type="checkbox" checked disabled> 完成</li><li><input type="checkbox" disabled> 待办</li>'
    const out = transformTaskLists(html)
    expect(out).not.toContain('<input')
    expect(out).toContain('✓')
    expect(out).toContain('□')
  })

  it('cleanFootnotes unwraps refs and removes backrefs', () => {
    const html =
      '<p>正文<a href="#user-content-fn-1" data-footnote-ref>1</a></p>' +
      '<section><ol><li id="user-content-fn-1"><p>注<a href="#user-content-fnref-1" data-footnote-backref>↩</a></p></li></ol></section>'
    const out = cleanFootnotes(html)
    expect(out).toContain('正文1')
    expect(out).not.toContain('↩')
    expect(out).not.toContain('<a')
    expect(out).toContain('注')
  })

  it('cleanFootnotes returns input unchanged when there are no footnotes', () => {
    const html = '<p>普通段落</p>'
    expect(cleanFootnotes(html)).toBe(html)
  })

  it('replaceMarkTags swaps mark for span and keeps attributes', () => {
    expect(replaceMarkTags('<p><mark style="color: red;">x</mark></p>')).toBe(
      '<p><span style="color: red;">x</span></p>'
    )
    expect(replaceMarkTags('<mark>x</mark>')).toBe('<span>x</span>')
  })

  // 公众号保存草稿时会把列表里的空白文本节点当成条目，插进空 <li>，
  // 真实条目被挤到偶数位。渲染器默认输出带换行的列表，这里必须压平。
  it('stabilizeLists removes whitespace between list tags', () => {
    const html = '<ol>\n<li>一</li>\n<li>二</li>\n</ol>'
    const span = (text: string) => `<span style="${LIST_TEXT_SPAN_STYLE}">${text}</span>`
    expect(stabilizeLists(html)).toBe(
      `<ol><li>${span('一')}</li><li>${span('二')}</li></ol>`
    )
  })

  // 列表项里没被行内标签包住的文字会被编辑器塞进块级 <section>，
  // 导致加粗小标题与说明断成两行；预先包一个 <span> 可以避免。
  // span 必须带 style —— 无属性的 span 会被微信编辑器剥掉，裸文本重新暴露，
  // 于是又被包进块级 section（真机表现就是粗体小标题后强制换行）。
  it('stabilizeLists wraps bare text in styled spans without touching inline tags', () => {
    const out = stabilizeLists('<li><strong>标题</strong>：说明</li>')
    expect(out).toBe(
      `<li><strong>标题</strong><span style="${LIST_TEXT_SPAN_STYLE}">：说明</span></li>`
    )
  })

  it('stabilizeLists never emits an attribute-less span wrapper', () => {
    const out = stabilizeLists('<li>前段<strong>标题</strong>尾段</li>')
    expect(out).not.toContain('<span>')
    expect(out.match(new RegExp(LIST_TEXT_SPAN_STYLE, 'g'))).toHaveLength(2)
  })

  it('stabilizeLists keeps spaces inside and between inline elements', () => {
    const out = stabilizeLists('<li>前段 <code>code</code> 后段</li>')
    expect(out).toBe(
      `<li><span style="${LIST_TEXT_SPAN_STYLE}">前段 </span><code>code</code>` +
        `<span style="${LIST_TEXT_SPAN_STYLE}"> 后段</span></li>`
    )
  })

  it('stabilizeLists handles nested lists', () => {
    const out = stabilizeLists('<ul>\n<li>父\n<ul>\n<li>子</li>\n</ul>\n</li>\n</ul>')
    expect(out).not.toMatch(/\s<li/)
    expect(out).not.toMatch(/<\/li>\s/)
    expect(out).toContain(`<span style="${LIST_TEXT_SPAN_STYLE}">父`)
    expect(out).toContain(`<span style="${LIST_TEXT_SPAN_STYLE}">子</span>`)
  })

  // 手机正文区约 300px，4 列时每列不足 80px，表头与正文会被压成一行两三个字。
  // 宽表格给最小宽度、由外层容器横向滚动；窄表格不加最小宽度，正常铺满。
  it('wrapWideTables wraps every table in a scroll container', () => {
    const narrow = '<table><thead><tr><th>A</th><th>B</th></tr></thead></table>'
    const out = wrapWideTables(narrow)
    expect(out).toMatch(/^<section data-bm-table-scroll="1">/)
    expect(out).toContain('<table>')
    expect(out).not.toContain('min-width')
  })

  it('wrapWideTables gives wide tables a minimum width', () => {
    const wide =
      '<table><thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>'
    const out = wrapWideTables(wide)
    // 最小宽度写成内联样式：公众号保存草稿时会丢掉 data-* 属性
    expect(out).toContain('style="min-width: 460px;"')
    expect(out).toMatch(/^<section data-bm-table-scroll="1">/)
  })

  it('wrapWideTables counts columns from the header row only', () => {
    const table =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></tbody></table>'
    expect(wrapWideTables(table)).not.toContain('min-width')
  })

  it('wrapWideTables leaves non-table markup untouched', () => {
    const html = '<p>正文</p><pre><code>&lt;table&gt;</code></pre>'
    expect(wrapWideTables(html)).toBe(html)
  })

  it('wrapWideTables merges into an existing style attribute', () => {
    const table =
      '<table style="color: red;"><thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead></table>'
    const out = wrapWideTables(table)
    expect(out).toContain('style="min-width: 460px; color: red;"')
    expect(out.match(/style=/g)).toHaveLength(1)
  })
})

describe('fidelity pipeline end to end', () => {
  it('renders highlights as styled spans that WeChat keeps', async () => {
    const html = await render({ markdown: '这是 ==重点== 内容' })
    expect(html).not.toContain('<mark')
    expect(html).toContain('background-color: #fff3bf')
    expect(html).toContain('重点')
  })

  it('renders footnotes without anchors or backref arrows', async () => {
    const md = '正文[^1]\n\n[^1]: 脚注内容\n'
    const html = await render({ markdown: md })
    expect(html).toContain('脚注内容')
    expect(html).not.toContain('data-footnote-ref')
    expect(html).not.toContain('↩')
  })

  it('renders task items with a text symbol and no bullet', async () => {
    const html = await render({ markdown: '- [x] 完成\n- [ ] 待办' })
    expect(html).not.toContain('<input')
    // 文本符号后的空格连同说明一起被包进带样式的 span，避免微信把裸文本拆成块
    expect(html).toMatch(new RegExp(`✓</span><span style="${LIST_TEXT_SPAN_STYLE}"> 完成</span>`))
    expect(html).toMatch(new RegExp(`□</span><span style="${LIST_TEXT_SPAN_STYLE}"> 待办</span>`))
    expect(html).not.toContain('>• <')
  })

  it('keeps tables as tables instead of block boxes', async () => {
    const html = await render({ markdown: '| A | B |\n|---|---|\n| 1 | 2 |\n' })
    // display:block 会把单元格拆成独立块，微信里每列只剩两三个字就折行
    expect(html).not.toMatch(/<table[^>]*style="[^"]*display:\s*block/)
    expect(html).toMatch(/<table[^>]*style="[^"]*width: 100%/)
  })

  it('wraps wide tables in a horizontally scrollable container', async () => {
    const md =
      '| 形态 | 条件 | 固定成本 | LLM 成本 |\n|---|---|---|---|\n| 本地 | Node 18 | $0 | 按量 |\n'
    const html = await render({ markdown: md, markdownStyle: 'terminal' })
    expect(html).toMatch(/<section[^>]*overflow-x: auto[^>]*>\s*<table[^>]*min-width: 460px;/)
  })

  it('wraps inline code so it does not break mid-token', async () => {
    const html = await render({ markdown: '- 入口 `model-policy.ts` 与 `server/src/llm.ts`' })
    // inline 盒允许在连字符处断行，inline-block 让整个代码片段参与换行
    expect(html).toMatch(/<code[^>]*style="[^"]*display: inline-block/)
    // 代码块内部的 code 必须保持行内，否则破坏横向滚动与高亮
    const block = await render({ markdown: '```ts\nconst a = 1\n```' })
    expect(block).toMatch(/<pre[^>]*>\s*<code[^>]*style="[^"]*display: inline;/)
  })

  // 文章页不认 white-space: pre，草稿里真实的换行会被折叠成空格，
  // 整段代码按容器重新折行，ASCII 图的缩进与对齐全部错位。
  it('hardens code blocks so line breaks survive publishing', async () => {
    const md = '```\n a  b\n  c\n```'
    const html = await render({ markdown: md })
    const block = html.match(/<pre[\s\S]*?<\/pre>/)![0]
    // 换行必须变 <br>，缩进必须变 &nbsp;，否则公众号会把它们当普通空白折叠
    expect(block).toContain('&nbsp;a&nbsp;&nbsp;b<br>')
    expect(block).toContain('&nbsp;&nbsp;c')
    expect(block).not.toMatch(/>[^<]*\n[^<]*</)
  })

  it('keeps syntax-highlight spans inside hardened code blocks', async () => {
    const html = await render({ markdown: '```ts\nconst a = 1\n```', codeTheme: 'one-light' })
    const block = html.match(/<pre[\s\S]*?<\/pre>/)![0]
    expect(block).toContain('<span')
    expect(block).toContain('&nbsp;')
  })

  it('leaves inline code readable instead of hardening it', async () => {
    const html = await render({ markdown: '行内 `a b` 代码' })
    expect(html).not.toContain('<br>')
    expect(html).toContain('a b')
  })
})
