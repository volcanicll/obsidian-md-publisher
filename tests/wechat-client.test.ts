import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WeChatApi } from '../src/lib/wechat/wechat-api'
import { getWeChatErrorMessage } from '../src/lib/wechat/types'
import { setRequestUrlMock, type RequestUrlParamLike } from './obsidian-stub'

// ── requestUrl 网络层 mock 基础设施 ────────────────────────────────────

let calls: RequestUrlParamLike[] = []

type JsonHandler = (param: RequestUrlParamLike) => unknown

/** 记录每次请求并按 handler 返回 JSON 响应 */
function mockJson(handler: JsonHandler): void {
  setRequestUrlMock(async (param) => {
    calls.push(param)
    return { json: handler(param) }
  })
}

/** 一旦被调用即失败，用于断言"没有发起网络请求" */
function forbidNetwork(): void {
  setRequestUrlMock(async () => {
    throw new Error('不应发起网络请求')
  })
}

/** 有效期内缓存 token 的客户端，避免每个用例都先走 token 请求 */
function apiWithCachedToken(overrides: Record<string, unknown> = {}): WeChatApi {
  return new WeChatApi({
    appId: 'wx123',
    appSecret: 'secret',
    accessToken: 'T0',
    tokenExpireTime: Date.now() + 60 * 60 * 1000,
    ...overrides,
  })
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  setRequestUrlMock(null)
})

// ── getAccessToken ─────────────────────────────────────────────────────

describe('WeChatApi.getAccessToken', () => {
  it('auto mode fetches a token, caches it and notifies onTokenRefresh', async () => {
    const refreshed: Array<[string, number]> = []
    const api = new WeChatApi(
      { appId: 'wx123', appSecret: 'secret' },
      { onTokenRefresh: async (token, expireTime) => void refreshed.push([token, expireTime]) }
    )
    mockJson(() => ({ access_token: 'T1', expires_in: 7200 }))

    await expect(api.getAccessToken()).resolves.toBe('T1')

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/token?grant_type=client_credential')
    expect(calls[0].url).toContain('appid=wx123')

    expect(refreshed).toHaveLength(1)
    const [token, expireTime] = refreshed[0]
    expect(token).toBe('T1')
    // 有效期 ≈ 当前时间 + 7200 秒（允许时钟误差）
    expect(expireTime).toBeGreaterThan(Date.now() + 7000 * 1000)
    expect(expireTime).toBeLessThanOrEqual(Date.now() + 7200 * 1000)
  })

  it('reuses a cached token within its validity without any network call', async () => {
    forbidNetwork()
    const api = apiWithCachedToken()
    await expect(api.getAccessToken()).resolves.toBe('T0')
  })

  it('refreshes when the cached token is within the 5-minute expiry buffer', async () => {
    mockJson(() => ({ access_token: 'T2', expires_in: 7200 }))
    const api = apiWithCachedToken({ tokenExpireTime: Date.now() + 60 * 1000 })

    await expect(api.getAccessToken()).resolves.toBe('T2')
    expect(calls).toHaveLength(1)
  })

  it('throws a guidance error when appId/secret are missing', async () => {
    forbidNetwork()
    const api = new WeChatApi({ appId: '', appSecret: '' })
    await expect(api.getAccessToken()).rejects.toThrow('请先配置公众号 AppID 和 AppSecret')
  })

  it('maps token endpoint error codes to friendly messages', async () => {
    mockJson(() => ({ errcode: 40125 }))
    const api = new WeChatApi({ appId: 'wx123', appSecret: 'bad' })
    await expect(api.getAccessToken()).rejects.toThrow('不合法的 AppSecret')
  })

  it('throws when the token response carries no access_token', async () => {
    mockJson(() => ({}))
    const api = new WeChatApi({ appId: 'wx123', appSecret: 'secret' })
    await expect(api.getAccessToken()).rejects.toThrow('获取 access_token 失败')
  })

  it('manual mode returns the pasted token without touching the network', async () => {
    forbidNetwork()
    const api = apiWithCachedToken({ manualMode: true })
    await expect(api.getAccessToken()).resolves.toBe('T0')
  })

  it('manual mode never auto-refreshes an expired token and explains what to do', async () => {
    forbidNetwork()
    const api = apiWithCachedToken({ manualMode: true, tokenExpireTime: Date.now() - 1000 })
    await expect(api.getAccessToken()).rejects.toThrow('手动 token 已过期')
  })
})

