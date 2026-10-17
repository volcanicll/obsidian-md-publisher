import { describe, it, expect } from 'vitest'
import {
  classifyUpdateFailure,
  coverKeyFor,
  getDraftLink,
  normalizeDraftLinks,
  removeDraftLink,
  removeDraftLinkByMediaId,
  renameDraftLink,
  setDraftLink,
  weChatErrorCode,
  type DraftLinkMap,
} from '../src/lib/wechat/draft-links'
import { WeChatApiError, isWeChatError } from '../src/lib/wechat/types'

const LINK = { mediaId: 'M1', title: '标题', updatedAt: 1 }

describe('normalizeDraftLinks', () => {
  it('returns an empty map for anything that is not a plain object', () => {
    expect(normalizeDraftLinks(null)).toEqual({})
    expect(normalizeDraftLinks(undefined)).toEqual({})
    expect(normalizeDraftLinks([])).toEqual({})
    expect(normalizeDraftLinks('x')).toEqual({})
  })

  it('drops entries without a usable media_id', () => {
    const map = normalizeDraftLinks({
      'a.md': { mediaId: 'M1', title: 't', updatedAt: 2 },
      'b.md': { title: 'no id' },
      'c.md': { mediaId: '', title: 'empty' },
      'd.md': null,
    })
    expect(Object.keys(map)).toEqual(['a.md'])
    expect(map['a.md']).toEqual({ mediaId: 'M1', title: 't', updatedAt: 2 })
  })

  it('fills defaults for missing title/updatedAt and keeps cover fields when valid', () => {
    const map = normalizeDraftLinks({
      'a.md': { mediaId: 'M1', thumbMediaId: 'COVER', coverKey: 'file:cover.png' },
    })
    expect(map['a.md']).toEqual({
      mediaId: 'M1',
      title: '',
      updatedAt: 0,
      thumbMediaId: 'COVER',
      coverKey: 'file:cover.png',
    })
  })

  it('rejects non-finite timestamps and non-string cover ids', () => {
    const map = normalizeDraftLinks({
      'a.md': { mediaId: 'M1', updatedAt: Number.NaN, thumbMediaId: 42, coverKey: 7 },
    })
    expect(map['a.md']).toEqual({ mediaId: 'M1', title: '', updatedAt: 0 })
  })
})

