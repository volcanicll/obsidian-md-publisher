import { App, requestUrl } from 'obsidian'
import { detectImageType, findVaultImageFile, normalizeImagePath } from './image-processor'

/**
 * 导出为图片：把 render() 产出的全内联样式 HTML 截成 PNG 长图。
 *
 * 纯函数（文件名去重 / 路径解析 / 缩放降级 / data URL 编码）与 DOM 截图流程
 * 分离，前者可在 node 测试环境单测；后者只在 Obsidian 运行时被调用。
 */

/** 长图 canvas 的保守高度上限：Chromium 单维像素上限之下取整 */
export const MAX_CANVAS_HEIGHT = 32767

// ---- 纯函数 ---------------------------------------------------------------

/**
 * 文件名去重：base 不含扩展名；与 existing（同目录已有文件名集合）冲突时
 * 依次尝试 `<base>-1.png`、`<base>-2.png`……返回完整文件名。
 * base 中的路径分隔符与控制字符会被清洗。
 */
export function pickUniqueFileName(base: string, existing: Iterable<string>): string {
  const cleaned = base.replace(/[\\/]/g, '-').replace(/\p{Cc}/gu, '').trim() || 'export'
  const taken = new Set(Array.from(existing, (name) => name.toLowerCase()))
  if (!taken.has(`${cleaned}.png`.toLowerCase())) {
    return `${cleaned}.png`
  }
  for (let i = 1; ; i++) {
    const candidate = `${cleaned}-${i}.png`
    if (!taken.has(candidate.toLowerCase())) {
      return candidate
    }
  }
}

/** 规范化用户填写的导出文件夹：反斜杠转 /、去首尾斜杠、折叠连续斜杠；空或 '.' 归一为 vault 根 */
function normalizeFolderSetting(raw: string): string {
  const cleaned = raw.trim().replace(/\\/g, '/')
  if (!cleaned || cleaned === '.') return ''
  return cleaned.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')
}

/** 笔记所在目录（'a/b.md' → 'a'，根目录笔记 → ''） */
function noteFolder(notePath: string | null): string {
  if (!notePath) return ''
  const idx = notePath.lastIndexOf('/')
  return idx === -1 ? '' : notePath.slice(0, idx)
}

/**
 * 导出目标文件夹（vault 相对路径，'' 为 vault 根）：
 * 文件夹设置非空时优先（无视笔记位置），留空则与笔记同目录。
 */
export function resolveExportFolderPath(notePath: string | null, folderSetting: string): string {
  const setting = normalizeFolderSetting(folderSetting)
  return setting || noteFolder(notePath)
}

/** 导出文件完整路径（vault 相对路径） */
export function resolveExportPath(
  notePath: string | null,
  folderSetting: string,
  filename: string
): string {
  const folder = resolveExportFolderPath(notePath, folderSetting)
  return folder ? `${folder}/${filename}` : filename
}

export interface ExportScaleResult {
  /** 实际可用的缩放倍数 */
  scale: number
  /** 该倍数下画布高度是否在上限内；false 时不可直接截图 */
  fits: boolean
  /** 相对期望倍数发生了降级 */
  downgraded: boolean
}

/**
 * 缩放降级：从期望倍数逐级降到 1x，取首个「内容高度 × 倍数 ≤ 上限」的倍数；
 * 连 1x 也超限时返回 { scale: 1, fits: false }，由调用方给出明确错误而不是
 * 让 canvas 静默产出空白图。
 */
export function resolveExportScale(
  contentHeight: number,
  desiredScale: number,
  maxCanvasHeight: number = MAX_CANVAS_HEIGHT
): ExportScaleResult {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
    return { scale: desiredScale, fits: true, downgraded: false }
  }
  const height = Math.ceil(contentHeight)
  const start = Math.max(1, Math.floor(desiredScale))
  for (let scale = start; scale >= 1; scale--) {
    if (height * scale <= maxCanvasHeight) {
      return { scale, fits: true, downgraded: scale < start }
    }
  }
  return { scale: 1, fits: false, downgraded: true }
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

// ---- 截图流程（依赖 DOM，无法在 node 测试环境单测） -------------------------

export interface ExportImageRequest {
  app: App
  /** render() 产出的 HTML（未做 app:// 改写的原始渲染结果） */
  html: string
  /** 当前笔记路径，用于解析相对图片路径与默认保存目录 */
  activeFilePath: string | null
  /** 导出文件名主体，一般取笔记名 */
  noteName: string
  /** 版面宽度 px（375 / 750 / 1080） */
  width: number
  /** 期望缩放倍数（1 / 2 / 3） */
  scale: number
  /** 保存文件夹设置；留空与笔记同目录 */
  folder: string
}

export interface ExportImageResult {
  /** 保存后的 vault 相对路径 */
  path: string
  scale: number
  downgraded: boolean
  /** 未能内联的图片警告（不影响其余内容导出） */
  warnings: string[]
}

/** 读取 vault 内图片字节；找不到文件时抛错（进入 warnings） */
async function readLocalImageBytes(app: App, imagePath: string): Promise<ArrayBuffer> {
  const file = findVaultImageFile(app, imagePath)
  if (!file) {
    throw new Error(`vault 中未找到图片 ${imagePath}`)
  }
  return await app.vault.readBinary(file)
}