// ── addDraft ───────────────────────────────────────────────────────────

describe('WeChatApi.addDraft', () => {
  it('posts the article wrapped in an articles array and returns media_id', async () => {
    mockJson((param) => {
      expect(param.url).toContain('/draft/add?access_token=T0')
      expect(param.method).toBe('POST')
      expect(JSON.parse(param.body as string)).toEqual({
        articles: [{ title: '标题', content: '<p>正文</p>' }],
      })
      return { media_id: 'MEDIA1' }
    })

    const api = apiWithCachedToken()
    const mediaId = await api.addDraft({ title: '标题', content: '<p>正文</p>' })
    expect(mediaId).toBe('MEDIA1')
    expect(calls).toHaveLength(1)
  })

  it('translates WeChat error codes into friendly messages', async () => {
    mockJson(() => ({ errcode: 40001 }))
    const api = apiWithCachedToken()
    await expect(api.addDraft({ title: 't', content: 'c' })).rejects.toThrow(
      'access_token 无效或已过期'
    )
  })

  it('throws when the response has no media_id', async () => {
    mockJson(() => ({}))
    const api = apiWithCachedToken()
    await expect(api.addDraft({ title: 't', content: 'c' })).rejects.toThrow(
      '创建草稿失败：返回数据无效'
    )
  })
})

// ── listDrafts / deleteDraft ───────────────────────────────────────────

describe('WeChatApi.listDrafts', () => {
  it('posts pagination params and returns the list payload', async () => {
    const payload = { total_count: 1, item_count: 1, item: [{ media_id: 'M' }] }
    mockJson((param) => {
      expect(param.url).toContain('/draft/batchget?access_token=T0')
      expect(JSON.parse(param.body as string)).toEqual({ offset: 20, count: 20, no_content: 0 })
      return payload
    })

    const api = apiWithCachedToken()
    await expect(api.listDrafts(20, 20)).resolves.toEqual(payload)
  })

  it('surfaces error codes from the list endpoint', async () => {
    mockJson(() => ({ errcode: 48001 }))
    const api = apiWithCachedToken()
    await expect(api.listDrafts()).rejects.toThrow('api 功能未授权')
  })
})

describe('WeChatApi.deleteDraft', () => {
  it('posts the media_id of the draft to delete', async () => {
    mockJson((param) => {
      expect(param.url).toContain('/draft/delete?access_token=T0')
      expect(JSON.parse(param.body as string)).toEqual({ media_id: 'MEDIA1' })
      return { errcode: 0 }
    })

    const api = apiWithCachedToken()
    await expect(api.deleteDraft('MEDIA1')).resolves.toBeUndefined()
  })

  it('translates delete-specific errors such as a missing draft', async () => {
    mockJson(() => ({ errcode: 87010 }))
    const api = apiWithCachedToken()
    await expect(api.deleteDraft('GONE')).rejects.toThrow('该草稿不存在')
  })
})

// ── uploadImage ────────────────────────────────────────────────────────

