import { describe, it, expect } from 'vitest'
import { render, convertWikiEmbeds } from '../src/lib/markdown/render'
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
    expect(html).toContain('type="checkbox"')
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

  it('keeps non-embed wikilinks as-is', () => {
    expect(convertWikiEmbeds('[[some note]]')).toBe('[[some note]]')
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
    expect(html).toContain('type="checkbox"')
    expect(html).not.toMatch(/task-list-item[^>]*>\s*<span[^>]*>• /)
  })

  it('indents nested lists with a bullet each', async () => {
    const html = await render({ markdown: '- A\n  - A1' })
    expect(html.match(/• <\/span>/g)).toHaveLength(2)
  })
})
