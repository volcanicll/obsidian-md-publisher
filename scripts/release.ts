#!/usr/bin/env bun
/**
 * 一键发布（唯一权威流程）
 *
 *   bun run release <patch|minor|major>      # 版本号由递增规则决定
 *   bun run release --dry-run minor          # 只预览，不写文件、不推送
 *
 * 覆盖从版本号到 GitHub Release 的全部步骤，与 release.yml 的校验保持一致：
 *   CHANGELOG 归档 → 同步版本号 → 门禁 → 提交 → 打 tag → 推送 → 建 Release → 校验产物
 *
 * 注意：tag 不带 `v` 前缀。release.yml 会校验 tag 与 package.json /
 * manifest.json 的 version 完全一致（Obsidian 社区审核同样要求无前缀）。
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dir, '..')
process.chdir(ROOT)

type BumpType = 'patch' | 'minor' | 'major'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bumpArg = args.find(a => !a.startsWith('-')) as BumpType | undefined

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

function fail(msg: string): never {
  console.error(`\n${c.red('✗')} ${msg}\n`)
  process.exit(1)
}

function step(n: number, total: number, msg: string): void {
  console.log(`\n${c.dim(`[${n}/${total}]`)} ${c.bold(msg)}`)
}

function run(cmd: string, opts: { capture?: boolean } = {}): string {
  if (!opts.capture) console.log(c.dim(`    $ ${cmd}`))
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  }) as string
}

const readJson = <T>(f: string): T => JSON.parse(fs.readFileSync(f, 'utf-8'))
const writeJson = (f: string, d: unknown): void =>
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n')

function bumpVersion(version: string, type: BumpType): string {
  const p = version.split('.').map(Number)
  if (p.length !== 3 || p.some(Number.isNaN)) fail(`版本号格式非法: ${version}`)
  if (type === 'major') return [p[0] + 1, 0, 0].join('.')
  if (type === 'minor') return [p[0], p[1] + 1, 0].join('.')
  return [p[0], p[1], p[2] + 1].join('.')
}

const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD，本地时区

/** 从 CHANGELOG 中取出某个版本的小节正文（不含标题行） */
function changelogSection(md: string, version: string): string {
  const lines = md.split('\n')
  const head = lines.findIndex(l => l.startsWith(`## [${version}]`))
  if (head === -1) fail(`CHANGELOG 中找不到 [${version}] 小节`)
  const rest = lines.slice(head + 1)
  const end = rest.findIndex(l => l.startsWith('## ['))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

// ───────────────────────── 前置检查 ─────────────────────────

step(1, 9, '前置检查')

if (!bumpArg || !['patch', 'minor', 'major'].includes(bumpArg)) {
  fail(`用法: bun run release <patch|minor|major>  （收到: ${bumpArg ?? '空'}）`)
}

const branch = run('git rev-parse --abbrev-ref HEAD', { capture: true }).trim()
if (branch !== 'main') fail(`当前分支是 ${branch}，发布必须在 main 上进行`)

const dirty = run('git status --porcelain', { capture: true }).trim()
if (dirty && !dryRun) {
  fail(`工作区不干净，先提交或 stash：\n${dirty}`)
}

const pkg = readJson<{ version: string }>('package.json')
const manifest = readJson<{ version: string; minAppVersion: string }>('manifest.json')
const versions = readJson<Record<string, string>>('versions.json')

if (pkg.version !== manifest.version) {
  fail(`package.json (${pkg.version}) 与 manifest.json (${manifest.version}) 版本不一致`)
}

const current = pkg.version
const next = bumpVersion(current, bumpArg)

if (versions[next]) fail(`versions.json 中已存在 ${next}，无法重复发布`)

const tagExists = run(`git tag -l ${next}`, { capture: true }).trim()
if (tagExists) fail(`本地已存在 tag ${next}`)
const remoteTag = run(`git ls-remote --tags origin refs/tags/${next}`, { capture: true }).trim()
if (remoteTag) fail(`远程已存在 tag ${next}`)

console.log(`    分支 ${branch} · ${current} → ${c.green(next)}${dryRun ? c.yellow('  [dry-run]') : ''}`)

// ───────────────────────── CHANGELOG ─────────────────────────

step(2, 9, '归档 CHANGELOG')

let changelog = fs.readFileSync('CHANGELOG.md', 'utf-8')
if (!changelog.includes('## [Unreleased]')) {
  fail('CHANGELOG.md 中没有 ## [Unreleased] 小节，先补写变更再发布')
}

const unreleased = changelogSection(
  changelog.replace('## [Unreleased]', `## [${next}] - ${today}`),
  next
)
if (!unreleased) fail('CHANGELOG 的 [Unreleased] 小节是空的，没有可发布的内容')

if (!dryRun) {
  changelog = changelog.replace('## [Unreleased]', `## [${next}] - ${today}`)
  fs.writeFileSync('CHANGELOG.md', changelog)
}
console.log(`    [Unreleased] → [${next}] - ${today}（${unreleased.split('\n').length} 行）`)

// ───────────────────────── 同步版本号 ─────────────────────────

step(3, 9, '同步版本号')

// 站点页脚/hero 里硬编码的版本号也必须跟着走，否则官网永远停留在旧版本
const SITE = 'site/index.html'
const SITE_VERSION_RE = /(<span class="kicker">Obsidian 桌面插件 · v)\d+\.\d+\.\d+( · MIT 开源<\/span>)/
let siteHtml = fs.readFileSync(SITE, 'utf-8')
if (!SITE_VERSION_RE.test(siteHtml)) {
  fail(`${SITE} 中找不到可识别的版本号标记（kicker 里的 vX.Y.Z），无法同步`)
}

if (!dryRun) {
  pkg.version = next
  writeJson('package.json', pkg)
  manifest.version = next
  writeJson('manifest.json', manifest)
  versions[next] = manifest.minAppVersion
  writeJson('versions.json', versions)

  siteHtml = siteHtml.replace(SITE_VERSION_RE, `$1${next}$2`)
  fs.writeFileSync(SITE, siteHtml)
}
console.log(`    package.json / manifest.json → ${next}`)
console.log(`    versions.json += "${next}": "${manifest.minAppVersion}"`)
console.log(`    ${SITE} kicker → v${next}`)

if (dryRun) {
  console.log(`\n${c.yellow('dry-run 结束，未写入任何文件。')}\n`)
  process.exit(0)
}

// ───────────────────────── 门禁 ─────────────────────────

step(4, 9, '门禁：lint / typecheck / test / build')
run('bun run lint')
run('bun run typecheck')
run('bun run test')
run('bun run build')

const builtManifest = readJson<{ version: string }>('dist/manifest.json')
if (builtManifest.version !== next) {
  fail(`构建产物版本不符：dist/manifest.json = ${builtManifest.version}，期望 ${next}`)
}
console.log(`    dist/manifest.json = ${next}`)

// ───────────────────────── 提交 ─────────────────────────

step(5, 9, '提交')
run('git add package.json manifest.json versions.json CHANGELOG.md site/index.html')
run(`git commit -m "chore: release ${next}"`)
console.log(`    ${run('git log --oneline -1', { capture: true }).trim()}`)

// ───────────────────────── 打 tag 并推送 ─────────────────────────

step(6, 9, '打 tag 并推送')
run(`git tag ${next}`)
console.log(c.dim(`    $ git tag ${next}   (无 v 前缀，与 release.yml 校验一致)`))
run(`git push origin ${branch}`)
run(`git push origin ${next}`)

// ───────────────────────── 建 Release ─────────────────────────

step(7, 9, '创建 GitHub Release（触发 release.yml）')

const notes = `${unreleased}

## 安装

从 Obsidian 社区插件目录搜索 **Markdown Publisher** 更新，或下载下方 \`main.js\` / \`manifest.json\` / \`styles.css\` 覆盖到 \`.obsidian/plugins/md-publisher/\`。

完整变更见 [CHANGELOG](https://github.com/volcanicll/obsidian-md-publisher/blob/main/CHANGELOG.md)。
`
const notesFile = path.join(ROOT, `.release-notes-${next}.md`)
fs.writeFileSync(notesFile, notes)
try {
  run(`gh release create ${next} --title "${next}" --notes-file "${notesFile}" --verify-tag`)
} finally {
  fs.unlinkSync(notesFile)
}

// ───────────────────────── 校验产物 ─────────────────────────

step(8, 9, '等待 release.yml 构建产物')
run('sleep 10')
const runId = run(
  `gh run list --workflow=release.yml -L 1 --json databaseId --jq '.[0].databaseId'`,
  { capture: true }
).trim()
run(`gh run watch ${runId} --exit-status`)

step(9, 9, '校验 Release 产物')
// 注意：gh --jq 输出的是裸字符串（逗号分隔），不是 JSON，不能 JSON.parse
const assets = run(
  `gh release view ${next} --json assets --jq '[.assets[].name] | sort | join(",")'`,
  { capture: true }
).trim()
const expected = 'main.js,manifest.json,styles.css'
if (assets !== expected) fail(`Release 产物不符：得到 ${assets}，期望 ${expected}`)
console.log(`    产物: ${assets}`)

console.log(`\n${c.green('✓')} ${c.bold(`${next} 发布完成`)}`)
console.log(c.dim(`  https://github.com/volcanicll/obsidian-md-publisher/releases/tag/${next}\n`))