describe('WeChatApi.uploadImage', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  it('builds a multipart body with sanitized filename and raw image bytes', async () => {
    mockJson((param) => {
      expect(param.url).toContain('/media/uploadimg?access_token=T0')
      expect(param.method).toBe('POST')

      const boundary = /boundary=(.+)$/.exec(param.headers?.['Content-Type'] ?? '')?.[1]
      expect(boundary).toBeTruthy()

      const body = new Uint8Array(param.body as ArrayBuffer)
      const headerText = new TextDecoder().decode(body.slice(0, 200))
      const expectedHeader =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="media"; filename="b.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`
      const headerBytes = new TextEncoder().encode(expectedHeader)

      // 文件名已清洗（去掉引号），头部字节逐一致
      expect(headerText.startsWith(`--${boundary}`)).toBe(true)
      expect(headerText).toContain('filename="b.png"')
      for (let i = 0; i < headerBytes.length; i++) {
        expect(body[i]).toBe(headerBytes[i])
      }
      // 图片字节原样夹在 multipart 头尾之间
      expect(body.slice(headerBytes.length, headerBytes.length + PNG_BYTES.length)).toEqual(
        PNG_BYTES
      )
      // 以结束边界收尾
      const footer = new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
      expect(body.slice(body.length - footer.length)).toEqual(footer)
      return { url: 'https://mmbiz.qpic.cn/1' }
    })

    const api = apiWithCachedToken()
    const url = await api.uploadImage(PNG_BYTES.buffer, 'a/"b".png', 'image/png')
    expect(url).toBe('https://mmbiz.qpic.cn/1')
  })

  it('surfaces upload errors from WeChat', async () => {
    mockJson(() => ({ errcode: 45009 }))
    const api = apiWithCachedToken()
    await expect(api.uploadImage(PNG_BYTES.buffer, 'a.png')).rejects.toThrow('接口调用超过限制')
  })

  it('throws when the response carries no url', async () => {
    mockJson(() => ({}))
    const api = apiWithCachedToken()
    await expect(api.uploadImage(PNG_BYTES.buffer, 'a.png')).rejects.toThrow(
      '上传图片失败：返回数据无效'
    )
  })
})

// ── uploadCoverImage（永久素材，用于 thumb_media_id）───────────────────

describe('WeChatApi.uploadCoverImage', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  it('posts to material/add_material with an image type field and returns media_id', async () => {
    mockJson((param) => {
      expect(param.url).toContain('/material/add_material?access_token=T0')
      expect(param.method).toBe('POST')

      const boundary = /boundary=(.+)$/.exec(param.headers?.['Content-Type'] ?? '')?.[1]
      expect(boundary).toBeTruthy()

      const bodyText = new TextDecoder().decode(new Uint8Array(param.body as ArrayBuffer))
      // 永久素材接口要求 type=image 普通字段
      expect(bodyText).toContain(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nimage\r\n`)
      expect(bodyText).toContain('filename="cover.png"')
      return { media_id: 'MEDIA_COVER', url: 'https://mmbiz.qpic.cn/cover' }
    })

    const api = apiWithCachedToken()
    const mediaId = await api.uploadCoverImage(PNG_BYTES.buffer, 'cover.png', 'image/png')
    expect(mediaId).toBe('MEDIA_COVER')
  })

  it('translates error codes such as an invalid media id', async () => {
    mockJson(() => ({ errcode: 40007 }))
    const api = apiWithCachedToken()
    await expect(api.uploadCoverImage(PNG_BYTES.buffer, 'c.png')).rejects.toThrow(
      '不合法的媒体文件 ID'
    )
  })

  it('throws when the response carries no media_id', async () => {
    mockJson(() => ({}))
    const api = apiWithCachedToken()
    await expect(api.uploadCoverImage(PNG_BYTES.buffer, 'c.png')).rejects.toThrow(
      '上传封面失败：返回数据无效'
    )
  })
})

// ── isConfigured / 错误码映射 ──────────────────────────────────────────

describe('WeChatApi.isConfigured', () => {
  it('requires both appId and appSecret', () => {
    expect(new WeChatApi({ appId: 'wx', appSecret: 's' }).isConfigured()).toBe(true)
    expect(new WeChatApi({ appId: 'wx', appSecret: '' }).isConfigured()).toBe(false)
  })
})

describe('getWeChatErrorMessage', () => {
  it('returns the known message for a mapped code', () => {
    expect(getWeChatErrorMessage(40164)).toBe('调用接口的IP地址不在白名单中')
  })

  it('falls back to the raw code for unknown errors', () => {
    expect(getWeChatErrorMessage(99999)).toBe('未知错误 (99999)')
  })
})
