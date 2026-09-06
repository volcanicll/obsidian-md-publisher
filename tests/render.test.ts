import { describe, it, expect } from 'vitest'
import { render, convertWikiEmbeds } from '../src/lib/markdown/render'

describe('render pipeline', () => {
  it('renders markdown to HTML with inlined styles', async () => {
    const html = await render({ markdown: '# Hello\n\nA **bold** paragraph.' })
    expect(html).toContain('<h1')
    expect(html).toContain('<strong>')
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
    const html = await render({ markdown: '公式 $E=mc^2$' })
    expect(html).toContain('katex')
  })

  it('highlights code blocks', async () => {
    const md = '```js\nconst a = 1\n```\n'
    const html = await render({ markdown: md })
    expect(html).toContain('hljs')
  })

  it('applies the chosen markdown theme via inlined styles', async () => {
    const md = '# Heading\n'
    const html = await render({ markdown: md, markdownStyle: 'ayu-light' })
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
