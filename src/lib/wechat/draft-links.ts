/**
 * 笔记 ↔ 公众号草稿的关联记录。
 *
 * 微信接口没有「按标题查找草稿」的能力，重新发布时无法自动判断
 * 应该覆盖哪一篇。插件改为在本地记录每次发布得到的 media_id，
 * 同一篇笔记再次发布时默认更新原草稿，而不是不断新增重复草稿。
 *
 * 记录按笔记路径归档，随插件设置一起持久化；笔记重命名时迁移键名。
 */

export interface DraftLink {
  /** 草稿 media_id */
  mediaId: string
  /** 最近一次发布时的标题，用于弹窗里向用户确认覆盖目标 */
  title: string
  /** 最近一次成功发布的时间戳 */
  updatedAt: number
  /**
   * 封面永久素材 media_id。封面路径未变时可直接复用，
   * 省去每次覆盖都重新上传封面的开销。
   */
  thumbMediaId?: string
  /** 最近一次发布时使用的封面来源标识，取值见 coverKeyFor */
  coverKey?: string
}

export type DraftLinkMap = Record<string, DraftLink>

/**
 * 封面来源指纹。与上次一致时可直接复用已经上传的永久素材，省掉一次上传；
 * 任何一项变化都必须重新上传。默认封面按标题生成，因此标题也要计入。
 */
export function coverKeyFor(
  explicitCoverPath: string,
  firstBodyImagePath: string | null,
  title: string
): string {
  const explicit = explicitCoverPath.trim()
  if (explicit) return `file:${explicit}`
  if (firstBodyImagePath) return `auto:${firstBodyImagePath}`
  return `generated:${title.trim()}`
}

/**
 * 覆盖更新失败时的处理建议。
 *
 * - `recreated`：草稿已被删除/无权限，改用新建（用户的意图是「让草稿是最新的」）
 * - `retryWithoutCover`：封面素材失效，清掉缓存的 thumb_media_id 后重试一次
 * - `fatal`：其余错误原样抛出
 */
export type UpdateFailureAction = 'recreated' | 'retryWithoutCover' | 'fatal'

export function classifyUpdateFailure(code: number): UpdateFailureAction {
  // 87010 草稿不存在、87011 无权限操作：目标已不可写，只能新建
  if (code === 87010 || code === 87011) return 'recreated'
  // 40007 / 87013 封面素材无效或已被删除：重新上传封面再试
  if (code === 40007 || code === 87013) return 'retryWithoutCover'
  return 'fatal'
}

/** 提取微信错误码；非微信错误返回 null */
export function weChatErrorCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'number') return code
  }
  return null
}

/** 从持久化数据里还原关联表，丢弃结构不完整的条目 */
export function normalizeDraftLinks(raw: unknown): DraftLinkMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const result: DraftLinkMap = {}
  for (const [notePath, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!notePath || !value || typeof value !== 'object') continue
    const entry = value as Partial<DraftLink>
    if (typeof entry.mediaId !== 'string' || !entry.mediaId) continue
    result[notePath] = {
      mediaId: entry.mediaId,
      title: typeof entry.title === 'string' ? entry.title : '',
      updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
        ? entry.updatedAt
        : 0,
      ...(typeof entry.thumbMediaId === 'string' && entry.thumbMediaId
        ? { thumbMediaId: entry.thumbMediaId }
        : {}),
      ...(typeof entry.coverKey === 'string' && entry.coverKey
        ? { coverKey: entry.coverKey }
        : {})
    }
  }
  return result
}

/** 取某篇笔记关联的草稿；没有关联返回 null */
export function getDraftLink(map: DraftLinkMap, notePath: string | null): DraftLink | null {
  if (!notePath) return null
  return map[notePath] ?? null
}

/** 写入/覆盖关联，返回新表（不修改入参） */
export function setDraftLink(
  map: DraftLinkMap,
  notePath: string,
  link: DraftLink
): DraftLinkMap {
  return { ...map, [notePath]: link }
}

/** 删除某篇笔记的关联，返回新表 */
export function removeDraftLink(map: DraftLinkMap, notePath: string): DraftLinkMap {
  if (!(notePath in map)) return map
  const next = { ...map }
  delete next[notePath]
  return next
}

/** 草稿被删除后，清掉所有指向它的关联，避免下次发布去更新一篇不存在的草稿 */
export function removeDraftLinkByMediaId(map: DraftLinkMap, mediaId: string): DraftLinkMap {
  const next: DraftLinkMap = {}
  let changed = false
  for (const [path, link] of Object.entries(map)) {
    if (link.mediaId === mediaId) {
      changed = true
      continue
    }
    next[path] = link
  }
  return changed ? next : map
}

/**
 * 笔记重命名/移动后迁移关联键。
 *
 * 同时处理两种情况：
 * - 单篇笔记改名：直接迁移该键
 * - 整个文件夹改名：迁移所有 `oldPath/` 前缀的子笔记
 *
 * 旧路径没有关联时原样返回；目标路径已有记录时以迁移过来的为准
 * （重命名后的笔记就是原草稿的新家）。
 */
export function renameDraftLink(
  map: DraftLinkMap,
  oldPath: string,
  newPath: string
): DraftLinkMap {
  const prefix = `${oldPath}/`
  const affected = Object.keys(map).filter(
    (path) => path === oldPath || path.startsWith(prefix)
  )
  if (affected.length === 0) return map

  const next: DraftLinkMap = { ...map }
  for (const path of affected) {
    const link = next[path]
    delete next[path]
    next[newPath + path.slice(oldPath.length)] = link
  }
  return next
}
