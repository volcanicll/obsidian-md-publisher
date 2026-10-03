import { describe, it, expect } from 'vitest'
import {
  pickUniqueFileName,
  resolveExportFolderPath,
  resolveExportPath,
  resolveExportScale,
  arrayBufferToDataUrl,
  MAX_CANVAS_HEIGHT,
} from '../src/lib/export-image'

describe('pickUniqueFileName', () => {
  it('returns base.png when no conflict', () => {
    expect(pickUniqueFileName('读书笔记', [])).toBe('读书笔记.png')
  })

  it('appends -1 when base.png exists', () => {
    expect(pickUniqueFileName('笔记', ['笔记.png'])).toBe('笔记-1.png')
  })

  it('keeps counting until a free slot', () => {
    expect(pickUniqueFileName('笔记', ['笔记.png', '笔记-1.png', '笔记-2.png'])).toBe(
      '笔记-3.png'
    )
  })

  it('reuses a gap in the numbering', () => {
    expect(pickUniqueFileName('笔记', ['笔记.png', '笔记-2.png'])).toBe('笔记-1.png')
  })

  it('compares case-insensitively', () => {
    expect(pickUniqueFileName('Note', ['note.png'])).toBe('Note-1.png')
  })

  it('ignores non-png names', () => {
    expect(pickUniqueFileName('笔记', ['笔记.md'])).toBe('笔记.png')
  })

  it('sanitizes path separators in the base name', () => {
    expect(pickUniqueFileName('a/b\\c', [])).toBe('a-b-c.png')
  })

  it('falls back to "export" for an empty base', () => {
    expect(pickUniqueFileName('  ', [])).toBe('export.png')
  })
})

describe('resolveExportFolderPath', () => {
  it('defaults to the note folder', () => {
    expect(resolveExportFolderPath('notes/abc.md', '')).toBe('notes')
  })

  it('uses vault root for a root-level note', () => {
    expect(resolveExportFolderPath('abc.md', '')).toBe('')
  })

  it('uses vault root when there is no note', () => {
    expect(resolveExportFolderPath(null, '')).toBe('')
  })

  it('prefers the folder setting over the note folder', () => {
    expect(resolveExportFolderPath('notes/abc.md', 'exports/imgs')).toBe('exports/imgs')
  })

  it('normalizes slashes in the folder setting', () => {
    expect(resolveExportFolderPath('notes/abc.md', '/exports/')).toBe('exports')
    expect(resolveExportFolderPath('notes/abc.md', 'a//b')).toBe('a/b')
    expect(resolveExportFolderPath('notes/abc.md', 'a\\b')).toBe('a/b')
  })

  it('treats "." as the note folder and whitespace as unset', () => {
    expect(resolveExportFolderPath('notes/abc.md', '.')).toBe('notes')
    expect(resolveExportFolderPath('notes/abc.md', '   ')).toBe('notes')
  })
})

describe('resolveExportPath', () => {
  it('joins folder and filename', () => {
    expect(resolveExportPath('notes/abc.md', '', 'abc.png')).toBe('notes/abc.png')
  })

  it('returns bare filename for vault root', () => {
    expect(resolveExportPath('abc.md', '', 'abc.png')).toBe('abc.png')
  })

  it('uses the folder setting when present', () => {
    expect(resolveExportPath('notes/abc.md', 'exports', 'abc-1.png')).toBe(
      'exports/abc-1.png'
    )
  })
})

describe('resolveExportScale', () => {
  it('keeps the desired scale when it fits', () => {
    expect(resolveExportScale(1000, 2)).toEqual({ scale: 2, fits: true, downgraded: false })
  })

  it('downgrades to the highest fitting scale', () => {
    // 3x → 60000 超限，2x → 40000 超限，1x → 20000 可用
    expect(resolveExportScale(20000, 3, MAX_CANVAS_HEIGHT)).toEqual({
      scale: 1,
      fits: true,
      downgraded: true,
    })
  })

  it('reports not-fitting when even 1x exceeds the limit', () => {
    expect(resolveExportScale(40000, 2, MAX_CANVAS_HEIGHT)).toEqual({
      scale: 1,
      fits: false,
      downgraded: true,
    })
  })

  it('fits exactly at the boundary', () => {
    expect(resolveExportScale(16383, 2, MAX_CANVAS_HEIGHT)).toEqual({
      scale: 2,
      fits: true,
      downgraded: false,
    })
  })

  it('ceilings fractional heights', () => {
    // 16382.5 → ceil 16383，×2 = 32766 未超限
    expect(resolveExportScale(16382.5, 2, MAX_CANVAS_HEIGHT)).toEqual({
      scale: 2,
      fits: true,
      downgraded: false,
    })
    // 16383.5 → ceil 16384，×2 = 32768 恰好超限 1px，降级
    expect(resolveExportScale(16383.5, 2, MAX_CANVAS_HEIGHT)).toEqual({
      scale: 1,
      fits: true,
      downgraded: true,
    })
  })

  it('passes through for empty or invalid heights', () => {
    expect(resolveExportScale(0, 3)).toEqual({ scale: 3, fits: true, downgraded: false })
    expect(resolveExportScale(-5, 2)).toEqual({ scale: 2, fits: true, downgraded: false })
    expect(resolveExportScale(Number.NaN, 2)).toEqual({
      scale: 2,
      fits: true,
      downgraded: false,
    })
  })

  it('uses the default canvas limit when omitted', () => {
    // 20000 * 2 > 32767（默认上限），降到 1x
    expect(resolveExportScale(20000, 2)).toEqual({ scale: 1, fits: true, downgraded: true })
  })
})

describe('arrayBufferToDataUrl', () => {
  it('encodes small buffers', () => {
    const bytes = new TextEncoder().encode('hello')
    expect(arrayBufferToDataUrl(bytes.buffer, 'text/plain')).toBe(
      'data:text/plain;base64,aGVsbG8='
    )
  })

  it('emits an empty payload for an empty buffer', () => {
    expect(arrayBufferToDataUrl(new ArrayBuffer(0), 'image/png')).toBe(
      'data:image/png;base64,'
    )
  })

  it('handles buffers larger than the encoding chunk size', () => {
    const bytes = new Uint8Array(200_000)
    let seed = 42
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      bytes[i] = seed & 0xff
    }
    const expected = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
    expect(arrayBufferToDataUrl(bytes.buffer, 'image/png')).toBe(expected)
  })
})
