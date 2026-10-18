import { describe, it, expect } from 'vitest'
import {
  applyLeadingTitle,
  availablePath,
  draftLinkForImport,
  draftMetaForFrontmatter,
  ensureLeadingTitle,
  extensionForMime,
  extractImageUrls,
  imageBaseName,
  importDraftToVault,
  isWeChatCdnUrl,
  joinVaultPath,
  noteNameForTitle,
  relativeVaultPath
} from '../src/lib/wechat/draft-import'
import { setRequestUrlMock } from './obsidian-stub'

describe('noteNameForTitle', () => {
  it('keeps Chinese titles as-is', () => {
    expect(noteNameForTitle('手冲咖啡入门指南')).toBe('手冲咖啡入门指南')
  })

  it('replaces characters that are illegal in file names', () => {
    expect(noteNameForTitle('A/B: C? D* E')).toBe('A B C D E')
  })

  it('trims surrounding dots and spaces', () => {
    expect(noteNameForTitle('  ..标题..  ')).toBe('标题')
  })

  it('falls back to a default for empty titles', () => {
    expect(noteNameForTitle('   ')).toBe('公众号草稿')
    expect(noteNameForTitle('///')).toBe('公众号草稿')
  })

  it('caps very long titles', () => {
    const name = noteNameForTitle('长'.repeat(200))
    expect(Array.from(name)).toHaveLength(80)
  })
})

describe('joinVaultPath / relativeVaultPath', () => {
  it('joins folder and name', () => {
    expect(joinVaultPath('notes', 'a.md')).toBe('notes/a.md')
  })

  it('treats an empty folder as vault root', () => {
    expect(joinVaultPath('', 'a.md')).toBe('a.md')
  })

  it('strips leading and trailing slashes from the folder', () => {
    expect(joinVaultPath('/notes/', 'a.md')).toBe('notes/a.md')
  })

  it('returns the bare name when the note sits in the target folder', () => {
    expect(relativeVaultPath('notes/a.md', 'notes/pic.png')).toBe('pic.png')
  })

  it('walks up to a sibling folder', () => {
    expect(relativeVaultPath('notes/sub/a.md', 'notes/pic.png')).toBe('../pic.png')
  })

  it('returns a vault-absolute path when the note is at the root', () => {
    expect(relativeVaultPath('a.md', 'assets/pic.png')).toBe('assets/pic.png')
  })
})

describe('availablePath', () => {
  const app = (existing: string[]) =>
    ({
      vault: {
        getAbstractFileByPath: (path: string) => (existing.includes(path) ? {} : null),
      },
    }) as never

  it('returns the plain path when free', () => {
    expect(availablePath(app([]), 'notes', '标题', 'md')).toBe('notes/标题.md')
  })

  it('appends a counter when the name is taken', () => {
    expect(availablePath(app(['notes/标题.md']), 'notes', '标题', 'md')).toBe('notes/标题 2.md')
  })

  it('keeps counting until a free slot is found', () => {
    const taken = ['notes/标题.md', 'notes/标题 2.md', 'notes/标题 3.md']
    expect(availablePath(app(taken), 'notes', '标题', 'md')).toBe('notes/标题 4.md')
  })
})

describe('imageBaseName / extensionForMime', () => {
  it('reads a readable name from the URL path', () => {
    expect(imageBaseName('https://cdn.example.com/img/cover-photo.png')).toBe('cover-photo')
  })

  it('returns empty for WeChat numeric path segments', () => {
    expect(imageBaseName('https://mmbiz.qpic.cn/mmbiz_png/0')).toBe('')
  })

  it('returns empty for invalid URLs', () => {
    expect(imageBaseName('not a url')).toBe('')
  })

  it('maps mime types to extensions', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/gif')).toBe('gif')
    expect(extensionForMime('image/webp')).toBe('webp')
    expect(extensionForMime('image/unknown')).toBe('png')
  })
})

