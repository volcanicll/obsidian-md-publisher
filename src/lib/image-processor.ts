import { App, TFile, requestUrl } from 'obsidian'
import { WeChatApi } from './wechat/wechat-api'

export interface ImageProcessorOptions {
  maxWidth: number
  maxHeight: number
  maxSizeKB: number
  quality: number
}

export const DEFAULT_IMAGE_OPTIONS: ImageProcessorOptions = {
  maxWidth: 900,
  maxHeight: 2000,
  maxSizeKB: 1024,
  quality: 0.8,
}

export interface ImageProcessResult {
  originalPath: string
  wechatUrl: string
  /** 清洗后的文件名，供封面复用上传时使用 */
  filename: string
  /** 处理（压缩/转码）后的图片字节，供封面以永久素材形式复用上传 */
  data: ArrayBuffer
  contentType: string
}

export type ProgressCallback = (current: number, total: number, filename: string) => void

export interface CompressedImage {
  data: ArrayBuffer
  contentType: string
}

/** 微信 uploadimg 接口仅支持这三种格式，其余必须先重编码 */
const WECHAT_SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif']

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']

/**
 * Detect the MIME type of an image from its magic bytes.
 * Used to send the correct Content-Type when uploading to WeChat.
 */
export function detectImageType(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data).slice(0, 16)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  const ascii = new TextDecoder().decode(bytes)
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (ascii.startsWith('BM')) {
    return 'image/bmp'
  }
  if (ascii.slice(4, 8) === 'ftyp') {
    return 'image/avif'
  }
  if (ascii.trimStart().startsWith('<svg')) {
    return 'image/svg+xml'
  }
  return 'image/png'
}

/**
 * 微信 uploadimg 仅接受 jpg/png/gif，判断给定 MIME 类型是否可直接上传。
 */
export function isWeChatSupportedImageType(contentType: string): boolean {
  return WECHAT_SUPPORTED_TYPES.includes(contentType)
}

/**
 * 清洗用于 multipart 上传的文件名：
 * 去掉路径部分、引号、反斜杠与控制字符，避免破坏请求体结构。
 */
export function sanitizeFilename(filename: string, fallback = 'image'): string {
  const base = filename.split(/[\\/]/).pop() || ''
  const cleaned = base.replace(/["\r\n\\]/g, '').replace(/\p{Cc}/gu, '').trim()
  return cleaned || fallback
}

/** decodeURIComponent 的安全版本：遇到非法 % 序列时返回原始字符串 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Extract local image paths from HTML content.
 * Matches <img src="..."> where src is a relative path or app:// path.
 */
export function extractLocalImagePaths(html: string): string[] {
  const paths: string[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    // Skip external URLs and data URIs
    if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      continue
    }
    paths.push(src)
  }

  return paths
}

/**
 * Extract remote http(s) image paths from HTML content.
 * 微信对外站图片 CDN 兼容性差，外链图片也需下载后转存到微信 CDN。
 */
export function extractRemoteImagePaths(html: string): string[] {
  const paths: string[] = []
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
      paths.push(src)
    }
  }

  return paths
}

/**
 * Extract base64 data-URL images (e.g. Mermaid 渲染产物)。
 * 返回完整的 data: src 列表，供 processImages 解码上传。
 */
export function extractDataUrlImages(html: string): string[] {
  const paths: string[] = []
  const imgRegex = /<img[^>]+src=["'](data:image\/(?:png|jpeg|gif);base64,[^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(html)) !== null) {
    if (match[1]) paths.push(match[1])
  }

  return paths
}

