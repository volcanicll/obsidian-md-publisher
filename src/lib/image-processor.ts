import { App, TFile } from 'obsidian'
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
  const cleaned = base.replace(/["\r\n\\]/g, '').replace(/[\x00-\x1f\x7f]/g, '').trim()
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
 *   - Relative paths like "images/photo.png"
 *   - Wikilink style like "![[](Pasted%20image.png)]"
 */
export function normalizeImagePath(
  src: string,
  activeFilePath: string | null
): string | null {
  let path = src

  // Handle app:// protocol (Obsidian desktop)
  const appMatch = path.match(/^app:\/\/[^/]+\/(.+)$/)
  if (appMatch) {
    path = safeDecodeURIComponent(appMatch[1])
    return path
  }

  // URL decode
  path = safeDecodeURIComponent(path)

  // Remove leading ./ if present
  if (path.startsWith('./')) {
    path = path.substring(2)
  }

  // If relative and we have active file, resolve relative to it
  if (!path.startsWith('/') && activeFilePath) {
    const dir = activeFilePath.substring(0, activeFilePath.lastIndexOf('/'))
    if (dir) {
      path = dir + '/' + path
    }
  }

  return path
}

function stripExtension(path: string): string {
  return path.replace(/\.[^./]+$/, '')
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
 * Read an image file from the vault and return its ArrayBuffer.
 * 支持精确路径、补全扩展名以及 wikilink 风格的「仅文件名」查找。
 */
export async function readImageFromVault(
  app: App,
  imagePath: string
): Promise<ArrayBuffer | null> {
  try {
    const file = findVaultImageFile(app, imagePath)
    if (file) {
      return await app.vault.readBinary(file)
    }
    return null
  } catch {
    return null
  }
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
      setTimeout(() => URL.revokeObjectURL(url), 0)
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
  const canvas = document.createElement('canvas')
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
 * Process all local images in HTML content:
 * 1. Extract local image paths
 * 2. Read from vault
 * 3. Compress if needed (GIF 保留动画，SVG/WebP 等转为微信支持的格式)
 * 4. Upload to WeChat (同一图片只上传一次，复用 URL)
 * 5. Replace URLs in HTML
 *
 * @returns Processed HTML with WeChat URLs and list of results
 */
export async function processImages(
  html: string,
  app: App,
  api: WeChatApi,
  activeFilePath: string | null,
  options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS,
  onProgress?: ProgressCallback
): Promise<{ html: string; results: ImageProcessResult[]; errors: string[] }> {
  const localPaths = extractLocalImagePaths(html)

  if (localPaths.length === 0) {
    return { html, results: [], errors: [] }
  }

  const results: ImageProcessResult[] = []
  const errors: string[] = []
  const uploadedUrls = new Map<string, string>()
  let processedHtml = html
  let current = 0

  for (const rawPath of localPaths) {
    current++
    const normalizedPath = normalizeImagePath(rawPath, activeFilePath)

    if (!normalizedPath) {
      errors.push(`Could not normalize path: ${rawPath}`)
      continue
    }

    // 同一图片出现多次时复用已上传的 URL，避免重复上传
    const cachedUrl = uploadedUrls.get(normalizedPath)
    if (cachedUrl) {
      processedHtml = replaceImageSrc(processedHtml, rawPath, cachedUrl)
      continue
    }

    const filename = sanitizeFilename(normalizedPath.split('/').pop() || 'image.png')

    if (onProgress) {
      onProgress(current, localPaths.length, filename)
    }

    // Read image from vault
    const imageData = await readImageFromVault(app, normalizedPath)
    if (!imageData) {
      errors.push(`Image not found in vault: ${normalizedPath}`)
      continue
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
      processedHtml = replaceImageSrc(processedHtml, rawPath, wechatUrl)

      results.push({
        originalPath: normalizedPath,
        wechatUrl,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Failed to upload ${filename}: ${msg}`)
    }
  }

  return { html: processedHtml, results, errors }
}
