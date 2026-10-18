/**
 * 草稿 ↔ 笔记的双向元数据。
 *
 * 把草稿拉回 Obsidian 时，除了正文 Markdown，还要记住它来自哪篇草稿、
 * 作者/摘要/原文链接/封面这些无法从正文还原的字段。这些信息写进笔记
 * frontmatter 的 `wechat` 段：再次发布时据此默认覆盖同一篇草稿，
 * 并预填发布弹窗。
 *
 * frontmatter 用 Obsidian 的 parseYaml / stringifyYaml 读写，保持与
 * 用户手写 YAML 的兼容（引号、多行等由库负责）。
 */

import { parseYaml, stringifyYaml } from 'obsidian'

/** 写入笔记 frontmatter 的公众号元数据 */
export interface DraftFrontmatter {
  /** 草稿 media_id */
  media_id: string
  title?: string
  author?: string
  digest?: string
  content_source_url?: string
  /** 封面永久素材 media_id，覆盖更新时可直接复用 */
  thumb_media_id?: string
  /** 封面来源指纹（见 draft-links.coverKeyFor） */
  cover_key?: string
  /** 封面图本地路径（拉取时下载到 vault 的封面） */
  cover?: string
  /**
   * 拉取时草稿正文是否自带一级标题。
   *
   * 公众号把文章标题存在独立字段里，正文有时还会有一个引言性质的 H1。
   * 这种情况下正文 H1 属于内容，重新发布时应继续用 `title` 作为标题；
   * 反之正文 H1 是由草稿标题生成的，用户改动它就是想改标题。
   */
  title_in_body?: boolean
  /** 拉取时间戳（毫秒） */
  pulled_at?: number
}

export interface NoteFrontmatter {
  [key: string]: unknown
  wechat?: DraftFrontmatter
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** 拆分 frontmatter 与正文；没有 frontmatter 时返回 null */
export function splitFrontmatter(markdown: string): { yaml: string; body: string } | null {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match) return null
  return { yaml: match[1], body: markdown.slice(match[0].length) }
}

/**
 * 读取笔记里的公众号元数据。
 * YAML 损坏或字段类型不对时返回 null，不让坏数据影响正文。
 */
export function readDraftFrontmatter(markdown: string): DraftFrontmatter | null {
  const split = splitFrontmatter(markdown)
  if (!split) return null

  let data: unknown
  try {
    data = parseYaml(split.yaml)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const raw = (data as Record<string, unknown>).wechat
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const entry = raw as Record<string, unknown>
  const mediaId = typeof entry.media_id === 'string' ? entry.media_id.trim() : ''
  if (!mediaId) return null

  const str = (key: string): string | undefined => {
    const value = entry[key]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  }

  return {
    media_id: mediaId,
    ...(str('title') ? { title: str('title') } : {}),
    ...(str('author') ? { author: str('author') } : {}),
    ...(str('digest') ? { digest: str('digest') } : {}),
    ...(str('content_source_url') ? { content_source_url: str('content_source_url') } : {}),
    ...(str('thumb_media_id') ? { thumb_media_id: str('thumb_media_id') } : {}),
    ...(str('cover_key') ? { cover_key: str('cover_key') } : {}),
    ...(str('cover') ? { cover: str('cover') } : {}),
    ...(typeof entry.title_in_body === 'boolean'
      ? { title_in_body: entry.title_in_body }
      : {}),
    ...(typeof entry.pulled_at === 'number' && Number.isFinite(entry.pulled_at)
      ? { pulled_at: entry.pulled_at }
      : {})
  }
}

/**
 * 把公众号元数据写进 Markdown 的 frontmatter。
 *
 * 已有 frontmatter 时只增删 `wechat` 段，其余字段与顺序尽量保持；
 * 没有 frontmatter 时新建一段。空字段不写入，避免笔记里出现一堆
 * 无意义的空键。
 *
 * 已有 frontmatter 但解析失败时抛错：此时无法安全合并，覆盖写入会把
 * 用户手写的字段整段抹掉。调用方应提示用户先修好 YAML。
 */
export function writeDraftFrontmatter(
  markdown: string,
  data: DraftFrontmatter
): string {
  const split = splitFrontmatter(markdown)
  const body = split ? split.body : markdown

  let existing: Record<string, unknown> = {}
  if (split) {
    let parsed: unknown
    try {
      parsed = parseYaml(split.yaml)
    } catch {
      throw new Error('笔记的 frontmatter 无法解析，未写入草稿信息（请先修正 YAML）')
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>
    }
  }

  const cleaned: DraftFrontmatter = {
    media_id: data.media_id,
    ...(data.title ? { title: data.title } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.digest ? { digest: data.digest } : {}),
    ...(data.content_source_url ? { content_source_url: data.content_source_url } : {}),
    ...(data.thumb_media_id ? { thumb_media_id: data.thumb_media_id } : {}),
    ...(data.cover_key ? { cover_key: data.cover_key } : {}),
    ...(data.cover ? { cover: data.cover } : {}),
    ...(typeof data.title_in_body === 'boolean' ? { title_in_body: data.title_in_body } : {}),
    ...(data.pulled_at ? { pulled_at: data.pulled_at } : {})
  }

  const merged = { ...existing, wechat: cleaned }
  const yaml = stringifyYaml(merged).trimEnd()
  return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, '')}`
}

/**
 * 清除笔记里指向某篇草稿的元数据。
 *
 * 草稿被删除后必须一并清掉：否则 frontmatter 里的 media_id 会让下次
 * 发布继续尝试覆盖一篇已经不存在的草稿。其余 frontmatter 字段保留。
 */
export function clearDraftFrontmatter(markdown: string): string {
  const split = splitFrontmatter(markdown)
  if (!split) return markdown

  let parsed: unknown
  try {
    parsed = parseYaml(split.yaml)
  } catch {
    // YAML 损坏时不动原文，避免把用户数据写坏
    return markdown
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return markdown

  const existing = parsed as Record<string, unknown>
  if (!('wechat' in existing)) return markdown

  const next = { ...existing }
  delete next.wechat
  const body = split.body.replace(/^\n+/, '')

  // 没有其它字段时整段 frontmatter 一起去掉
  if (Object.keys(next).length === 0) return body

  const yaml = stringifyYaml(next).trimEnd()
  return `---\n${yaml}\n---\n\n${body}`
}

/**
 * 从草稿元数据生成发布弹窗的初值。
 *
 * 正文里能解析出的标题优先（用户可能已经改过正文），其余字段
 * （作者、摘要、原文链接）只有 frontmatter 里才有。
 */
export function draftDefaultsFromFrontmatter(data: DraftFrontmatter | null): {
  title?: string
  author?: string
  digest?: string
  contentSourceUrl?: string
  thumbMediaId?: string
  coverKey?: string
  coverPath?: string
  titleInBody?: boolean
} {
  if (!data) return {}
  return {
    ...(data.title ? { title: data.title } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.digest ? { digest: data.digest } : {}),
    ...(data.content_source_url ? { contentSourceUrl: data.content_source_url } : {}),
    ...(data.thumb_media_id ? { thumbMediaId: data.thumb_media_id } : {}),
    ...(data.cover_key ? { coverKey: data.cover_key } : {}),
    ...(data.cover ? { coverPath: data.cover } : {}),
    ...(typeof data.title_in_body === 'boolean' ? { titleInBody: data.title_in_body } : {})
  }
}