/** base64 data URL → ArrayBuffer；格式非法返回 null */
export function decodeDataUrl(dataUrl: string): ArrayBuffer | null {
  const m = dataUrl.match(/^data:image\/(?:png|jpeg|gif);base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  try {
    const binary = atob(m[1])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    return null
  }
}

/** 从外链 URL 的路径部分取文件名，供 multipart 上传使用 */
function remoteFilename(src: string): string {
  try {
    const url = new URL(src)
    return url.pathname.split('/').pop() || ''
  } catch {
    return ''
  }
}

/** 属性值中的 HTML 实体还原：路径里的 & 等字符会被 rehype 转义成 &amp; */
function decodeBasicEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * 折叠路径中的 `.` 与 `..` 段。
 * keepParent 为 true 时保留开头无法消解的 `..`（相对路径还要与笔记目录拼接），
 * 为 false 时直接丢弃，避免解析结果逃出 vault 根。
 */
function collapsePathSegments(path: string, keepParent: boolean): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') {
        out.pop()
      } else if (keepParent) {
        out.push('..')
      }
      continue
    }
    out.push(segment)
  }
  return out.join('/')
}

/**
 * 图片 src → 解码后的路径：
 * app:// 取协议后的路径，其余做 HTML 实体与 URL 解码，并折叠 ./ 与 ../
 */
export function decodeImageSrc(src: string): string {
  const appMatch = src.match(/^app:\/\/[^/]+\/(.+)$/)
  const raw = appMatch ? appMatch[1] : src
  const decoded = decodeBasicEntities(safeDecodeURIComponent(raw))
  const collapsed = collapsePathSegments(decoded, true)
  return decoded.startsWith('/') ? `/${collapsed}` : collapsed
}

/** ArrayBuffer + mime → `data:<mime>;base64,…`；分块编码避免大文件爆栈 */
export function arrayBufferToDataUrl(data: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(data)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

export interface InlineImagesResult {
  html: string
  /** 实际内联的图片数（不含原本就是 data URL 的） */
  inlined: number
  /** 内联失败的原因，调用方仅作提示，不阻塞复制 */
  warnings: string[]
}

/**
 * 把 HTML 中的本地图片与外链图片内联为 data URL，供「复制」路径使用。
 *
 * vault 相对路径（assets/a.png）与 app:// 地址粘贴到公众号编辑器后无法解析，
 * 结果是裂图；内联后图片随 HTML 一起进入剪贴板，不依赖本机文件路径。
 * 未做压缩转码：剪贴板不受微信体积限制，且原样内联可保留 GIF 动画。
 * 单张失败不阻塞整体复制：保留原 src 并计入 warnings。
 */
export async function inlineImagesAsDataUrls(
  html: string,
  app: App,
  activeFilePath: string | null
): Promise<InlineImagesResult> {
  const warnings: string[] = []
  const cache = new Map<string, string>()
  let result = html
  let inlined = 0

  for (const src of extractLocalImagePaths(html)) {
    const file = resolveVaultImageFile(app, src, activeFilePath)
    if (!file) {
      warnings.push(`vault 中未找到图片：${src}`)
      continue
    }
    const cached = cache.get(file.path)
    if (cached) {
      result = replaceImageSrc(result, src, cached)
      continue
    }
    const data = await readVaultFile(app, file)
    if (!data) {
      warnings.push(`图片读取失败：${file.path}`)
      continue
    }
    const dataUrl = arrayBufferToDataUrl(data, detectImageType(data))
    cache.set(file.path, dataUrl)
    result = replaceImageSrc(result, src, dataUrl)
    inlined++
  }

  for (const src of extractRemoteImagePaths(html)) {
    const cached = cache.get(src)
    if (cached) {
      result = replaceImageSrc(result, src, cached)
      continue
    }
    const data = await fetchRemoteImage(src)
    if (!data) {
      warnings.push(`外链图片下载失败：${src}`)
      continue
    }
    const dataUrl = arrayBufferToDataUrl(data, detectImageType(data))
    cache.set(src, dataUrl)
    result = replaceImageSrc(result, src, dataUrl)
    inlined++
  }

  return { html: result, inlined, warnings }
}

/** 下载外链图片；失败返回 null（调用方计入 errors） */
async function fetchRemoteImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await requestUrl({ url, method: 'GET' })
    return response.arrayBuffer
  } catch {
    return null
  }
}

