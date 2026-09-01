// Obsidian 官方包只有类型声明，运行时无实现。
// vitest 中通过 resolve.alias 将 "obsidian" 指向本文件，使纯函数模块可被导入测试。
export function requestUrl(): never {
  throw new Error('obsidian.requestUrl 在测试环境中不可用')
}
export class App {}
export class TFile {}
export class Notice {}
export class Modal {}
