import { describe, it, expect } from 'vitest'
import { render } from '../src/lib/markdown/render'

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