/**
 * 将 HTML 中的某个图片 src 替换为微信 URL。
 * 使用替换函数而不是字符串拼接，避免目标 URL 中的 `$` 序列被当作替换模式解释。
 */
export function replaceImageSrc(html: string, rawSrc: string, newUrl: string): string {
  const escapedSrc = rawSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(
    new RegExp(`(src=["'])${escapedSrc}(["'])`, 'g'),
    (_match, prefix: string, suffix: string) => `${prefix}${newUrl}${suffix}`
  )
}

/**
 * Normalize an Obsidian image src to a vault-relative path.
 * Handles formats:
 *   - app://<hash>/<absolute-path>
 *   - Relative paths like "images/photo.png"（按笔记目录解析）
 *   - Wikilink style like "![[](Pasted%20image.png)]"
 *   - 含 `./`、`../` 的相对路径
 */
export function normalizeImagePath(
  src: string,
  activeFilePath: string | null
): string | null {
  const decoded = decodeImageSrc(src)
  if (!decoded) return null
  if (decoded.startsWith('/') || !activeFilePath) return decoded

  const dir = noteDirOf(activeFilePath)
  if (!dir) return collapsePathSegments(decoded, false)
  return collapsePathSegments(`${dir}/${decoded}`, false)
}

function stripExtension(path: string): string {
  return path.replace(/\.[^./]+$/, '')
}

/** 笔记所在目录（'a/b.md' → 'a'，根目录笔记 → ''） */
function noteDirOf(notePath: string | null): string {
  if (!notePath) return ''
  const idx = notePath.lastIndexOf('/')
  return idx === -1 ? '' : notePath.slice(0, idx)
}

/** 仅接受图片扩展名的文件，避免误把同名笔记当图片 */
function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())
}

/**
 * 在 vault 中查找图片文件：支持精确路径、补全扩展名，
 * 以及 wikilink 风格的「仅文件名」模糊匹配（路径后缀或去扩展名比较）。
 * 多个候选时取路径最短者（与 Obsidian 的「最短路径优先」规则一致）。
 */