describe('isWeChatCdnUrl', () => {
  it('recognizes WeChat image hosts', () => {
    expect(isWeChatCdnUrl('https://mmbiz.qpic.cn/mmbiz_png/abc/0')).toBe(true)
    expect(isWeChatCdnUrl('https://mmbiz.qlogo.cn/x.png')).toBe(true)
    expect(isWeChatCdnUrl('http://wx.qlogo.cn/x.png')).toBe(true)
  })

  it('does not match lookalike hosts', () => {
    expect(isWeChatCdnUrl('https://evil-mmbiz.qpic.cn.attacker.com/x.png')).toBe(false)
    expect(isWeChatCdnUrl('https://example.com/x.png')).toBe(false)
  })

  it('returns false for malformed URLs', () => {
    expect(isWeChatCdnUrl('not-a-url')).toBe(false)
  })
})

describe('ensureLeadingTitle', () => {
  it('prepends an H1 when the body has none', () => {
    expect(ensureLeadingTitle('正文内容', '标题')).toBe('# 标题\n\n正文内容')
  })

  it('does not duplicate an identical H1', () => {
    expect(ensureLeadingTitle('# 标题\n\n正文', '标题')).toBe('# 标题\n\n正文')
  })

  it('keeps an existing different H1', () => {
    expect(ensureLeadingTitle('# 正文自带标题\n\n正文', '草稿标题')).toBe(
      '# 正文自带标题\n\n正文'
    )
  })

  it('does nothing when the title is empty', () => {
    expect(ensureLeadingTitle('正文', '')).toBe('正文')
  })
})

describe('draftMetaForFrontmatter', () => {
  it('maps draft fields to frontmatter', () => {
    const meta = draftMetaForFrontmatter(
      {
        title: '标题',
        author: '作者',
        digest: '摘要',
        content: '',
        content_source_url: 'https://a.com',
        thumb_media_id: 'T1',
      },
      'M1',
      { coverPath: 'assets/cover.png', coverKey: 'file:assets/cover.png', pulledAt: 42 }
    )

    expect(meta).toEqual({
      media_id: 'M1',
      title: '标题',
      author: '作者',
      digest: '摘要',
      content_source_url: 'https://a.com',
      thumb_media_id: 'T1',
      cover_key: 'file:assets/cover.png',
      cover: 'assets/cover.png',
      pulled_at: 42,
    })
  })

  it('omits fields the draft does not carry', () => {
    const meta = draftMetaForFrontmatter({ title: '标题', content: '' }, 'M1')
    expect(meta.author).toBeUndefined()
    expect(meta.thumb_media_id).toBeUndefined()
    expect(meta.media_id).toBe('M1')
  })
})

describe('draftLinkForImport', () => {
  it('builds a draft link with cover cache fields', () => {
    const link = draftLinkForImport(
      'M1',
      { title: '标题', content: '', thumb_media_id: 'T1' },
      { coverKey: 'file:cover.png' }
    )
    expect(link.mediaId).toBe('M1')
    expect(link.title).toBe('标题')
    expect(link.thumbMediaId).toBe('T1')
    expect(link.coverKey).toBe('file:cover.png')
    expect(link.updatedAt).toBeGreaterThan(0)
  })

  it('omits cover cache fields when unknown', () => {
    const link = draftLinkForImport('M1', { title: '标题', content: '' })
    expect(link.thumbMediaId).toBeUndefined()
    expect(link.coverKey).toBeUndefined()
  })
})