/** 下载外链图片字节；走 requestUrl 以绕开 CORS 限制 */
async function fetchRemoteImageBytes(url: string): Promise<ArrayBuffer> {
  const response = await requestUrl({ url, method: 'GET' })
  return response.arrayBuffer
}

/**
 * 把容器内所有 <img> 的 src 换成 data URL：本地图片读 vault 字节，
 * 外链图片经 requestUrl 下载，data URL 原样保留。
 * html2canvas 无法加载 app:// 协议，且直连外链受 CORS 限制，
 * 统一内联后才交给它截图。同一图片只处理一次。
 * 单张失败不阻塞导出：保留原 src 并计入 warnings。
 */
async function inlineImageSources(
  container: HTMLElement,
  app: App,
  activeFilePath: string | null
): Promise<string[]> {
  const warnings: string[] = []
  const cache = new Map<string, string>()
  const images = Array.from(container.querySelectorAll('img'))

  for (const img of images) {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) continue

    const isRemote = /^https?:\/\//i.test(src)
    const key = isRemote ? src : normalizeImagePath(src, activeFilePath) ?? src
    const cached = cache.get(key)
    if (cached) {
      img.setAttribute('src', cached)
      continue
    }

    try {
      const bytes = isRemote
        ? await fetchRemoteImageBytes(src)
        : await readLocalImageBytes(app, key)
      const dataUrl = arrayBufferToDataUrl(bytes, detectImageType(bytes))
      cache.set(key, dataUrl)
      img.setAttribute('src', dataUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warnings.push(message)
    }
  }
  return warnings
}

/** 等待容器内全部图片完成解码；解码失败（损坏图片）不阻塞 */
async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'))
  await Promise.all(
    images.map(async (img) => {
      try {
        await img.decode()
      } catch {
        // 图片损坏或尚未就绪：保持现状继续截图
      }
    })
  )
}

/** 列出目标文件夹下已有的文件名，供导出文件名去重 */
function listExistingFileNames(app: App, folder: string): Set<string> {
  const node = folder ? app.vault.getAbstractFileByPath(folder) : app.vault.getRoot()
  const children = (node as { children?: { name: string }[] } | null)?.children
  return new Set((children ?? []).map((child) => child.name))
}

/** 逐级创建 vault 内文件夹；已存在时忽略报错 */
async function ensureVaultFolder(app: App, folder: string): Promise<void> {
  if (!folder) return
  const parts = folder.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (app.vault.getAbstractFileByPath(current)) continue
    try {
      await app.vault.createFolder(current)
    } catch {
      // 文件夹已被并行创建等情况：忽略
    }
  }
}

/**
 * 把渲染 HTML 截为 PNG 并写入 vault。
 *
 * 流程：离屏容器挂载 → 图片全部内联为 data URL → 等待解码 →
 * 按设置宽度与期望倍数计算可用缩放（超限自动降级）→ html2canvas 截图 →
 * 文件名去重后写入 vault。
 *
 * 任何导致「必然拿到空白/损坏图」的情形（内容连 1x 也超限、编码失败）
 * 都以抛错结束，由调用方提示用户。
 */
export async function exportNoteImage(req: ExportImageRequest): Promise<ExportImageResult> {
  const { app, html, activeFilePath, width } = req
  const { default: html2canvas } = await import('html2canvas-pro')

  // 离屏挂载：html2canvas 需要元素真实参与布局，但不能出现在可视区域内
  const host = createEl('div')
  host.setCssStyles({
    position: 'fixed',
    left: '-99999px',
    top: '0',
    width: `${width}px`,
    background: '#ffffff',
    zIndex: '-1',
    pointerEvents: 'none',
  })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  host.replaceChildren(...Array.from(doc.body.childNodes))
  document.body.appendChild(host)

  try {
    const warnings = await inlineImageSources(host, app, activeFilePath)
    await waitForImages(host)

    const section = host.querySelector<HTMLElement>('#bm-md') ?? host
    const contentHeight = section.getBoundingClientRect().height
    const scaleResult = resolveExportScale(contentHeight, req.scale)
    if (!scaleResult.fits) {
      throw new Error(
        `内容高度约 ${Math.round(contentHeight)}px，即使 1x 缩放也超出画布上限 ` +
        `${MAX_CANVAS_HEIGHT}px，请拆分笔记后分段导出`
      )
    }

    const canvas = await html2canvas(section, {
      scale: scaleResult.scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) {
      throw new Error('图片编码失败，请重试')
    }
    const data = await blob.arrayBuffer()

    const folderPath = resolveExportFolderPath(activeFilePath, req.folder)
    const filename = pickUniqueFileName(req.noteName, listExistingFileNames(app, folderPath))
    await ensureVaultFolder(app, folderPath)
    const fullPath = resolveExportPath(activeFilePath, req.folder, filename)
    await app.vault.createBinary(fullPath, data)

    return {
      path: fullPath,
      scale: scaleResult.scale,
      downgraded: scaleResult.downgraded,
      warnings,
    }
  } finally {
    host.remove()
  }
}