export function findVaultImageFile(app: App, imagePath: string): TFile | null {
  const target = imagePath.toLowerCase().replace(/^\//, '')

  // 精确路径匹配（含补全扩展名的尝试）
  const candidates = [imagePath, ...IMAGE_EXTENSIONS.map(ext => `${imagePath}.${ext}`)]
  for (const candidate of candidates) {
    const file = app.vault.getAbstractFileByPath(candidate)
    if (file instanceof TFile) return file
  }

  // 仅接受图片扩展名的文件，避免误把同名笔记当图片
  let best: TFile | null = null
  for (const file of app.vault.getFiles()) {
    if (!IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) continue
    const path = file.path.toLowerCase()
    const withoutExt = stripExtension(path)
    const matches =
      path === target ||
      path.endsWith('/' + target) ||
      withoutExt === target ||
      withoutExt.endsWith('/' + target)
    if (matches && (!best || file.path.length < best.path.length)) {
      best = file
    }
  }
  return best
}

/**
 * 图片 src → vault 内文件。
 *
 * 渲染管线把 `![[图片.png]]` 转成 `![](图片.png)` 后不再区分 wiki 嵌入与
 * Markdown 相对链接，而两者的解析规则不同（wiki 嵌入按 vault 内「最短路径」
 * 查找，Markdown 相对链接优先相对笔记目录）。这里按 Obsidian 的规则逐级尝试：
 *
 * 1. 笔记相对路径（notes/a.md + assets/x.png → notes/assets/x.png）：
 *    必须先于链接索引，否则根目录同名图片会被「最短路径」抢走
 * 2. metadataCache 链接解析：与阅读视图一致（`../`、最短路径等语义都由它处理）
 * 3. 原样路径（vault 根相对，命中路径后缀）
 * 4. 仅文件名（vault 内任意位置的「最短路径」兜底，附件目录场景）
 *
 * 全都不中时返回 null，调用方保留原 src 并给出提示。
 */
export function resolveVaultImageFile(
  app: App,
  src: string,
  activeFilePath: string | null
): TFile | null {
  const decoded = decodeImageSrc(src)
  if (!decoded) return null

  const relative = normalizeImagePath(src, activeFilePath)
  if (relative) {
    const direct = findVaultImageFile(app, relative)
    if (direct) return direct
  }

  // 链接解析在 vault 索引未就绪等边缘情况下可能抛错，失败时继续走路径候选
  try {
    const linkDest = app.metadataCache?.getFirstLinkpathDest?.(
      decoded.replace(/^\//, ''),
      activeFilePath ?? ''
    )
    if (linkDest instanceof TFile && isImageFile(linkDest)) {
      return linkDest
    }
  } catch {
    // 忽略，走下面的路径候选
  }

  const seen = new Set<string>()
  const candidates = [relative, decoded, decoded.split('/').pop() ?? '']
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    const file = findVaultImageFile(app, candidate)
    if (file) return file
  }
  return null
}

/** 读取已解析的 vault 图片文件字节；失败返回 null */
async function readVaultFile(app: App, file: TFile): Promise<ArrayBuffer | null> {
  try {
    return await app.vault.readBinary(file)
  } catch {
    return null
  }
}

/**
 * 按 Obsidian 的链接规则解析并读取 vault 内图片；
 * 找不到文件或读取失败返回 null。
 */
export async function readVaultImage(
  app: App,
  src: string,
  activeFilePath: string | null
): Promise<ArrayBuffer | null> {
  const file = resolveVaultImageFile(app, src, activeFilePath)
  if (!file) return null
  return await readVaultFile(app, file)
}

/**
 * Read an image file from the vault and return its ArrayBuffer.
 * 支持精确路径、补全扩展名以及 wikilink 风格的「仅文件名」查找。
 */
export async function readImageFromVault(
  app: App,
  imagePath: string
): Promise<ArrayBuffer | null> {
  const file = findVaultImageFile(app, imagePath)
  if (!file) return null
  return await readVaultFile(app, file)
}

/** Get image dimensions from ArrayBuffer */
function getImageDimensions(
  data: ArrayBuffer
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

/** Load image bytes into an HTMLImageElement, revoking the object URL afterwards */
function loadImageElement(data: ArrayBuffer, mime?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([data], mime ? { type: mime } : undefined)
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve(img)
      // 保留 URL 直到绘制完成后再回收：onload 之后 canvas.drawImg 仍需可解码
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法解码图片，请确认文件为有效图片'))
    }
    img.src = url
  })
}

function drawToCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  fillWhite: boolean
): HTMLCanvasElement {
  const canvas = createEl('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context unavailable')
  }
  if (fillWhite) {
    // JPEG 无透明通道，先铺白底，避免透明区域变成黑色
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToBuffer(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image encoding failed'))
          return
        }
        blob.arrayBuffer().then(resolve).catch(reject)
      },
      type,
      quality
    )
  })
}

/** 按目标尺寸限制等比缩放 */
function fitDimensions(
  width: number,
  height: number,
  options: ImageProcessorOptions
): { width: number; height: number } {
  let w = width
  let h = height
  if (w > options.maxWidth) {
    h = Math.round((h * options.maxWidth) / w)
    w = options.maxWidth
  }
  if (h > options.maxHeight) {
    w = Math.round((w * options.maxHeight) / h)
    h = options.maxHeight
  }
  return { width: w, height: h }
}

/**
 * Compress / re-encode an image to meet WeChat requirements.
 *
 * 规则：
 * - GIF 原样返回（保留动画）
 * - JPEG 源重编码为 JPEG（白底）
 * - PNG 及其他格式优先重编码为 PNG（保留透明通道）
 * - PNG 重编码后仍超过大小限制时，降级为白底 JPEG
 * - 微信不支持的格式（webp/bmp/avif 等）无论大小一律重编码
 */
