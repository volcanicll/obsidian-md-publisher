import { describe, it, expect } from 'vitest'
import {
  extractLocalImagePaths,
  normalizeImagePath,
  detectImageType,
} from '../src/lib/image-processor'

describe('extractLocalImagePaths', () => {
  it('extracts relative image paths', () => {
    const html = '<img src="images/photo.png"><img src="a.jpg" alt="x">'
    expect(extractLocalImagePaths(html)).toEqual(['images/photo.png', 'a.jpg'])
  })

  it('skips external URLs and data URIs', () => {
    const html =
      '<img src="https://cdn.com/a.png"><img src="http://x.com/b.jpg"><img src="data:image/png;base64,AAAA">'
    expect(extractLocalImagePaths(html)).toEqual([])
  })

  it('extracts app:// Obsidian protocol paths', () => {
    const html = '<img src="app://abc123//vault/images/x.png">'
    expect(extractLocalImagePaths(html)).toEqual(['app://abc123//vault/images/x.png'])
  })

  it('returns empty array for content without images', () => {
    expect(extractLocalImagePaths('<p>no images</p>')).toEqual([])
  })
})

describe('normalizeImagePath', () => {
  it('decodes app:// absolute paths', () => {
    expect(normalizeImagePath('app://hash//vault/img/a%20b.png', null)).toBe(
      '/vault/img/a b.png'
    )
  })

  it('resolves relative paths against the active file directory', () => {
    expect(normalizeImagePath('images/photo.png', 'notes/doc.md')).toBe(
      'notes/images/photo.png'
    )
  })

  it('strips a leading ./', () => {
    expect(normalizeImagePath('./photo.png', null)).toBe('photo.png')
  })

  it('keeps absolute paths untouched', () => {
    expect(normalizeImagePath('/vault/img/a.png', 'notes/doc.md')).toBe(
      '/vault/img/a.png'
    )
  })
})

describe('detectImageType', () => {
  it('detects PNG from magic bytes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(detectImageType(png.buffer)).toBe('image/png')
  })

  it('detects JPEG from magic bytes', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(detectImageType(jpeg.buffer)).toBe('image/jpeg')
  })

  it('detects GIF from magic bytes', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    expect(detectImageType(gif.buffer)).toBe('image/gif')
  })

  it('detects SVG from its text content', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(detectImageType(svg.buffer)).toBe('image/svg+xml')
  })

  it('falls back to png for unknown types', () => {
    const unknown = new Uint8Array([1, 2, 3, 4])
    expect(detectImageType(unknown.buffer)).toBe('image/png')
  })
})
