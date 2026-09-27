import { describe, it, expect, afterEach } from 'vitest'
import BmMdPlugin from '../src/main'
import { setRequestUrlMock } from './obsidian-stub'

/**
 * 构造最小可用的插件实例并注入设置。
 * 不走 onload()（避免 Obsidian 工作区依赖），只测 createWeChatApi 的凭证选择逻辑。
 */
function makePlugin(settings: Record<string, unknown>): BmMdPlugin {
  const plugin = new BmMdPlugin({} as never, {} as never)
  Object.assign(plugin.settings, settings)
  return plugin
}

afterEach(() => {
  setRequestUrlMock(null)
})

describe('BmMdPlugin.createWeChatApi', () => {
  it('auto mode: fetches with appId/secret when no token is cached, then persists the refreshed token', async () => {
    const saved: unknown[] = []
    const plugin = makePlugin({
      useManualToken: false,
      wechatAppId: 'wx123',
      wechatAppSecret: 'secret',
      wechatAccessToken: '',
      wechatTokenExpireTime: 0,
    })
    plugin.saveData = async (data) => void saved.push(data)

    setRequestUrlMock(async () => ({ json: { access_token: 'T1', expires_in: 7200 } }))

    const api = plugin.createWeChatApi()
    await expect(api.getAccessToken()).resolves.toBe('T1')

    // 刷新后的 token 已回写设置并持久化
    expect(plugin.settings.wechatAccessToken).toBe('T1')
    expect(plugin.settings.wechatTokenExpireTime).toBeGreaterThan(Date.now())
    expect(saved).toHaveLength(1)
    expect((saved[0] as { wechatAccessToken: string }).wechatAccessToken).toBe('T1')
  })

  it('manual mode: uses the pasted access_token and never persists an auto refresh', async () => {
    const saved: unknown[] = []
    const plugin = makePlugin({
      useManualToken: true,
      manualAccessToken: 'MT',
      manualTokenExpireTime: Date.now() + 60 * 60 * 1000,
      wechatAppId: '',
      wechatAppSecret: '',
    })
    plugin.saveData = async (data) => void saved.push(data)

    // 任何网络调用都说明手动模式实现有误
    setRequestUrlMock(async () => {
      throw new Error('手动模式不应发起网络请求')
    })

    const api = plugin.createWeChatApi()
    await expect(api.getAccessToken()).resolves.toBe('MT')
    expect(saved).toEqual([])
  })

  it('manual mode: an expired pasted token is rejected instead of being auto-refreshed', async () => {
    const plugin = makePlugin({
      useManualToken: true,
      manualAccessToken: 'STALE',
      manualTokenExpireTime: Date.now() - 1000,
      wechatAppId: 'wx123',
      wechatAppSecret: 'secret',
    })

    setRequestUrlMock(async () => {
      throw new Error('手动模式不应发起网络请求')
    })

    const api = plugin.createWeChatApi()
    await expect(api.getAccessToken()).rejects.toThrow('手动 token 已过期')
  })
})