export async function compressImage(
  imageData: ArrayBuffer,
  options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS
): Promise<CompressedImage> {
  const contentType = detectImageType(imageData)

  if (contentType === 'image/gif') {
    return { data: imageData, contentType }
  }

  const dims = await getImageDimensions(imageData)
  const sizeKB = imageData.byteLength / 1024
  const needsResize = dims.width > options.maxWidth || dims.height > options.maxHeight
  const needsReencode = !isWeChatSupportedImageType(contentType)

  if (!needsReencode && !needsResize && sizeKB <= options.maxSizeKB) {
    return { data: imageData, contentType }
  }

  const img = await loadImageElement(imageData, contentType)
  const target = fitDimensions(
    dims.width || img.naturalWidth,
    dims.height || img.naturalHeight,
    options
  )

  if (contentType === 'image/jpeg') {
    const data = await canvasToBuffer(
      drawToCanvas(img, target.width, target.height, true),
      'image/jpeg',
      options.quality
    )
    return { data, contentType: 'image/jpeg' }
  }

  const pngData = await canvasToBuffer(
    drawToCanvas(img, target.width, target.height, false),
    'image/png'
  )
  if (pngData.byteLength / 1024 <= options.maxSizeKB) {
    return { data: pngData, contentType: 'image/png' }
  }

  const jpegData = await canvasToBuffer(
    drawToCanvas(img, target.width, target.height, true),
    'image/jpeg',
    options.quality
  )
  return { data: jpegData, contentType: 'image/jpeg' }
}

/**
 * Convert an SVG image to PNG via canvas.
 * 微信公众号文章不支持 SVG 内联，需先转为位图。
 */
export async function convertSvgToPng(
  svgData: ArrayBuffer,
  options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS
): Promise<ArrayBuffer> {
  const svgText = new TextDecoder().decode(svgData)
  const img = await loadImageElement(svgData, 'image/svg+xml')

  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height
  if (!width || !height) {
    // SVG 无固有尺寸时，从 viewBox 推导
    const vb = svgText.match(/viewBox=["']([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)["']/)
    if (vb) {
      width = parseFloat(vb[3])
      height = parseFloat(vb[4])
    } else {
      width = 800
      height = 600
    }
  }

  const target = fitDimensions(width, height, options)
  return canvasToBuffer(drawToCanvas(img, target.width, target.height, false), 'image/png')
}

/**
 * 将 HTML 中本地图片的 src 重写为 Obsidian 资源 URL（app://…），
 * 让预览界面直接显示 vault 内图片；发布时仍按原路径读取上传。
 */
export function resolveLocalImageSrcs(
  html: string,
  app: App,
  activeFilePath: string | null
): string {
  let resolved = html
  for (const src of extractLocalImagePaths(html)) {
    const file = resolveVaultImageFile(app, src, activeFilePath)
    if (file) {
      resolved = replaceImageSrc(resolved, src, app.vault.getResourcePath(file))
    }
  }
  return resolved
}

/**
 * 并发上传的图片数。微信对同一账号的接口有频率限制，并发过高容易被限流；
 * 3 路并发足以让十几张图的文章从「逐张等待」变成一次顺畅的进度推进。
 */
const UPLOAD_CONCURRENCY = 3

/** 一张待上传图片：同一文件的多种写法在计划阶段已合并成一个任务 */
interface ImageTask {
  /** 去重键：本地图用真实 vault 路径，外链/data 用原 src */
  normalizedPath: string
  filename: string
  isData: boolean
  isRemote: boolean
  localFile: TFile | null
}

/**
 * Process all images in HTML content:
 * 1. Extract local and remote image paths
 * 2. Read from vault / download from the remote URL
 * 3. Compress if needed (GIF 保留动画，SVG/WebP 等转为微信支持的格式)
 * 4. Upload to WeChat (同一图片只上传一次，复用 URL)
 * 5. Replace URLs in HTML
 *
 * 上传按 UPLOAD_CONCURRENCY 并发执行；结果按图片在正文中的出现顺序返回，
 * 首张图仍对应 results[0]，封面逻辑不受并发影响。
 *
 * 结果中保留处理后的字节（data/contentType/filename），
 * 供发布流程把首图以永久素材形式再上传为封面 thumb_media_id。
 *
 * @returns Processed HTML with WeChat URLs and list of results
 */
/**
 * 微信图片 CDN 域名。这些地址上的图片已经在微信服务器上，
 * 重新上传只会得到一份重复素材，还会拖慢发布。
 */
const WECHAT_CDN_HOSTS = ['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'wx.qlogo.cn']

/** 判断 URL 是否已在微信 CDN 上 */
export function isWeChatCdnImage(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return WECHAT_CDN_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))
  } catch {
    return false
  }
}

