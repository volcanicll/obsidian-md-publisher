import { describe, it, expect } from 'vitest'
import {
  extractTitleFromMarkdown,
  extractDigestFromMarkdown,
} from '../src/lib/wechat/wechat-api'

describe('extractTitleFromMarkdown', () => {
  it('extracts the first H1 heading', () => {
    expect(extractTitleFromMarkdown('# My Article\n\nBody')).toBe('My Article')
  })

  it('strips inline markdown formatting from the heading', () => {
    expect(extractTitleFromMarkdown('# **Bold** and `code` and [link](https://x.com)'))
      .toBe('Bold and code and link')
  })

  it('falls back to the frontmatter title when no H1 exists', () => {
    const md = '---\ntitle: "Frontmatter Title"\n---\nBody only\n'
    expect(extractTitleFromMarkdown(md)).toBe('Frontmatter Title')
  })

  it('returns a default title when nothing matches', () => {
    expect(extractTitleFromMarkdown('just some body text')).toBe('未命名文章')
  })

  it('prefers the first H1 over a frontmatter title', () => {
    const md = '---\ntitle: Frontmatter\n---\n# H1 Title\nBody\n'
    expect(extractTitleFromMarkdown(md)).toBe('H1 Title')
  })

  it('strips inline HTML tags from the heading', () => {
    expect(extractTitleFromMarkdown('# <span class="x">Tagged</span> Title')).toBe(
      'Tagged Title'
    )
  })

  it('does not treat deeper headings as the H1 title', () => {
    expect(extractTitleFromMarkdown('## Not an H1\nBody')).toBe('未命名文章')
  })

  it('ignores a heading-like line inside a fenced code block', () => {
    const md = '```md\n# Not the title\n```\n# Real Title\n'
    expect(extractTitleFromMarkdown(md)).toBe('Real Title')
  })

  it('does not read title: from the body when frontmatter is absent', () => {
    // 跨全文正则会把正文里的 title: 当成 frontmatter 字段
    expect(extractTitleFromMarkdown('正文里的 title: 不是标题\n')).toBe('未命名文章')
  })

  it('strips quotes from a frontmatter title', () => {
    expect(extractTitleFromMarkdown("---\ntitle: 'Quoted'\n---\nBody")).toBe('Quoted')
  })
})

describe('extractDigestFromMarkdown', () => {
  it('picks the first paragraph, skipping the title and frontmatter', () => {
    const md = '---\ntitle: X\n---\n# Title\n\nThis is the digest text.\n'
    expect(extractDigestFromMarkdown(md)).toBe('This is the digest text.')
  })

  it('truncates long paragraphs to 120 characters', () => {
    const long = 'a'.repeat(200)
    const digest = extractDigestFromMarkdown(`# T\n\n${long}\n`)
    expect(digest.length).toBe(120)
    expect(digest.endsWith('...')).toBe(true)
  })

  it('truncates by code points so emoji are never split into lone surrogates', () => {
    const digest = extractDigestFromMarkdown(`# T\n\n${'😀'.repeat(200)}\n`)
    // 前 117 个码点都是完整的 emoji，后接省略号
    expect((digest.match(/😀/gu) || []).length).toBe(117)
    expect(digest.endsWith('...')).toBe(true)
  })

  it('returns empty string for content without a paragraph', () => {
    expect(extractDigestFromMarkdown('## Only headings')).toBe('')
  })

  it('skips a leading image and takes the following paragraph', () => {
    const md = '# 标题\n\n![](cover.png)\n\n真正的摘要文字。\n'
    expect(extractDigestFromMarkdown(md)).toBe('真正的摘要文字。')
  })

  it('keeps list text but drops the bullet markers', () => {
    const md = '- 第一项\n- 第二项\n'
    expect(extractDigestFromMarkdown(md)).toBe('第一项 第二项')
  })

  it('drops ordered-list numbering and task checkboxes', () => {
    expect(extractDigestFromMarkdown('1. 第一\n2. 第二')).toBe('第一 第二')
    expect(extractDigestFromMarkdown('- [x] 已完成\n- [ ] 未完成')).toBe('已完成 未完成')
  })

  it('keeps blockquote text without the quote marker', () => {
    expect(extractDigestFromMarkdown('> 引用的一句话')).toBe('引用的一句话')
  })

  it('strips inline emphasis and code markers', () => {
    const md = '**加粗**、`代码`、~~删除~~、==高亮=='
    expect(extractDigestFromMarkdown(md)).toBe('加粗、代码、删除、高亮')
  })

  it('renders wikilinks as readable text', () => {
    const md = '参考 [[笔记]] 与 [[另一篇|别名]] 以及 [[笔记#小节]]。'
    expect(extractDigestFromMarkdown(md)).toBe('参考 笔记 与 别名 以及 笔记 > 小节。')
  })

  it('skips fenced code and takes the paragraph after it', () => {
    const md = '```js\nconst a = 1\n```\n\n代码之后的段落。\n'
    expect(extractDigestFromMarkdown(md)).toBe('代码之后的段落。')
  })

  it('skips table rows', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |\n\n表格后的正文。'
    expect(extractDigestFromMarkdown(md)).toBe('表格后的正文。')
  })

  it('joins wrapped source lines with a space', () => {
    const md = '第一行\n第二行\n'
    expect(extractDigestFromMarkdown(md)).toBe('第一行 第二行')
  })

  it('does not glue text across a heading boundary', () => {
    const md = '第一段结尾\n# 中间标题\n标题后的正文\n'
    expect(extractDigestFromMarkdown(md)).toBe('第一段结尾')
  })
})
