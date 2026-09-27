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
})