describe('draft link map helpers', () => {
  it('reads a link by note path and returns null for unknown/null paths', () => {
    const map: DraftLinkMap = { 'a.md': LINK }
    expect(getDraftLink(map, 'a.md')).toEqual(LINK)
    expect(getDraftLink(map, 'b.md')).toBeNull()
    expect(getDraftLink(map, null)).toBeNull()
  })

  it('setDraftLink does not mutate the input map', () => {
    const map: DraftLinkMap = {}
    const next = setDraftLink(map, 'a.md', LINK)
    expect(map).toEqual({})
    expect(next['a.md']).toEqual(LINK)
  })

  it('removeDraftLink returns the same map when the key is absent', () => {
    const map: DraftLinkMap = { 'a.md': LINK }
    expect(removeDraftLink(map, 'b.md')).toBe(map)
    const next = removeDraftLink(map, 'a.md')
    expect(next).toEqual({})
    expect(map['a.md']).toEqual(LINK)
  })

  it('removeDraftLinkByMediaId clears every note pointing at the deleted draft', () => {
    const map: DraftLinkMap = {
      'a.md': { mediaId: 'M1', title: 'a', updatedAt: 1 },
      'b.md': { mediaId: 'M2', title: 'b', updatedAt: 2 },
      'c.md': { mediaId: 'M1', title: 'c', updatedAt: 3 },
    }
    expect(removeDraftLinkByMediaId(map, 'M1')).toEqual({
      'b.md': { mediaId: 'M2', title: 'b', updatedAt: 2 },
    })
  })

  it('removeDraftLinkByMediaId keeps the same reference when nothing matched', () => {
    const map: DraftLinkMap = { 'a.md': LINK }
    expect(removeDraftLinkByMediaId(map, 'OTHER')).toBe(map)
  })

  it('renameDraftLink migrates the key and takes precedence at the new path', () => {
    const map: DraftLinkMap = {
      'old.md': { mediaId: 'M1', title: 'old', updatedAt: 1 },
      'new.md': { mediaId: 'M2', title: 'stale', updatedAt: 0 },
    }
    expect(renameDraftLink(map, 'old.md', 'new.md')).toEqual({
      'new.md': { mediaId: 'M1', title: 'old', updatedAt: 1 },
    })
  })

  it('renameDraftLink is a no-op when the old path has no link', () => {
    const map: DraftLinkMap = { 'a.md': LINK }
    expect(renameDraftLink(map, 'missing.md', 'z.md')).toBe(map)
  })

  it('renameDraftLink migrates every descendant when a folder is renamed', () => {
    const map: DraftLinkMap = {
      'posts/a.md': { mediaId: 'M1', title: 'a', updatedAt: 1 },
      'posts/sub/b.md': { mediaId: 'M2', title: 'b', updatedAt: 2 },
      'other/c.md': { mediaId: 'M3', title: 'c', updatedAt: 3 },
    }
    expect(renameDraftLink(map, 'posts', 'archive/posts')).toEqual({
      'archive/posts/a.md': { mediaId: 'M1', title: 'a', updatedAt: 1 },
      'archive/posts/sub/b.md': { mediaId: 'M2', title: 'b', updatedAt: 2 },
      'other/c.md': { mediaId: 'M3', title: 'c', updatedAt: 3 },
    })
  })

  it('renameDraftLink does not treat a similarly named note as a folder', () => {
    const map: DraftLinkMap = {
      'posts-archive.md': { mediaId: 'M9', title: 'x', updatedAt: 1 },
    }
    expect(renameDraftLink(map, 'posts', 'notes')).toBe(map)
  })
})

describe('coverKeyFor', () => {
  it('keys on the explicit cover path when one is set', () => {
    expect(coverKeyFor(' assets/cover.png ', 'img/body.png', '标题')).toBe(
      'file:assets/cover.png'
    )
  })

  it('keys on the first body image when no explicit cover is set', () => {
    expect(coverKeyFor('', 'img/body.png', '标题')).toBe('auto:img/body.png')
  })

  it('includes the title for generated covers so a retitled note re-renders the card', () => {
    expect(coverKeyFor('', null, ' 标题 ')).toBe('generated:标题')
    expect(coverKeyFor('', null, '另一个标题')).not.toBe(coverKeyFor('', null, '标题'))
  })
})

describe('classifyUpdateFailure', () => {
  it('recreates when the draft is gone or not writable', () => {
    expect(classifyUpdateFailure(87010)).toBe('recreated')
    expect(classifyUpdateFailure(87011)).toBe('recreated')
  })

  it('retries without the cached cover when the cover material is invalid', () => {
    expect(classifyUpdateFailure(40007)).toBe('retryWithoutCover')
    expect(classifyUpdateFailure(87013)).toBe('retryWithoutCover')
  })

  it('treats every other code as fatal', () => {
    expect(classifyUpdateFailure(40001)).toBe('fatal')
    expect(classifyUpdateFailure(0)).toBe('fatal')
  })
})

describe('weChatErrorCode / isWeChatError', () => {
  it('extracts the code from a WeChatApiError and ignores other errors', () => {
    expect(weChatErrorCode(new WeChatApiError(87010))).toBe(87010)
    expect(weChatErrorCode(new Error('boom'))).toBeNull()
    expect(weChatErrorCode(null)).toBeNull()
  })

  it('matches only the requested codes', () => {
    const error = new WeChatApiError(87010)
    expect(isWeChatError(error, 87010, 87011)).toBe(true)
    expect(isWeChatError(error, 40001)).toBe(false)
    expect(isWeChatError(new Error('87010'), 87010)).toBe(false)
  })

  it('keeps the friendly message from the error-code table', () => {
    expect(new WeChatApiError(87013).message).toBe('该图片素材不存在')
    expect(new WeChatApiError(99999).message).toBe('未知错误 (99999)')
  })
})