describe('importDraftToVault', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer

  /** 内存版 vault：只实现拉取链路用到的方法 */
  function makeVault() {
    const files = new Map<string, string>()
    const binaries = new Map<string, ArrayBuffer>()
    const folders = new Set<string>()

    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => {
          if (files.has(path)) return { path, extension: path.split('.').pop() }
          if (binaries.has(path)) return { path, extension: path.split('.').pop() }
          if (folders.has(path)) return { path }
          return null
        },
        createFolder: async (path: string) => {
          folders.add(path)
        },
        createBinary: async (path: string, data: ArrayBuffer) => {
          binaries.set(path, data)
          return { path }
        },
        create: async (path: string, content: string) => {
          files.set(path, content)
          return { path }
        },
        modify: async (file: { path: string }, content: string) => {
          files.set(file.path, content)
        },
      },
      fileManager: {
        getAvailablePathForAttachment: async (name: string) => `attachments/${name}`,
      },
    }

    return { app, files, binaries, folders }
  }

  it('downloads images, converts the body and writes frontmatter', async () => {
    const { app, files, binaries } = makeVault()
    setRequestUrlMock(async (param) => {
      if (param.url.includes('cover')) {
        return { json: {}, arrayBuffer: PNG_BYTES }
      }
      return { json: {}, arrayBuffer: PNG_BYTES }
    })

    const item = {
      title: '草稿标题',
      content:
        '<section><h2>小节</h2><p>正文<strong>加粗</strong></p>' +
        '<p><img src="https://mmbiz.qpic.cn/pic/0"></p></section>',
      author: '作者',
      digest: '摘要',
      thumb_url: 'https://mmbiz.qpic.cn/cover/0',
      thumb_media_id: 'T1',
    }

    const result = await importDraftToVault(app as never, 'M1', item)

    expect(result.created).toBe(true)
    expect(result.notePath).toBe('草稿标题.md')
    expect(result.downloadedImages).toBe(1)
    expect(result.failedImages).toEqual([])
    expect(result.coverPath).toBe('attachments/wechat-cover-草稿标题.png')

    const markdown = files.get('草稿标题.md') ?? ''
    expect(markdown).toContain('media_id: M1')
    expect(markdown).toContain('author: 作者')
    expect(markdown).toContain('thumb_media_id: T1')
    expect(markdown).toContain('# 草稿标题')
    expect(markdown).toContain('## 小节')
    expect(markdown).toContain('正文**加粗**')
    // 图片改写成相对笔记的本地路径，不再指向微信 CDN
    expect(markdown).toContain('![](attachments/wechat-image-01.png)')
    expect(markdown).not.toContain('mmbiz.qpic.cn/pic')

    expect(binaries.has('attachments/wechat-image-01.png')).toBe(true)
    expect(binaries.has('attachments/wechat-cover-草稿标题.png')).toBe(true)

    setRequestUrlMock(null)
  })

  it('keeps the original URL when an image cannot be downloaded', async () => {
    const { app, files } = makeVault()
    setRequestUrlMock(async () => {
      throw new Error('network down')
    })

    const item = {
      title: '断网草稿',
      content: '<p><img src="https://mmbiz.qpic.cn/pic/0"></p>',
    }

    const result = await importDraftToVault(app as never, 'M2', item)

    expect(result.downloadedImages).toBe(0)
    expect(result.failedImages).toEqual(['https://mmbiz.qpic.cn/pic/0'])
    const markdown = files.get('断网草稿.md') ?? ''
    expect(markdown).toContain('https://mmbiz.qpic.cn/pic/0')

    setRequestUrlMock(null)
  })

  it('overwrites an existing note and keeps its path', async () => {
    const { app, files } = makeVault()
    files.set('notes/旧笔记.md', '旧内容')
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const target = { path: 'notes/旧笔记.md', extension: 'md' }
    const result = await importDraftToVault(
      app as never,
      'M3',
      { title: '新标题', content: '<p>新正文</p>' },
      { targetFile: target as never }
    )

    expect(result.created).toBe(false)
    expect(result.notePath).toBe('notes/旧笔记.md')
    const markdown = files.get('notes/旧笔记.md') ?? ''
    expect(markdown).toContain('新正文')
    expect(markdown).toContain('media_id: M3')
    expect(markdown).not.toContain('旧内容')

    setRequestUrlMock(null)
  })

  it('saves new notes into the configured folder', async () => {
    const { app, files, folders } = makeVault()
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const result = await importDraftToVault(
      app as never,
      'M4',
      { title: '归档文章', content: '<p>正文</p>' },
      { noteFolder: '公众号/草稿' }
    )

    expect(result.notePath).toBe('公众号/草稿/归档文章.md')
    expect(folders.has('公众号')).toBe(true)
    expect(folders.has('公众号/草稿')).toBe(true)
    expect(files.has('公众号/草稿/归档文章.md')).toBe(true)

    setRequestUrlMock(null)
  })

  it('reports progress while pulling', async () => {
    const { app } = makeVault()
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const messages: string[] = []
    await importDraftToVault(
      app as never,
      'M5',
      { title: '进度', content: '<p><img src="https://mmbiz.qpic.cn/pic/0"></p>' },
      { onProgress: (message) => messages.push(message) }
    )

    expect(messages.length).toBeGreaterThan(0)
    expect(messages.some((m) => m.includes('下载'))).toBe(true)
    expect(messages.some((m) => m.includes('还原'))).toBe(true)

    setRequestUrlMock(null)
  })
})

