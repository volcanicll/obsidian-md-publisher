import { describe, it, expect } from 'vitest'
import {
  canSubmit,
  computeFieldState,
  coverKeyForSource,
  coverSourceHint,
  coverSourceLabel,
  fieldsChip,
  primaryActionLabel,
  summarizeChecks,
  targetStatus,
  type CoverSource,
  type LocalCoverFile,
  type PublishFormState
} from '../src/lib/wechat/publish-form'
import { WECHAT_LIMITS } from '../src/lib/wechat/config'
import type { DraftLink } from '../src/lib/wechat/draft-links'

const localFile: LocalCoverFile = {
  name: 'cover.png',
  size: 2048,
  lastModified: 1700000000000,
  data: new ArrayBuffer(8),
  contentType: 'image/png',
  previewUrl: 'blob:local'
}

function form(overrides: Partial<PublishFormState> = {}): PublishFormState {
  return {
    title: '标题',
    author: '',
    digest: '',
    contentSourceUrl: '',
    needOpenComment: false,
    onlyFansCanComment: false,
    showCoverInBody: true,
    cover: { kind: 'auto' },
    publishMode: 'new',
    draftLink: null,
    ...overrides
  }
}

const draftLink: DraftLink = {
  mediaId: 'media-1',
  title: '旧草稿',
  updatedAt: Date.UTC(2026, 0, 2, 3, 4, 5)
}

describe('computeFieldState', () => {
  it('counts title, author and digest against their limits', () => {
    const state = computeFieldState({
      title: 'a'.repeat(WECHAT_LIMITS.title),
      author: 'b'.repeat(WECHAT_LIMITS.author),
      digest: 'c'.repeat(WECHAT_LIMITS.digest)
    })
    expect(state.title.length).toBe(64)
    expect(state.author.length).toBe(8)
    expect(state.digest.length).toBe(120)
    expect(state.allValid).toBe(true)
    expect(state.okCount).toBe(3)
    expect(state.title.over).toBe(false)
  })

  it('flags over-limit fields but still counts them as present', () => {
    const state = computeFieldState({
      title: 'a'.repeat(WECHAT_LIMITS.title + 1),
      author: 'b'.repeat(WECHAT_LIMITS.author + 1),
      digest: ''
    })
    expect(state.title.over).toBe(true)
    expect(state.title.missing).toBe(false)
    expect(state.author.over).toBe(true)
    expect(state.digest.missing).toBe(false)
    expect(state.allValid).toBe(false)
    expect(state.okCount).toBe(1)
  })

  it('treats whitespace-only title as missing', () => {
    const state = computeFieldState({ title: '   ', author: '', digest: '' })
    expect(state.title.length).toBe(0)
    expect(state.title.missing).toBe(true)
    expect(state.allValid).toBe(false)
    expect(state.okCount).toBe(2)
  })

  it('counts emoji as one character', () => {
    const state = computeFieldState({ title: '😀'.repeat(64), author: '', digest: '' })
    expect(state.title.length).toBe(64)
    expect(state.title.over).toBe(false)
  })

  it('trims before counting so trailing spaces do not trigger over-limit', () => {
    const state = computeFieldState({
      title: 'a'.repeat(WECHAT_LIMITS.title) + '    ',
      author: '',
      digest: ''
    })
    expect(state.title.length).toBe(WECHAT_LIMITS.title)
    expect(state.title.over).toBe(false)
  })
})

describe('coverKeyForSource', () => {
  it('keys vault covers by path', () => {
    expect(coverKeyForSource({ kind: 'vault', path: ' assets/cover.png ' }, null, 'T')).toBe(
      'file:assets/cover.png'
    )
  })

  it('keys uploads by name, size and mtime so the same file can reuse material', () => {
    const key = coverKeyForSource({ kind: 'upload', file: localFile }, null, 'T')
    expect(key).toBe('upload:cover.png:2048:1700000000000')
    expect(coverKeyForSource({ kind: 'upload', file: { ...localFile } }, null, 'T')).toBe(key)
  })

  it('keys generated covers by title', () => {
    expect(coverKeyForSource({ kind: 'generated' }, null, ' 标题 ')).toBe('generated:标题')
    expect(coverKeyForSource({ kind: 'generated' }, null, '标题 2')).not.toBe('generated:标题')
  })

  it('keys auto covers by first body image, falling back to generated', () => {
    expect(coverKeyForSource({ kind: 'auto' }, 'assets/first.png', '标题')).toBe(
      'auto:assets/first.png'
    )
    expect(coverKeyForSource({ kind: 'auto' }, null, '标题')).toBe('generated:标题')
  })

  it('ignores body images when the cover source is explicit', () => {
    const source: CoverSource = { kind: 'vault', path: 'assets/cover.png' }
    expect(coverKeyForSource(source, 'assets/first.png', '标题')).toBe('file:assets/cover.png')
  })
})

