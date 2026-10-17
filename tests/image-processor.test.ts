import { describe, it, expect, afterEach } from 'vitest'
import {
  extractLocalImagePaths,
  extractRemoteImagePaths,
  normalizeImagePath,
  detectImageType,
  replaceImageSrc,
  sanitizeFilename,
  safeDecodeURIComponent,
  isWeChatSupportedImageType,
  findVaultImageFile,
  resolveVaultImageFile,
  resolveLocalImageSrcs,
  inlineImagesAsDataUrls,
  processImages
} from '../src/lib/image-processor'
import { TFile, setRequestUrlMock } from './obsidian-stub'

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

describe('extractRemoteImagePaths', () => {
  it('extracts http(s) image sources', () => {
    const html = '<img src="https://cdn.com/a.png"><img src="http://x.com/b.jpg">'
    expect(extractRemoteImagePaths(html)).toEqual([
      'https://cdn.com/a.png',
      'http://x.com/b.jpg',
    ])
  })

  it('skips relative, app:// and data URIs', () => {
    const html = '<img src="a.png"><img src="app://h/x.png"><img src="data:image/png;base64,AA">'
    expect(extractRemoteImagePaths(html)).toEqual([])
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

  it('collapses ../ segments against the note directory', () => {
    expect(normalizeImagePath('../assets/pic.png', 'notes/sub/doc.md')).toBe(
      'notes/assets/pic.png'
    )
  })

  it('does not escape the vault root', () => {
    expect(normalizeImagePath('../../pic.png', 'notes/doc.md')).toBe('pic.png')
  })

  it('decodes HTML entities in the src', () => {
    expect(normalizeImagePath('assets/a&amp;b.png', null)).toBe('assets/a&b.png')
  })
})

describe('resolveVaultImageFile', () => {
  /** 与 makeApp 相同的 stub，但保留 TFile 引用以便按对象比较 */
  function makeAppWithFiles(files: string[]) {
    const byPath = new Map<string, TFile>()
    for (const path of files) {
      const file = new TFile() as unknown as { path: string; extension: string }
      file.path = path
      file.extension = path.split('.').pop() ?? ''
      byPath.set(path, file as unknown as TFile)
    }
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => byPath.get(path),
        getFiles: () => [...byPath.values()],
      },
    }
    return { app: app as never, byPath }
  }

  it('resolves a note-relative path', () => {
    const { app, byPath } = makeAppWithFiles(['notes/assets/pic.png'])
    expect(resolveVaultImageFile(app, 'assets/pic.png', 'notes/a.md')).toBe(
      byPath.get('notes/assets/pic.png')
    )
  })

  it('resolves a bare wikilink filename stored in another folder', () => {
    const { app, byPath } = makeAppWithFiles(['attachments/Pasted image 1.png'])
    expect(
      resolveVaultImageFile(app, 'Pasted%20image%201.png', 'notes/a.md')
    ).toBe(byPath.get('attachments/Pasted image 1.png'))
  })

  it('resolves a vault-root path from a note in a subfolder', () => {
    const { app, byPath } = makeAppWithFiles(['assets/diagram.png'])
    expect(
      resolveVaultImageFile(app, 'assets/diagram.png', 'notes/a.md')
    ).toBe(byPath.get('assets/diagram.png'))
  })

  it('prefers the note-relative path over the link index', () => {
    const { app, byPath } = makeAppWithFiles(['notes/pic.png', 'other/pic.png'])
    const indexed = byPath.get('other/pic.png')!
    ;(app as unknown as { metadataCache: unknown }).metadataCache = {
      getFirstLinkpathDest: () => indexed,
    }
    expect(resolveVaultImageFile(app, 'pic.png', 'notes/a.md')).toBe(
      byPath.get('notes/pic.png')
    )
  })

  it('falls back to the metadataCache link resolution', () => {
    const { app, byPath } = makeAppWithFiles(['notes/assets/pic.png', 'other/pic.png'])
    const preferred = byPath.get('other/pic.png')!
    ;(app as unknown as { metadataCache: unknown }).metadataCache = {
      getFirstLinkpathDest: () => preferred,
    }
    expect(resolveVaultImageFile(app, 'pic.png', 'notes/a.md')).toBe(preferred)
  })

  it('falls back to path candidates when link resolution throws', () => {
    const { app, byPath } = makeAppWithFiles(['assets/pic.png'])
    ;(app as unknown as { metadataCache: unknown }).metadataCache = {
      getFirstLinkpathDest: () => {
        throw new Error('metadata cache not ready')
      },
    }
    expect(resolveVaultImageFile(app, 'assets/pic.png', 'notes/a.md')).toBe(
      byPath.get('assets/pic.png')
    )
  })

  it('returns null when the image does not exist', () => {
    const { app } = makeAppWithFiles(['notes/a.md'])
    expect(resolveVaultImageFile(app, 'missing.png', 'notes/a.md')).toBeNull()
  })

  it('never resolves to a non-image file', () => {
    const { app } = makeAppWithFiles(['notes/photo.md'])
    expect(resolveVaultImageFile(app, 'photo', 'notes/a.md')).toBeNull()
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

  it('carries the processed bytes back for cover reuse', async () => {
    const app = makeAppWithImages(['a.png'])
    const api = makeApi()

    const { results } = await processImages('<img src="a.png">', app, api as never, null)

    expect(results).toHaveLength(1)
    expect(results[0].filename).toBe('a.png')
    expect(new Uint8Array(results[0].data)).toEqual(new Uint8Array(PNG_BYTES))
    expect(results[0].contentType).toBe('image/png')
  })

  it('uploads a wikilink image stored in the attachment folder', async () => {
    const app = makeAppWithImages(['attachments/Pasted image 1.png'])
    const api = makeApi()

    const { html: out, results, errors } = await processImages(
      '<img src="Pasted%20image%201.png">',
      app,
      api as never,
      'notes/a.md'
    )

    expect(errors).toEqual([])
    expect(results).toHaveLength(1)
    expect(results[0].originalPath).toBe('attachments/Pasted image 1.png')
    expect(out).toContain(api.urls[0])
  })

  it('uploads a vault-root image referenced from a subfolder note', async () => {
    const app = makeAppWithImages(['assets/diagram.png'])
    const api = makeApi()

    const { results, errors } = await processImages(
      '<img src="assets/diagram.png">',
      app,
      api as never,
      'notes/a.md'
    )

    expect(errors).toEqual([])
    expect(results[0].originalPath).toBe('assets/diagram.png')
  })

  it('downloads remote images and re-hosts them on WeChat', async () => {
    setRequestUrlMock(async (param) => {
      expect(param.url).toBe('https://cdn.com/pic.png')
      return { json: {}, arrayBuffer: PNG_BYTES }
    })

    const app = makeAppWithImages([])
    const api = makeApi()

    const { html: out, results, errors } = await processImages(
      '<img src="https://cdn.com/pic.png">',
      app,
      api as never,
      null
    )

    expect(errors).toEqual([])
    expect(api.urls).toHaveLength(1)
    expect(out).toContain(api.urls[0])
    expect(out).not.toContain('cdn.com')
    expect(results[0].originalPath).toBe('https://cdn.com/pic.png')

    setRequestUrlMock(null)
  })

  it('records remote download failures as errors and keeps the src', async () => {
    setRequestUrlMock(async () => {
      throw new Error('network down')
    })

    const app = makeAppWithImages([])
    const api = makeApi()

    const { html: out, results, errors } = await processImages(
      '<img src="https://cdn.com/pic.png">',
      app,
      api as never,
      null
    )

    expect(api.urls).toHaveLength(0)
    expect(results).toEqual([])
    expect(errors[0]).toContain('Failed to download remote image')
    expect(out).toContain('src="https://cdn.com/pic.png"')

    setRequestUrlMock(null)
  })

  afterEach(() => {
    setRequestUrlMock(null)
  })
})

describe('resolveLocalImageSrcs', () => {
  function makeAppWithResourcePath(files: string[]) {
    const base = makeApp(files) as { vault: Record<string, unknown> }
    base.vault.getResourcePath = (file: { path: string }) => `app://hash/${file.path}`
    return base as never
  }

  it('rewrites a wikilink image stored outside the note folder', () => {
    const app = makeAppWithResourcePath(['attachments/pasted.png'])
    const out = resolveLocalImageSrcs(
      '<img src="pasted.png" alt>',
      app,
      'notes/a.md'
    )
    expect(out).toContain('src="app://hash/attachments/pasted.png"')
  })

  it('rewrites a vault-root image referenced from a subfolder note', () => {
    const app = makeAppWithResourcePath(['assets/diagram.png'])
    const out = resolveLocalImageSrcs('<img src="assets/diagram.png">', app, 'notes/a.md')
    expect(out).toContain('src="app://hash/assets/diagram.png"')
  })

  it('leaves unresolvable images untouched', () => {
    const app = makeAppWithResourcePath([])
    const html = '<img src="missing.png">'
    expect(resolveLocalImageSrcs(html, app, 'notes/a.md')).toBe(html)
  })

  it('does not rewrite remote or data URLs', () => {
    const app = makeAppWithResourcePath([])
    const html =
      '<img src="https://cdn.com/a.png"><img src="data:image/png;base64,AAAA">'
    expect(resolveLocalImageSrcs(html, app, 'notes/a.md')).toBe(html)
  })
})

describe('inlineImagesAsDataUrls', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer

  function makeAppWithImages(files: string[]) {
    const base = makeApp(files) as { vault: Record<string, unknown> }
    base.vault.readBinary = () => Promise.resolve(PNG_BYTES)
    return base as never
  }

  it('inlines local images as data URLs', async () => {
    const app = makeAppWithImages(['notes/assets/shot.png'])
    const out = await inlineImagesAsDataUrls(
      '<p>x</p><img src="assets/shot.png">',
      app,
      'notes/a.md'
    )
    expect(out.html).toContain('src="data:image/png;base64,')
    expect(out.html).not.toContain('assets/shot.png')
    expect(out.inlined).toBe(1)
    expect(out.warnings).toEqual([])
  })

  it('resolves relative paths against the note folder', async () => {
    const app = makeAppWithImages(['notes/assets/pic.png'])
    const out = await inlineImagesAsDataUrls('<img src="assets/pic.png">', app, 'notes/a.md')
    expect(out.html).toContain('data:image/png;base64,')
    expect(out.inlined).toBe(1)
  })

  it('inlines a wikilink image that lives outside the note folder', async () => {
    const app = makeAppWithImages(['attachments/Pasted image 1.png'])
    const out = await inlineImagesAsDataUrls(
      '<img src="Pasted%20image%201.png">',
      app,
      'notes/a.md'
    )
    expect(out.inlined).toBe(1)
    expect(out.warnings).toEqual([])
  })

  it('inlines a vault-root image referenced from a subfolder note', async () => {
    const app = makeAppWithImages(['assets/diagram.png'])
    const out = await inlineImagesAsDataUrls('<img src="assets/diagram.png">', app, 'notes/a.md')
    expect(out.inlined).toBe(1)
    expect(out.warnings).toEqual([])
  })

  it('reuses one data URL when the same file is referenced by different srcs', async () => {
    const app = makeAppWithImages(['assets/pic.png'])
    const out = await inlineImagesAsDataUrls(
      '<img src="assets/pic.png"><img src="pic.png">',
      app,
      'notes/a.md'
    )
    expect(out.inlined).toBe(1)
    expect(out.html.match(/data:image\/png;base64,/g)).toHaveLength(2)
  })

  it('inlines remote images by downloading them', async () => {
    setRequestUrlMock(async () => ({ json: '', arrayBuffer: PNG_BYTES }))
    const app = makeAppWithImages([])
    const out = await inlineImagesAsDataUrls(
      '<img src="https://cdn.com/a.png">',
      app,
      null
    )
    expect(out.html).toContain('data:image/png;base64,')
    expect(out.inlined).toBe(1)
  })

  it('reuses one data URL for a repeated image', async () => {
    const app = makeAppWithImages(['a.png'])
    const out = await inlineImagesAsDataUrls(
      '<img src="a.png"><img src="a.png">',
      app,
      null
    )
    expect(out.html.match(/data:image\/png;base64,/g)).toHaveLength(2)
    expect(out.inlined).toBe(1)
  })

  it('keeps the original src and warns when the image is missing', async () => {
    const app = makeAppWithImages([])
    const out = await inlineImagesAsDataUrls('<img src="missing.png">', app, null)
    expect(out.html).toContain('missing.png')
    expect(out.inlined).toBe(0)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('missing.png')
  })

  it('leaves existing data URLs untouched', async () => {
    const app = makeAppWithImages([])
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const out = await inlineImagesAsDataUrls(`<img src="${dataUrl}">`, app, null)
    expect(out.html).toContain(dataUrl)
    expect(out.inlined).toBe(0)
    expect(out.warnings).toEqual([])
  })

  it('reports a failed remote download without blocking the rest', async () => {
    setRequestUrlMock(async () => {
      throw new Error('network down')
    })
    const app = makeAppWithImages(['local.png'])
    const out = await inlineImagesAsDataUrls(
      '<img src="https://bad.com/a.png"><img src="local.png">',
      app,
      null
    )
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('https://bad.com/a.png')
    expect(out.html).toContain('data:image/png;base64,')
    expect(out.inlined).toBe(1)
  })
})

describe('plain-text channel safety', () => {
  it('does not leak inlined base64 into stripped text', async () => {
    const { stripHtmlTags } = await import('../src/lib/wechat/validation')
    const app = (() => {
      const base = makeApp(['a.png']) as { vault: Record<string, unknown> }
      base.vault.readBinary = () =>
        Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)
      return base as never
    })()

    const out = await inlineImagesAsDataUrls('<p>正文</p><img src="a.png">', app, null)
    const text = stripHtmlTags(out.html)

    expect(text).toContain('正文')
    expect(text).not.toContain('base64')
    expect(text).not.toContain('data:image')
    expect(text).not.toContain('<img')
  })
})