describe('importDraftToVault: 指定目录', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer

  function makeVault() {
    const files = new Map<string, string>()
    const folders = new Set<string>()
    const createdFolders: string[] = []

    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => {
          if (files.has(path)) return { path, extension: path.split('.').pop() }
          if (folders.has(path)) return { path }
          return null
        },
        createFolder: async (path: string) => {
          folders.add(path)
          createdFolders.push(path)
        },
        createBinary: async (path: string) => ({ path }),
        create: async (path: string, content: string) => {
          files.set(path, content)
          return { path }
        },
        modify: async (file: { path: string }, content: string) => {
          files.set(file.path, content)
        },
      },
      fileManager: {
        getAvailablePathForAttachment: async (name: string) => `attachments/${name}`,
      },
    }

    return { app, files, createdFolders }
  }

  it('creates the full nested folder chain for a deep target path', async () => {
    const { app, files, createdFolders } = makeVault()
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const result = await importDraftToVault(
      app as never,
      'M10',
      { title: '深目录', content: '<p>正文</p>' },
      { noteFolder: '公众号/草稿/归档' }
    )

    expect(result.notePath).toBe('公众号/草稿/归档/深目录.md')
    // Obsidian 的 createFolder 不建父目录，必须逐级创建
    expect(createdFolders).toEqual(['公众号', '公众号/草稿', '公众号/草稿/归档'])
    expect(files.has('公众号/草稿/归档/深目录.md')).toBe(true)

    setRequestUrlMock(null)
  })

  it('skips folders that already exist', async () => {
    const { app, createdFolders } = makeVault()
    app.vault.getAbstractFileByPath = (path: string) =>
      path === '公众号' ? { path } : null
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    await importDraftToVault(
      app as never,
      'M11',
      { title: '复用目录', content: '<p>正文</p>' },
      { noteFolder: '公众号/新目录' }
    )

    expect(createdFolders).toEqual(['公众号/新目录'])

    setRequestUrlMock(null)
  })

  it('normalizes slashes and whitespace in the chosen folder', async () => {
    const { app } = makeVault()
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const result = await importDraftToVault(
      app as never,
      'M12',
      { title: '规范化', content: '<p>正文</p>' },
      { noteFolder: '  /公众号/草稿/  ' }
    )

    expect(result.notePath).toBe('公众号/草稿/规范化.md')

    setRequestUrlMock(null)
  })

  it('puts the note at the vault root when no folder is given', async () => {
    const { app } = makeVault()
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const result = await importDraftToVault(
      app as never,
      'M13',
      { title: '根目录', content: '<p>正文</p>' },
      { noteFolder: '' }
    )

    expect(result.notePath).toBe('根目录.md')

    setRequestUrlMock(null)
  })

  it('appends a counter instead of overwriting a same-named note in that folder', async () => {
    const { app, files } = makeVault()
    files.set('公众号/同名.md', '已有内容')
    setRequestUrlMock(async () => ({ json: {}, arrayBuffer: PNG_BYTES }))

    const result = await importDraftToVault(
      app as never,
      'M14',
      { title: '同名', content: '<p>新正文</p>' },
      { noteFolder: '公众号' }
    )

    expect(result.notePath).toBe('公众号/同名 2.md')
    expect(files.get('公众号/同名.md')).toBe('已有内容')

    setRequestUrlMock(null)
  })
})

