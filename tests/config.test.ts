import { describe, it, expect } from 'vitest'
import {
  isWeChatConfigured,
  validateWeChatArticleFields,
  WECHAT_LIMITS,
  charLength
} from '../src/lib/wechat/config'

describe('isWeChatConfigured', () => {
  it('requires AppID and AppSecret in auto mode', () => {
    expect(
      isWeChatConfigured({
        useManualToken: false,
        manualAccessToken: '',
        wechatAppId: 'wx123',
        wechatAppSecret: 'secret'
      })
    ).toBe(true)
    expect(
      isWeChatConfigured({
        useManualToken: false,
        manualAccessToken: '',
        wechatAppId: 'wx123',
        wechatAppSecret: ''
      })
    ).toBe(false)
  })

  it('only requires a manual token in manual mode, even without AppID/Secret', () => {
    expect(
      isWeChatConfigured({
        useManualToken: true,
        manualAccessToken: 'token',
        wechatAppId: '',
        wechatAppSecret: ''
      })
    ).toBe(true)
    expect(
      isWeChatConfigured({
        useManualToken: true,
        manualAccessToken: '   ',
        wechatAppId: 'wx123',
        wechatAppSecret: 'secret'
      })
    ).toBe(false)
  })
})

describe('validateWeChatArticleFields', () => {
  it('requires a non-empty title', () => {
    expect(validateWeChatArticleFields({ title: '  ' })).toBe('请输入文章标题')
    expect(validateWeChatArticleFields({ title: '标题' })).toBeNull()
  })

  it('rejects titles over the WeChat limit', () => {
    const long = '标'.repeat(WECHAT_LIMITS.title + 1)
    const err = validateWeChatArticleFields({ title: long })
    expect(err).toContain(`${WECHAT_LIMITS.title} 个字`)
  })

  it('rejects over-limit author and digest with dedicated messages', () => {
    expect(
      validateWeChatArticleFields({
        title: 'ok',
        author: 'a'.repeat(WECHAT_LIMITS.author + 1)
      })
    ).toContain('作者')

    expect(
      validateWeChatArticleFields({
        title: 'ok',
        digest: 'd'.repeat(WECHAT_LIMITS.digest + 1)
      })
    ).toContain('摘要')
  })
})

describe('charLength', () => {
  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(charLength('ab')).toBe(2)
    expect(charLength('😀')).toBe(1)
    expect('😀'.length).toBe(2)
  })
})