describe('coverSourceLabel and coverSourceHint', () => {
  it('labels every cover source', () => {
    expect(coverSourceLabel({ kind: 'vault', path: 'assets/cover.png' }, null)).toBe(
      'assets/cover.png'
    )
    expect(coverSourceLabel({ kind: 'vault', path: '' }, null)).toBe('vault 图片')
    expect(coverSourceLabel({ kind: 'upload', file: localFile }, null)).toBe('本地上传')
    expect(coverSourceLabel({ kind: 'generated' }, 'assets/first.png')).toBe('标题卡片')
    expect(coverSourceLabel({ kind: 'auto' }, 'assets/first.png')).toBe('正文首图')
    expect(coverSourceLabel({ kind: 'auto' }, null)).toBe('标题卡片')
  })

  it('gives a hint per source', () => {
    expect(coverSourceHint({ kind: 'auto' })).toContain('正文第一张图片')
    expect(coverSourceHint({ kind: 'vault', path: 'assets/cover.png' })).toContain('vault')
    expect(coverSourceHint({ kind: 'upload', file: localFile })).toContain('不写入 vault')
    expect(coverSourceHint({ kind: 'generated' })).toContain('标题')
  })
})

describe('summarizeChecks', () => {
  it('reports idle chips before any check runs', () => {
    const chips = summarizeChecks(null, null)
    expect(chips.links).toEqual({ label: '链接未检查', tone: 'idle' })
    expect(chips.words).toEqual({ label: '敏感词未检测', tone: 'idle' })
  })

  it('separates "no links" from "links reachable"', () => {
    expect(summarizeChecks([], []).links).toEqual({ label: '正文无外链', tone: 'ok' })
    expect(
      summarizeChecks(
        [
          { url: 'https://a.test', ok: true },
          { url: 'https://b.test', ok: true }
        ],
        []
      ).links
    ).toEqual({ label: '链接 2 条可达', tone: 'ok' })
  })

  it('counts only failed links in the failure chip', () => {
    const chips = summarizeChecks(
      [
        { url: 'https://a.test', ok: true },
        { url: 'https://b.test', ok: false, status: 404 },
        { url: 'https://c.test', ok: false, error: '请求超时' }
      ],
      []
    )
    expect(chips.links).toEqual({ label: '链接 2 条失败', tone: 'error' })
  })

  it('keeps link results while words are still pending', () => {
    const chips = summarizeChecks([{ url: 'https://a.test', ok: true }], null)
    expect(chips.links.tone).toBe('ok')
    expect(chips.words.tone).toBe('idle')
  })

  it('marks sensitive hits as warnings', () => {
    const chips = summarizeChecks([], [
      { word: '最佳', category: '极限用语', count: 2, context: '…最佳…' }
    ])
    expect(chips.words).toEqual({ label: '敏感词 1', tone: 'warn' })
    expect(summarizeChecks([], []).words).toEqual({ label: '敏感词 0', tone: 'ok' })
  })
})

describe('fieldsChip', () => {
  it('shows ok when all fields pass', () => {
    expect(fieldsChip(computeFieldState({ title: '标题', author: '', digest: '' }))).toEqual({
      label: '字段 3/3',
      tone: 'ok'
    })
  })

  it('shows a warning with the passing count when a field fails', () => {
    expect(
      fieldsChip(computeFieldState({ title: '', author: '', digest: '' }))
    ).toEqual({ label: '字段 2/3', tone: 'warn' })
  })
})

describe('canSubmit', () => {
  const valid = computeFieldState({ title: '标题', author: '', digest: '' })

  it('allows new drafts once fields are valid', () => {
    expect(canSubmit(form(), valid)).toBe(true)
  })

  it('requires a target draft in update mode', () => {
    expect(canSubmit(form({ publishMode: 'update' }), valid)).toBe(false)
    expect(canSubmit(form({ publishMode: 'update', draftLink }), valid)).toBe(true)
  })

  it('blocks when any field is invalid', () => {
    const invalid = computeFieldState({ title: '', author: '', digest: '' })
    expect(canSubmit(form(), invalid)).toBe(false)
  })
})

describe('primaryActionLabel', () => {
  it('reflects the publish mode', () => {
    expect(primaryActionLabel('new')).toBe('保存到草稿')
    expect(primaryActionLabel('update')).toBe('覆盖更新草稿')
  })
})

describe('targetStatus', () => {
  it('describes new-draft mode', () => {
    const status = targetStatus({ publishMode: 'new', draftLink: null })
    expect(status.missing).toBe(false)
    expect(status.text).toContain('新建')
  })

  it('flags update mode without a target', () => {
    const status = targetStatus({ publishMode: 'update', draftLink: null })
    expect(status.missing).toBe(true)
    expect(status.text).toContain('还没有选择')
  })

  it('names the draft being overwritten', () => {
    const status = targetStatus({ publishMode: 'update', draftLink })
    expect(status.missing).toBe(false)
    expect(status.text).toContain('旧草稿')
  })

  it('falls back to a placeholder for untitled drafts', () => {
    const status = targetStatus({
      publishMode: 'update',
      draftLink: { ...draftLink, title: '' }
    })
    expect(status.text).toContain('未命名草稿')
  })
})
