/**
 * 草稿二维码：把公众号草稿的预览链接编码成二维码。
 *
 * 微信草稿接口（draft/get）会返回一个带临时凭证的 `url`，在手机上打开
 * 就是这篇草稿的真实文章页——版式、字体、封面都是微信自己的渲染结果。
 * 桌面端没法直接模拟这个环境（文章页不允许被 iframe 嵌入），扫码是
 * 把预览搬到真机上最直接的方式。
 */

import qrcode from 'qrcode-generator'

export interface QrOptions {
  /** 每个模块的像素边长 */
  cellSize?: number
  /** 静区宽度（模块数），微信扫码识别建议至少 2 */
  margin?: number
}

/**
 * 生成 SVG 二维码字符串。
 *
 * 用 SVG 而不是 canvas/data URL：矢量在高分屏上始终清晰，也不依赖
 * 画布尺寸与主题配色。二维码保持黑白色，不跟随 Obsidian 深色主题——
 * 反色二维码在部分扫码器上识别率明显下降。
 */
export function createQrSvg(text: string, options: QrOptions = {}): string {
  const { cellSize = 4, margin = 2 } = options

  // 0 表示按内容自动选择版本；'M' 级纠错在容错与密度间平衡，
  // 微信预览链接通常 300–400 字符，M 级足够可靠
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  const size = (count + margin * 2) * cellSize

  let path = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue
      const x = (col + margin) * cellSize
      const y = (row + margin) * cellSize
      path += `M${x} ${y}h${cellSize}v${cellSize}h-${cellSize}z`
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="草稿二维码">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  )
}

/**
 * 草稿预览链接是否可直接用于扫码预览。
 *
 * 微信返回的 url 带 tempkey 临时凭证，有时效性；接口在草稿未同步完成
 * 等情况下也可能返回空串。空值不该渲染成一张扫不出内容的二维码。
 */
export function isPreviewUrlUsable(url: string | undefined | null): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  // 只有域名没有路径的地址不是文章页
  try {
    const parsed = new URL(trimmed)
    return parsed.pathname !== '/' && parsed.pathname.length > 1
  } catch {
    return false
  }
}
