// Obsidian 官方包只有类型声明，运行时无实现。
// vitest 中通过 resolve.alias 将 "obsidian" 指向本文件，使纯函数模块可被导入测试。

export interface RequestUrlParamLike {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

type RequestUrlMock = (param: RequestUrlParamLike) => Promise<{
  json: unknown
  arrayBuffer?: ArrayBuffer
}>

let requestUrlMock: RequestUrlMock | null = null

/** 注入 requestUrl 网络层 mock；传 null 恢复默认的"不可用"行为 */
export function setRequestUrlMock(mock: RequestUrlMock | null): void {
  requestUrlMock = mock
}

export async function requestUrl(param: RequestUrlParamLike): Promise<{
  json: unknown
  arrayBuffer?: ArrayBuffer
}> {
  if (!requestUrlMock) {
    throw new Error('obsidian.requestUrl 在测试环境中不可用')
  }
  return requestUrlMock(param)
}

export class App {}
export class TFile {}
export class Notice {}
export class Modal {}
export class Setting {}
export class Menu {}
export class MarkdownView {}
export class WorkspaceLeaf {}

/** 仅供 main.ts / SettingsTab / PreviewView 在测试中被导入并实例化，方法按需补充 */
export class Plugin {
  app: unknown
  loadData = async (): Promise<unknown> => null
  saveData = async (_data: unknown): Promise<void> => {}
  constructor(app?: unknown, _manifest?: unknown) {
    this.app = app
  }
}

export class PluginSettingTab {}

export function setIcon(_parent: HTMLElement | string, _iconId: string): void {}

export class ItemView {
  leaf: unknown
  constructor(leaf?: unknown) {
    this.leaf = leaf
  }
}
