/**
 * Obsidian 笔记嵌入语法（![[笔记名]]、![[笔记名#标题]]）→ 引用块。
 *
 * 在渲染前于 Markdown 层预处理：把嵌入的笔记内容折入引用块，
 * 由后续管线正常渲染排版；图片嵌入不在此处理（沿用既有图片链路）。
 * 代码块与行内代码中的嵌入语法保持原样。
 */

/** 与 image-processor 的图片扩展名保持一致：带这些扩展名的交给图片管线 */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']

export function isImagePath(target: string): boolean {
  const ext = (target.split('.').pop() || '').toLowerCase()
  return target.includes('.') && IMAGE_EXTENSIONS.includes(ext)
}

/**
 * 按「笔记#一级标题#二级标题」切片：返回目标标题（含自身层级）到
 * 下一个同级或更高级标题之间的内容。找不到时返回 null。
 * 围栏代码块内的 # 行（如 shell 注释）不视为标题。
 */
export function sliceByHeadings(content: string, headings: string[]): string | null {
  if (headings.length === 0) return content

  const lines = content.split('\n')
  // 预计算每行是否为围栏外的标题，避免扫描时误匹配代码块内容
  const headingAt: Array<{ depth: number; text: string } | null> = []
  let inFence = false
  let fenceMarker = ''
  let fenceLength = 0
  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
        fenceLength = fenceMatch[1].length
      } else if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false
      }
      headingAt.push(null)
      continue
    }
    const m = inFence ? null : line.match(/^(#{1,6})\s+(.*)$/)
    headingAt.push(m ? { depth: m[1].length, text: m[2].trim().toLowerCase() } : null)
  }

  // 每级标题在文中的行号（按 # 数量降序逐层下钻）
  let startIdx = -1
  let startDepth = 0

  for (const heading of headings) {
    const target = heading.trim().toLowerCase()
    let found = -1
    for (let i = startIdx + 1; i < lines.length; i++) {
      const info = headingAt[i]
      if (info && info.text === target) {
        found = i
        startDepth = info.depth
        break
      }
    }
    if (found === -1) return null
    startIdx = found
  }

  // 切片终点：下一个深度 <= 起始标题深度的标题行
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const info = headingAt[i]
    if (info && info.depth <= startDepth) {
      endIdx = i
      break
    }
  }
  return lines.slice(startIdx, endIdx).join('\n')
}

/** 解析一条嵌入目标：返回笔记内容切片或 null（未找到） */
export type NoteResolver = (
  target: string
) => Promise<{ content: string } | null>

/** 把一段 Markdown 内容整体折入引用块，附来源标注行 */
export function toQuoteBlock(target: string, content: string): string {
  const quoted = content
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')
  return `> 【嵌入笔记】${target}\n>\n${quoted}\n`
}

/** 未解析到笔记时的占位引用块：预览可见、不会让发布误报图片缺失 */
export function toMissingEmbedBlock(target: string): string {
  return `> 【嵌入笔记】${target}\n>\n> 未在 vault 中找到该笔记，请检查文件名。\n`
}

/**
 * 解析 Markdown 中的非图片 wiki 嵌入。resolver 未命中时使用占位块。
 */
export async function resolveNoteEmbeds(
  markdown: string,
  resolve: NoteResolver
): Promise<string> {
  const lines = markdown.split('\n')
  let inFence = false
  let fenceMarker = ''
  let fenceLength = 0
  const out: string[] = []

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
        fenceLength = fenceMatch[1].length
      } else if (marker === fenceMarker && fenceMatch[1].length >= fenceLength) {
        inFence = false
      }
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }

    // 行内代码保护：仅处理代码片段之外的部分
    const parts = line.split(/(`[^`]*`)/)
    const processed: string[] = []
    for (const part of parts) {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        processed.push(part)
        continue
      }
      if (!part.includes('![[')) {
        processed.push(part)
        continue
      }
      const piece = part
      const embedRe = /!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g
      let lastIdx = 0
      let m: RegExpExecArray | null
      while ((m = embedRe.exec(piece)) !== null) {
        const target = m[1].trim()
        if (isImagePath(target)) continue // 图片嵌入留给图片管线
        const resolved = await resolve(target)
        const block = resolved
          ? toQuoteBlock(target, resolved.content.replace(/\n+$/, ''))
          : toMissingEmbedBlock(target)
        processed.push(piece.slice(lastIdx, m.index))
        processed.push('\n\n' + block + '\n')
        lastIdx = m.index + m[0].length
      }
      processed.push(piece.slice(lastIdx))
    }
    out.push(processed.join(''))
  }

  return out.join('\n')
}
