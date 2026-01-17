import type { Plugin } from 'unified'

export type Platform = 'wechat' | 'zhihu' | 'toutiao' | 'xiaohongshu' | 'html'

export interface PlatformAdapter {
  id: Platform
  name: string
  plugins: Plugin[]
}

export const platforms: Platform[] = ['wechat', 'zhihu', 'toutiao', 'xiaohongshu', 'html']

// Platform-specific adapters
export const wechatAdapter: PlatformAdapter = {
  id: 'wechat',
  name: '微信公众号',
  plugins: [],
}

export const zhihuAdapter: PlatformAdapter = {
  id: 'zhihu',
  name: '知乎',
  plugins: [],
}

export const toutiaoAdapter: PlatformAdapter = {
  id: 'toutiao',
  name: '头条',
  plugins: [],
}

export const xiaohongshuAdapter: PlatformAdapter = {
  id: 'xiaohongshu',
  name: '小红书',
  plugins: [],
}

export const htmlAdapter: PlatformAdapter = {
  id: 'html',
  name: 'HTML',
  plugins: [],
}

const adapters: Record<Platform, PlatformAdapter> = {
  wechat: wechatAdapter,
  zhihu: zhihuAdapter,
  toutiao: toutiaoAdapter,
  xiaohongshu: xiaohongshuAdapter,
  html: htmlAdapter,
}

export function getAdapter(platform: Platform): PlatformAdapter {
  return adapters[platform] || htmlAdapter
}

export function getAdapterPlugins(platform: Platform): Plugin[] {
  return getAdapter(platform).plugins
}
