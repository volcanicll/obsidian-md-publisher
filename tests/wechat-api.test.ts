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

  it('returns empty string for content without a paragraph', () => {
    expect(extractDigestFromMarkdown('## Only headings')).toBe('')
  })
})