export async function processImages(
  html: string,
  app: App,
  api: WeChatApi,
  activeFilePath: string | null,
  options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS,
  onProgress?: ProgressCallback
): Promise<{ html: string; results: ImageProcessResult[]; errors: string[] }> {
  const allPaths = [
    ...extractLocalImagePaths(html),
    ...extractRemoteImagePaths(html),
    ...extractDataUrlImages(html),
  ]

  if (allPaths.length === 0) {
    return { html, results: [], errors: [] }
  }

  const errors: string[] = []

  // 1. 归一化并去重。缓存键用真实路径，同一图片的多种写法
  //    （相对路径 / 仅文件名 / app:// 地址）才能合并成一次上传。
  const tasks = new Map<string, ImageTask>()
  const order: Array<{ raw: string; key: string | null }> = []

  allPaths.forEach((rawPath, index) => {
    const isData = rawPath.startsWith('data:')
    const isRemote = rawPath.startsWith('http://') || rawPath.startsWith('https://')

    // 已经是微信 CDN 地址的图片无需重新上传：拉取草稿后重新发布时，
    // 正文里会保留这些地址，再传一次既慢又白占素材配额
    if (isRemote && isWeChatCdnImage(rawPath)) {
      order.push({ raw: rawPath, key: null })
      return
    }

    const localFile = isData || isRemote
      ? null
      : resolveVaultImageFile(app, rawPath, activeFilePath)
    const normalizedPath = isData
      ? rawPath
      : isRemote
        ? rawPath
        : localFile?.path ?? normalizeImagePath(rawPath, activeFilePath) ?? ''

    if (!normalizedPath) {
      errors.push(`Could not normalize path: ${rawPath}`)
      order.push({ raw: rawPath, key: null })
      return
    }

    order.push({ raw: rawPath, key: normalizedPath })

    const existing = tasks.get(normalizedPath)
    if (existing) return

    const baseName = isData
      ? `embedded-${index + 1}.png`
      : isRemote
        ? remoteFilename(rawPath)
        : normalizedPath.split('/').pop() || ''

    tasks.set(normalizedPath, {
      normalizedPath,
      filename: sanitizeFilename(baseName || 'image.png'),
      isData,
      isRemote,
      localFile,
    })
  })

  const taskList = [...tasks.values()]
  const uploadedUrls = new Map<string, string>()
  const resultsByIndex: Array<ImageProcessResult | null> = new Array(taskList.length).fill(null)

  // 2. 按固定并发数领取任务。cursor 的自增在 await 之前完成，
  //    因此同一任务不会被两个 worker 领取。
  let cursor = 0
  const runTask = async (task: ImageTask, taskIndex: number): Promise<void> => {
    const { normalizedPath, filename } = task

    // Read image from vault / download from the remote URL / decode data URL
    const imageData = task.isData
      ? decodeDataUrl(normalizedPath)
      : task.isRemote
        ? await fetchRemoteImage(normalizedPath)
        : task.localFile
          ? await readVaultFile(app, task.localFile)
          : null
    if (!imageData) {
      errors.push(
        task.isData
          ? `Failed to decode embedded image: ${filename}`
          : task.isRemote
            ? `Failed to download remote image: ${normalizedPath}`
            : `Image not found in vault: ${normalizedPath}`
      )
      return
    }

    // Determine output image
    let processedData = imageData
    let contentType = detectImageType(imageData)

    try {
      if (contentType === 'image/svg+xml') {
        processedData = await convertSvgToPng(imageData, options)
        contentType = 'image/png'
      } else {
        const compressed = await compressImage(imageData, options)
        processedData = compressed.data
        contentType = compressed.contentType
      }
    } catch (err) {
      // 压缩/转码失败不阻塞发布：回退为原始图片继续上传，
      // 仅在控制台记录；真正的上传失败才会进入 errors。
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`Image processing failed for ${filename}, uploading original: ${msg}`)
      processedData = imageData
      contentType = detectImageType(imageData)
    }

    // Upload to WeChat
    try {
      const wechatUrl = await api.uploadImage(processedData, filename, contentType)
      uploadedUrls.set(normalizedPath, wechatUrl)
      resultsByIndex[taskIndex] = {
        originalPath: normalizedPath,
        wechatUrl,
        filename,
        data: processedData,
        contentType,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to upload ${filename}: ${msg}`)
    }
  }

  const worker = async (): Promise<void> => {
    while (cursor < taskList.length) {
      const taskIndex = cursor++
      const task = taskList[taskIndex]
      onProgress?.(taskIndex + 1, taskList.length, task.filename)
      await runTask(task, taskIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, taskList.length) }, worker)
  )

  // 3. 回填 URL。计划阶段的 order 记录了每个原始 src 对应的去重键，
  //    同一文件的多种写法都会指向同一次上传的结果。
  let processedHtml = html
  for (const { raw, key } of order) {
    const url = key ? uploadedUrls.get(key) : undefined
    if (url) {
      processedHtml = replaceImageSrc(processedHtml, raw, url)
    }
  }

  const results = resultsByIndex.filter(
    (item): item is ImageProcessResult => item !== null
  )

  return { html: processedHtml, results, errors }
}

/** 公众号封面比例 2.35:1 */
const COVER_WIDTH = 900
const COVER_HEIGHT = 383

/** 逐字符换行；超出最大行数时在末行截断并加省略号 */
function wrapCoverTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = Array.from(title.trim())
  const lines: string[] = []
  let index = 0

  for (let lineCount = 0; lineCount < maxLines && index < chars.length; lineCount++) {
    let line = ''
    while (index < chars.length && (!line || ctx.measureText(line + chars[index]).width <= maxWidth)) {
      line += chars[index++]
    }
    if (lineCount === maxLines - 1 && index < chars.length) {
      while (line && ctx.measureText(line + '…').width > maxWidth) {
        line = Array.from(line).slice(0, -1).join('')
      }
      line += '…'
    }
    lines.push(line)
  }
  return lines
}

/**
 * 生成默认封面：深色底 + 白色文章标题。
 * 正文没有任何图片时，微信 news 草稿仍必须有封面，
 * 用标题卡片兜底，保证发布链路始终可用。
 */
export async function generateDefaultCover(title: string): Promise<CompressedImage> {
  const canvas = createEl('canvas')
  canvas.width = COVER_WIDTH
  canvas.height = COVER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context unavailable')
  }

  ctx.fillStyle = '#313d4f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#5b8def'
  ctx.fillRect(0, canvas.height - 8, canvas.width, 8)

  ctx.font = 'bold 44px "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'

  const lines = wrapCoverTitle(ctx, title, canvas.width - 160, 3)
  const lineHeight = 64
  const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight)
  })

  const data = await canvasToBuffer(canvas, 'image/jpeg', 0.9)
  return { data, contentType: 'image/jpeg' }
}
