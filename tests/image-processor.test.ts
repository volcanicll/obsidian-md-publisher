import { describe, it, expect } from 'vitest'
import {
  extractLocalImagePaths,
  normalizeImagePath,
  detectImageType,
  replaceImageSrc,
  sanitizeFilename,
  safeDecodeURIComponent,
  isWeChatSupportedImageType,
  findVaultImageFile,
  processImages
} from '../src/lib/image-processor'
import { TFile } from 'obsidian'

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

  it('detects BMP and AVIF so they get re-encoded before upload', () => {
    const bmp = new TextEncoder().encode('BM\x00\x00\x00\x00')
    expect(detectImageType(bmp.buffer)).toBe('image/bmp')
    const avif = new TextEncoder().encode('\x00\x00\x00\x20ftypavif\x00\x00')
    expect(detectImageType(avif.buffer)).toBe('image/avif')
  })
})

describe('isWeChatSupportedImageType', () => {
  it('accepts jpg, png and gif', () => {
    expect(isWeChatSupportedImageType('image/jpeg')).toBe(true)
    expect(isWeChatSupportedImageType('image/png')).toBe(true)
    expect(isWeChatSupportedImageType('image/gif')).toBe(true)
  })

  it('rejects formats WeChat cannot upload', () => {
    expect(isWeChatSupportedImageType('image/webp')).toBe(false)
    expect(isWeChatSupportedImageType('image/bmp')).toBe(false)
    expect(isWeChatSupportedImageType('image/avif')).toBe(false)
    expect(isWeChatSupportedImageType('image/svg+xml')).toBe(false)
  })
})

describe('replaceImageSrc', () => {
  it('replaces all occurrences with both quote styles', () => {
    const html = '<img src="a.png"><img alt="x" src="a.png">'
    const out = replaceImageSrc(html, 'a.png', 'https://mmbiz.qpic.cn/abc')
    expect(out).not.toContain('a.png')
    expect((out.match(/mmbiz\.qpic\.cn\/abc/g) || []).length).toBe(2)
  })

  it('treats `$` sequences in the URL literally', () => {
    const out = replaceImageSrc('<img src="a.png">', 'a.png', 'https://x/u?$&1')
    expect(out).toContain('https://x/u?$&1')
    expect(out).not.toContain('undefined')
  })

  it('escapes regex metacharacters in the source path', () => {
    const html = '<img src="a+b(1).png">'
    expect(replaceImageSrc(html, 'a+b(1).png', 'https://x/y.png')).toContain(
      'src="https://x/y.png"'
    )
  })
})

describe('sanitizeFilename', () => {
  it('strips directories, quotes, backslashes and control characters', () => {
    expect(sanitizeFilename('a/b/"name".png')).toBe('name.png')
    expect(sanitizeFilename('C:\\Users\\pic.png')).toBe('pic.png')
    expect(sanitizeFilename('bad\r\nname.png')).toBe('badname.png')
  })

  it('falls back when the result is empty', () => {
    expect(sanitizeFilename('')).toBe('image')
    expect(sanitizeFilename('"')).toBe('image')
  })
})

describe('safeDecodeURIComponent', () => {
  it('decodes valid sequences', () => {
    expect(safeDecodeURIComponent('Pasted%20image.png')).toBe('Pasted image.png')
  })

  it('returns the raw value for malformed sequences instead of throwing', () => {
    expect(safeDecodeURIComponent('100%.png')).toBe('100%.png')
  })
})

/** 构造最小可用的 Obsidian App stub（vault.getAbstractFileByPath / getFiles） */
function makeApp(files: string[]) {
  const byPath = new Map<string, unknown>()
  for (const p of files) {
    const f = new TFile()
    const file = f as unknown as { path: string; extension: string }
    file.path = p
    file.extension = p.includes('.') ? p.split('.').pop()! : ''
    byPath.set(p, f)
  }
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => byPath.get(p),
      getFiles: () => [...byPath.values()],
    },
  }
  return app as never
}

describe('normalizeImagePath', () => {
  it('does not throw on malformed percent sequences', () => {
    expect(normalizeImagePath('100%.png', null)).toBe('100%.png')
  })
})

describe('findVaultImageFile', () => {
  it('finds files by exact path', () => {
    const app = makeApp(['images/photo.png'])
    expect((findVaultImageFile(app, 'images/photo.png') as { path: string }).path).toBe(
      'images/photo.png'
    )
  })

  it('finds wikilink-style bare filenames without a folder', () => {
    const app = makeApp(['assets/deep/Pasted image.png'])
    expect(
      (findVaultImageFile(app, 'Pasted image.png') as { path: string }).path
    ).toBe('assets/deep/Pasted image.png')
  })

  it('completes missing extensions', () => {
    const app = makeApp(['images/photo.png'])
    expect((findVaultImageFile(app, 'images/photo') as { path: string }).path).toBe(
      'images/photo.png'
    )
  })

  it('never returns non-image files', () => {
    const app = makeApp(['notes/photo.md'])
    expect(findVaultImageFile(app, 'photo')).toBeNull()
  })

  it('prefers the shortest path when names are ambiguous', () => {
    const app = makeApp(['a/very/deep/photo.png', 'b/photo.png'])
    expect((findVaultImageFile(app, 'photo.png') as { path: string }).path).toBe('b/photo.png')
  })
})

describe('processImages', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer

  function makeAppWithImages(files: string[]) {
    const base = makeApp(files) as {
      vault: Record<string, unknown>
    }
    base.vault.readBinary = () => Promise.resolve(PNG_BYTES)
    return base as never
  }

  function makeApi() {
    let counter = 0
    const urls: string[] = []
    return {
      uploadImage: async (_data: ArrayBuffer, filename: string) => {
        const url = `https://mmbiz.qpic.cn/${counter++}-${encodeURIComponent(filename)}`
        urls.push(url)
        return url
      },
      urls,
    }
  }

  it('uploads each distinct image once and reuses the URL for duplicates', async () => {
    const app = makeAppWithImages(['a.png', 'b.png'])
    const api = makeApi()
    const html = '<img src="a.png"><img src="a.png"><img src="b.png">'

    const { html: out, results, errors } = await processImages(html, app, api as never, null)

    expect(api.urls.length).toBe(2)
    expect(results.length).toBe(2)
    expect(errors).toEqual([])
    expect(out).not.toContain('src="a.png"')
    expect(out).not.toContain('src="b.png"')
    // 两处 a.png 替换为同一个 URL
    const firstUrl = results[0].wechatUrl
    expect((out.match(new RegExp(firstUrl, 'g')) || []).length).toBe(2)
  })

  it('reports missing images and leaves their src untouched', async () => {
    const app = makeAppWithImages([])
    const api = makeApi()

    const { html: out, results, errors } = await processImages(
      '<img src="missing.png">',
      app,
      api as never,
      null
    )

    expect(api.urls.length).toBe(0)
    expect(results).toEqual([])
    expect(errors.length).toBe(1)
    expect(out).toContain('src="missing.png"')
  })
})