describe('extractImageUrls', () => {
  it('reads lazy-loaded data-src addresses', () => {
    // 公众号草稿的图片几乎都是懒加载写法，只扫 src 会一张都下载不到
    const html =
      '<section><img class="rich_pages" data-src="https://mmbiz.qpic.cn/a.jpg" data-type="png"></section>' +
      '<section><img src="https://mmbiz.qpic.cn/b.jpg"></section>'
    expect(extractImageUrls(html)).toEqual([
      'https://mmbiz.qpic.cn/a.jpg',
      'https://mmbiz.qpic.cn/b.jpg'
    ])
  })

  it('does not return the same image twice', () => {
    const html = '<img data-src="https://mmbiz.qpic.cn/a.jpg">'
    expect(extractImageUrls(html)).toEqual(['https://mmbiz.qpic.cn/a.jpg'])
  })

  it('skips data URIs and relative paths', () => {
    const html =
      '<img src="data:image/gif;base64,R0lGOD">' +
      '<img src="local.png">' +
      '<img data-src="https://cdn.example.com/x.png">'
    expect(extractImageUrls(html)).toEqual(['https://cdn.example.com/x.png'])
  })

  it('returns an empty array for content without images', () => {
    expect(extractImageUrls('<p>没有图片</p>')).toEqual([])
  })
})

describe('extractImageUrls: HTML 实体', () => {
  it('decodes &amp; so URLs match what the HTML parser yields', () => {
    // 草稿源码是 &amp;，解析后是 &；不解码会导致下载成功但无法回填正文
    const html =
      '<img data-src="https://mmbiz.qpic.cn/a.jpg?wx_fmt=jpeg&amp;from=appmsg">'
    expect(extractImageUrls(html)).toEqual([
      'https://mmbiz.qpic.cn/a.jpg?wx_fmt=jpeg&from=appmsg'
    ])
  })

  it('decodes other common entities', () => {
    const html = '<img src="https://example.com/a.png?x=1&amp;y=2&quot;z&quot;">'
    expect(extractImageUrls(html)[0]).toContain('x=1&y=2"z"')
  })
})

describe('applyLeadingTitle', () => {
  it('marks titleInBody=false when we add the H1 ourselves', () => {
    const out = applyLeadingTitle('正文内容', '文章标题')
    expect(out.markdown).toBe('# 文章标题\n\n正文内容')
    expect(out.titleInBody).toBe(false)
  })

  it('marks titleInBody=false when the body H1 equals the draft title', () => {
    const out = applyLeadingTitle('# 文章标题\n\n正文', '文章标题')
    expect(out.markdown).toBe('# 文章标题\n\n正文')
    expect(out.titleInBody).toBe(false)
  })

  it('marks titleInBody=true when the body carries a different H1', () => {
    // 公众号常见：标题在独立字段里，正文另有一个引言性质的 H1
    const out = applyLeadingTitle('# 一个简单易懂的入门方式\n\n正文', '放弃你的新年计划吧')
    expect(out.markdown).toBe('# 一个简单易懂的入门方式\n\n正文')
    expect(out.titleInBody).toBe(true)
  })

  it('does not add a title when the draft has none', () => {
    expect(applyLeadingTitle('正文', '')).toEqual({ markdown: '正文', titleInBody: false })
  })
})
