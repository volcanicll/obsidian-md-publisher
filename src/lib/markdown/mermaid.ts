/**
 * Mermaid 图表 → PNG。
 *
 * 公众号正文不支持内联 SVG，因此把 ```mermaid 代码块渲染成位图，
 * 以 data URL 图片的形式进入既有的图片处理管线（压缩 → 上传微信 CDN）。
 *
 * 渲染依赖 DOM（mermaid + canvas），在无 DOM 的测试环境直接原样返回，
 * 图表退化为普通代码块，保证「失败即降级、绝不阻塞发布」。
 */

const MERMAID_PRE_RE =
  /<pre>\s*<code class="([^"]*\blanguage-mermaid\b[^"]*)">([\s\S]*?)<\/code>\s*<\/pre>/gi

/** 位图缩放倍率：保证公众号端放大后线条清晰 */
const RASTER_SCALE = 2
/** 位图最大宽度（CSS 像素），超出按比例缩小，避免生成超大画布 */
const MAX_CSS_WIDTH = 900

/** 解码 rehype-stringify 转义的实体，还原真实图表源码 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function loadMermaid(): Promise<typeof import('mermaid')['default'] | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null)
  }
  return import('mermaid')
    .then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        // 公众号位图路径必须关闭 htmlLabels：foreignObject 无法被 canvas 光栅化
        flowchart: { htmlLabels: false },
        sequence: { useMaxWidth: false },
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
      })
      return mermaid
    })
    .catch((err) => {
      console.error('Mermaid 加载失败:', err)
      return null
    })
}

let mermaidModule: Promise<typeof import('mermaid')['default'] | null> | null = null
function getMermaid() {
  mermaidModule = mermaidModule || loadMermaid()
  return mermaidModule
}

/** 从 mermaid SVG 中解析 CSS 像素尺寸（优先 width/height 属性，其次 viewBox） */
function measureSvg(svg: string): { width: number; height: number } {
  const wAttr = svg.match(/\bwidth="([\d.]+)/)
  const hAttr = svg.match(/\bheight="([\d.]+)/)
  const width = wAttr ? parseFloat(wAttr[1]) : 0
  const height = hAttr ? parseFloat(hAttr[1]) : 0
  if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height }
  }
  const vb = svg.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/)
  if (vb) {
    return { width: parseFloat(vb[1]), height: parseFloat(vb[2]) }
  }
  return { width: 800, height: 600 }
}

/**
 * 把 SVG 里的 <foreignObject> 标签转换为真正的 <text>。
 *
 * mermaid 的节点标签默认渲染为 foreignObject 里的 HTML，而 Chromium
 * 光栅化含 foreignObject 的 SVG 会污染画布（toDataURL 抛 SecurityError），
 * 且 htmlLabels:false 在 v11/v12 的 flowchart-v2 中均不生效。
 * 因此在临时挂载的隐藏容器里用 getComputedStyle 读取每个文本叶子的
 * 真实字号、颜色与位置，生成 text 节点后删除 foreignObject。
 * 非浏览器环境原样返回。
 */
function convertForeignObjectsToText(svg: string): string {
  if (typeof document === 'undefined' || !svg.includes('<foreignObject')) {
    return svg
  }

  let svgEl: SVGSVGElement
  try {
    const doc = new DOMParser().parseFromString(svg, 'text/html')
    const root = doc.body.querySelector<SVGSVGElement>('svg')
    if (!root) return svg
    svgEl = root
  } catch {
    return svg
  }

  const host = createEl('div')
  host.setCssStyles({
    position: 'absolute',
    left: '-99999px',
    top: '-99999px',
    opacity: '0',
    pointerEvents: 'none',
  })
  host.appendChild(svgEl)
  document.body.appendChild(host)

  try {
    const svgRect = svgEl.getBoundingClientRect()
    const leaves = Array.from(
      svgEl.querySelectorAll<HTMLElement>('foreignObject p, foreignObject span, foreignObject div')
    ).filter((el) => el.children.length === 0 && el.textContent && el.textContent.trim())

    for (const leaf of leaves) {
      const rect = leaf.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      const cs = window.getComputedStyle(leaf)
      const text = createSvg('text')
      text.setAttribute('x', String((rect.left - svgRect.left + rect.width / 2).toFixed(1)))
      text.setAttribute('y', String((rect.top - svgRect.top + rect.height / 2).toFixed(1)))
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'central')
      if (cs.fontSize) text.setAttribute('font-size', cs.fontSize)
      if (cs.fontFamily) text.setAttribute('font-family', cs.fontFamily)
      if (cs.fontWeight && cs.fontWeight !== '400') text.setAttribute('font-weight', cs.fontWeight)
      text.setAttribute('fill', cs.color || 'rgb(51, 51, 51)')
      text.textContent = (leaf.textContent || '').trim()
      svgEl.appendChild(text)
    }

    svgEl.querySelectorAll('foreignObject').forEach((fo) => fo.remove())
    // 根节点的 width="100%" 换成显式尺寸，Image 才能按固有尺寸解码
    const vb = svgEl.getAttribute('viewBox')
    if (vb) {
      const parts = vb.split(/[\s,]+/).map(Number)
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        svgEl.setAttribute('width', String(parts[2]))
        svgEl.setAttribute('height', String(parts[3]))
      }
    }
    return new XMLSerializer().serializeToString(svgEl)
  } catch (err) {
    console.warn('foreignObject 转换失败:', err)
    return svg
  } finally {
    host.remove()
  }
}

/** SVG 字符串 → PNG data URL，失败返回 null */
async function rasterizeSvg(svg: string): Promise<string | null> {
  const prepared = convertForeignObjectsToText(svg)
  let { width, height } = measureSvg(prepared)
  if (!width || !height || width <= 0 || height <= 0) {
    width = 800
    height = 600
  }
  if (width > MAX_CSS_WIDTH) {
    height = Math.round((height * MAX_CSS_WIDTH) / width)
    width = MAX_CSS_WIDTH
  }

  try {
    const blob = new Blob([prepared], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('SVG 解码失败'))
        image.src = url
      })
      const canvas = createEl('canvas')
      canvas.width = Math.max(1, Math.round(width * RASTER_SCALE))
      canvas.height = Math.max(1, Math.round(height * RASTER_SCALE))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      // mermaid 默认透明背景，位图铺白底，公众号暗色模式下不会发黑
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    console.error('Mermaid 位图化失败:', err)
    return null
  }
}

let renderSeq = 0

/**
 * 把 HTML 中的 mermaid 代码块替换为 PNG data URL 图片。
 * 单个图表渲染失败时保留原代码块，不影响其余图表与正文。
 */
export async function renderMermaidBlocks(html: string): Promise<string> {
  const matches = [...html.matchAll(MERMAID_PRE_RE)]
  if (matches.length === 0) return html

  const mermaid = await getMermaid()
  if (!mermaid) return html

  let result = html
  for (const match of matches) {
    const [full, , encodedCode] = match
    const code = decodeHtmlEntities(encodedCode).trim()
    if (!code) continue

    try {
      const { svg } = await mermaid.render(`bm-mermaid-${Date.now()}-${renderSeq++}`, code)
      const dataUrl = await rasterizeSvg(svg)
      if (dataUrl) {
        result = result.replace(full, `<img src="${dataUrl}" alt="mermaid 图表">`)
      }
    } catch (err) {
      // 语法错误等：保留原代码块，发布时以代码形式呈现而不是中断
      console.warn('Mermaid 渲染失败，保留代码块:', err)
    }
  }
  return result
}
