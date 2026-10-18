import { describe, it, expect } from 'vitest'
import {
  clearDraftFrontmatter,
  draftDefaultsFromFrontmatter,
  readDraftFrontmatter,
  splitFrontmatter,
  writeDraftFrontmatter
} from '../src/lib/wechat/draft-frontmatter'

describe('splitFrontmatter', () => {
  it('splits yaml from the body', () => {
    const split = splitFrontmatter('---\ntitle: A\n---\n\n正文')
    expect(split?.yaml).toBe('title: A')
    expect(split?.body).toBe('\n正文')
  })

  it('returns null when there is no frontmatter', () => {
    expect(splitFrontmatter('# 标题\n正文')).toBeNull()
  })

  it('accepts CRLF line endings', () => {
    expect(splitFrontmatter('---\r\ntitle: A\r\n---\r\n正文')?.yaml).toBe('title: A')
  })
})

describe('readDraftFrontmatter', () => {
  it('reads the wechat block', () => {
    const md = [
      '---',
      'wechat:',
      '  media_id: M1',
      '  title: 标题',
      '  author: 作者',
      '  digest: 摘要',
      '  content_source_url: https://example.com',
      '  thumb_media_id: T1',
      '  cover_key: file:cover.png',
      '  cover: assets/cover.png',
      '  pulled_at: 1700000000000',
      '---',
      '正文',
    ].join('\n')

    expect(readDraftFrontmatter(md)).toEqual({
      media_id: 'M1',
      title: '标题',
      author: '作者',
      digest: '摘要',
      content_source_url: 'https://example.com',
      thumb_media_id: 'T1',
      cover_key: 'file:cover.png',
      cover: 'assets/cover.png',
      pulled_at: 1700000000000,
    })
  })

  it('returns null without a wechat block', () => {
    expect(readDraftFrontmatter('---\ntitle: A\n---\n正文')).toBeNull()
  })

  it('returns null when media_id is missing', () => {
    expect(readDraftFrontmatter('---\nwechat:\n  title: A\n---\n正文')).toBeNull()
  })

  it('returns null for malformed yaml instead of throwing', () => {
    expect(readDraftFrontmatter('---\nwechat: [unclosed\n---\n正文')).toBeNull()
  })

  it('drops non-string fields', () => {
    const md = '---\nwechat:\n  media_id: M1\n  title: 123\n  pulled_at: "x"\n---\n正文'
    expect(readDraftFrontmatter(md)).toEqual({ media_id: 'M1' })
  })
})

describe('writeDraftFrontmatter', () => {
  it('creates a frontmatter block when none exists', () => {
    const out = writeDraftFrontmatter('# 标题\n\n正文', { media_id: 'M1', title: '标题' })
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('media_id: M1')
    expect(out).toContain('# 标题')
    expect(readDraftFrontmatter(out)?.media_id).toBe('M1')
  })

  it('preserves unrelated frontmatter keys', () => {
    const md = '---\ntags:\n  - 咖啡\ntitle: 用户标题\n---\n正文'
    const out = writeDraftFrontmatter(md, { media_id: 'M2' })

    expect(out).toContain('tags')
    expect(out).toContain('咖啡')
    expect(out).toContain('用户标题')
    expect(readDraftFrontmatter(out)?.media_id).toBe('M2')
  })

  it('replaces an existing wechat block instead of duplicating it', () => {
    const first = writeDraftFrontmatter('正文', { media_id: 'M1', author: '旧作者' })
    const second = writeDraftFrontmatter(first, { media_id: 'M1', author: '新作者' })

    expect(second.match(/wechat:/g)).toHaveLength(1)
    expect(readDraftFrontmatter(second)?.author).toBe('新作者')
  })

  it('omits empty optional fields', () => {
    const out = writeDraftFrontmatter('正文', { media_id: 'M1', author: '' })
    expect(out).not.toContain('author:')
  })

  it('round-trips through readDraftFrontmatter', () => {
    const data = {
      media_id: 'M1',
      title: '带: 冒号的标题',
      digest: '含 "引号" 的摘要',
      thumb_media_id: 'T1',
      pulled_at: 1700000000000,
    }
    const out = writeDraftFrontmatter('正文', data)
    expect(readDraftFrontmatter(out)).toEqual(data)
  })
})

describe('draftDefaultsFromFrontmatter', () => {
  it('maps stored fields to publish form defaults', () => {
    const defaults = draftDefaultsFromFrontmatter({
      media_id: 'M1',
      title: '标题',
      author: '作者',
      digest: '摘要',
      content_source_url: 'https://a.com',
      thumb_media_id: 'T1',
      cover_key: 'file:cover.png',
      cover: 'assets/cover.png',
    })

    expect(defaults).toEqual({
      title: '标题',
      author: '作者',
      digest: '摘要',
      contentSourceUrl: 'https://a.com',
      thumbMediaId: 'T1',
      coverKey: 'file:cover.png',
      coverPath: 'assets/cover.png',
    })
  })

  it('returns an empty object for null input', () => {
    expect(draftDefaultsFromFrontmatter(null)).toEqual({})
  })
})

describe('clearDraftFrontmatter', () => {
  it('removes the wechat block but keeps other frontmatter', () => {
    const md = '---\ntags:\n  - a\nwechat:\n  media_id: M1\n---\n\n正文'
    const out = clearDraftFrontmatter(md)
    expect(out).not.toContain('wechat')
    expect(out).not.toContain('media_id')
    expect(out).toContain('tags')
    expect(out).toContain('正文')
  })

  it('drops the whole frontmatter block when nothing else remains', () => {
    const md = '---\nwechat:\n  media_id: M1\n---\n\n正文'
    const out = clearDraftFrontmatter(md)
    expect(out).not.toContain('---')
    expect(out.trim()).toBe('正文')
  })

  it('leaves notes without frontmatter untouched', () => {
    expect(clearDraftFrontmatter('# 标题\n正文')).toBe('# 标题\n正文')
  })

  it('leaves notes without a wechat block untouched', () => {
    const md = '---\ntags:\n  - a\n---\n正文'
    expect(clearDraftFrontmatter(md)).toBe(md)
  })

  it('does not touch malformed yaml', () => {
    const md = '---\nwechat: [unclosed\n---\n正文'
    expect(clearDraftFrontmatter(md)).toBe(md)
  })
})

describe('title_in_body', () => {
  it('round-trips through frontmatter', () => {
    const out = writeDraftFrontmatter('正文', {
      media_id: 'M1',
      title: '标题',
      title_in_body: true
    })
    expect(out).toContain('title_in_body: true')
    expect(readDraftFrontmatter(out)?.title_in_body).toBe(true)
  })

  it('is exposed in publish defaults', () => {
    expect(
      draftDefaultsFromFrontmatter({ media_id: 'M1', title: '标题', title_in_body: true })
    ).toMatchObject({ title: '标题', titleInBody: true })
  })

  it('is omitted when not set', () => {
    const out = writeDraftFrontmatter('正文', { media_id: 'M1' })
    expect(out).not.toContain('title_in_body')
  })
})
