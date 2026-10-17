/**
 * 发布弹窗的表单状态与纯校验逻辑。
 *
 * 表单状态、字段长度、封面来源指纹都放在这里，UI 只负责把结果映射成
 * 样式与文案。这样发布弹窗改版后，规则仍可独立测试。
 */

import { charLength, WECHAT_LIMITS } from './config'
import type { DraftLink } from './draft-links'
import type { LinkCheckResult, SensitiveHit } from './validation'

export type PublishMode = 'new' | 'update'

/** 本次发布临时选择的本地图片，只存在于内存，不写入 vault */
export interface LocalCoverFile {
  name: string
  size: number
  lastModified: number
  data: ArrayBuffer
  contentType: string
  /** 预览用 object URL，关闭弹窗或换图时释放 */
  previewUrl: string
}

export type CoverSource =
  | { kind: 'auto' }
  | { kind: 'vault'; path: string }
  | { kind: 'upload'; file: LocalCoverFile }
  | { kind: 'generated' }

export interface PublishFormState {
  title: string
  author: string
  digest: string
  contentSourceUrl: string
  needOpenComment: boolean
  onlyFansCanComment: boolean
  /** 是否在文章页顶部展示封面，映射 show_cover_pic */
  showCoverInBody: boolean
  cover: CoverSource
  publishMode: PublishMode
  /** 覆盖模式的目标草稿；null 表示尚未选定 */
  draftLink: DraftLink | null
}

export interface FieldCheck {
  length: number
  limit: number
  over: boolean
  /** 必填字段为空 */
  missing: boolean
}

export interface FormFieldState {
  title: FieldCheck
  author: FieldCheck
  digest: FieldCheck
  /** 全部字段合规 */
  allValid: boolean
  /** 合规字段数，用于「字段 N/3」 */
  okCount: number
}

function checkField(value: string, limit: number, required: boolean): FieldCheck {
  // 发布时会 trim 后再提交，计数也按提交内容计算
  const length = charLength(value.trim())
  return {
    length,
    limit,
    over: length > limit,
    missing: required && length === 0
  }
}

export function computeFieldState(
  form: Pick<PublishFormState, 'title' | 'author' | 'digest'>
): FormFieldState {
  const title = checkField(form.title, WECHAT_LIMITS.title, true)
  const author = checkField(form.author, WECHAT_LIMITS.author, false)
  const digest = checkField(form.digest, WECHAT_LIMITS.digest, false)
  const checks = [title, author, digest]
  return {
    title,
    author,
    digest,
    allValid: checks.every((field) => !field.over && !field.missing),
    okCount: checks.filter((field) => !field.over && !field.missing).length
  }
}

/**
 * 封面来源指纹。与上次发布一致时可直接复用已上传的永久素材。
 *
 * 「正文首图」在全文无图时会退回标题卡片，因此这种情况下指纹按
 * 生成封面计算，标题变化后必须重新上传。
 */
export function coverKeyForSource(
  source: CoverSource,
  firstBodyImagePath: string | null,
  title: string
): string {
  switch (source.kind) {
    case 'vault':
      return `file:${source.path.trim()}`
    case 'upload':
      return `upload:${source.file.name}:${source.file.size}:${source.file.lastModified}`
    case 'generated':
      return `generated:${title.trim()}`
    case 'auto':
      return firstBodyImagePath
        ? `auto:${firstBodyImagePath}`
        : `generated:${title.trim()}`
  }
}

export function coverSourceLabel(
  source: CoverSource,
  firstBodyImagePath: string | null
): string {
  switch (source.kind) {
    case 'vault':
      return source.path.trim() || 'vault 图片'
    case 'upload':
      return '本地上传'
    case 'generated':
      return '标题卡片'
    case 'auto':
      return firstBodyImagePath ? '正文首图' : '标题卡片'
  }
}

export function coverSourceHint(source: CoverSource): string {
  switch (source.kind) {
    case 'vault':
      return '从 vault 图片中挑选，路径会随笔记一起保存。'
    case 'upload':
      return '从本机选择图片，仅本次发布使用，不写入 vault。'
    case 'generated':
      return '按当前标题生成卡片封面，标题变化会同步更新。'
    case 'auto':
      return '将使用正文第一张图片；全文无图时按标题生成卡片封面。'
  }
}

export interface ChipState {
  label: string
  tone: 'idle' | 'ok' | 'warn' | 'error'
}

export interface CheckChipStates {
  links: ChipState
  words: ChipState
}

/**
 * 检查结果摘要。`null` 表示尚未执行检查，与「检查过但没有问题」区分开。
 */
export function summarizeChecks(
  links: LinkCheckResult[] | null,
  words: SensitiveHit[] | null
): CheckChipStates {
  let linkChip: ChipState
  if (links === null) {
    linkChip = { label: '链接未检查', tone: 'idle' }
  } else if (links.length === 0) {
    linkChip = { label: '正文无外链', tone: 'ok' }
  } else {
    const failed = links.filter((link) => !link.ok).length
    linkChip =
      failed === 0
        ? { label: `链接 ${links.length} 条可达`, tone: 'ok' }
        : { label: `链接 ${failed} 条失败`, tone: 'error' }
  }

  let wordChip: ChipState
  if (words === null) {
    wordChip = { label: '敏感词未检测', tone: 'idle' }
  } else if (words.length === 0) {
    wordChip = { label: '敏感词 0', tone: 'ok' }
  } else {
    wordChip = { label: `敏感词 ${words.length}`, tone: 'warn' }
  }

  return { links: linkChip, words: wordChip }
}

export function fieldsChip(fields: FormFieldState): ChipState {
  return fields.allValid
    ? { label: `字段 ${fields.okCount}/3`, tone: 'ok' }
    : { label: `字段 ${fields.okCount}/3`, tone: 'warn' }
}

/** 覆盖模式必须已选目标；新建模式只要求字段合规 */
export function canSubmit(form: PublishFormState, fields: FormFieldState): boolean {
  if (!fields.allValid) return false
  return form.publishMode === 'new' || form.draftLink !== null
}

export function primaryActionLabel(mode: PublishMode): string {
  return mode === 'update' ? '覆盖更新草稿' : '保存到草稿'
}

/** 发布方式下方的状态行文案；missing 为 true 时样式标红 */
export function targetStatus(
  form: Pick<PublishFormState, 'publishMode' | 'draftLink'>
): { text: string; missing: boolean } {
  if (form.publishMode === 'new') {
    return { text: '将新建一篇草稿；同一篇笔记多次发布会得到多篇草稿', missing: false }
  }
  if (!form.draftLink) {
    return { text: '还没有选择覆盖目标，点击右侧按钮从草稿箱选择', missing: true }
  }
  const time = new Date(form.draftLink.updatedAt).toLocaleString('zh-CN')
  return {
    text: `将覆盖草稿「${form.draftLink.title || '未命名草稿'}」 · 更新于 ${time}`,
    missing: false
  }
}
