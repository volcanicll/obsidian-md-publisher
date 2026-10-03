# 发布检查清单

发布由单一命令驱动，脚本按顺序执行下列全部步骤，任一步失败即中止：

```bash
bun run release <patch|minor|major>   # 正式发布
bun run release --dry-run minor       # 只预览，不写文件、不推送
```

脚本：`scripts/release.ts`。不要手工分步执行，也不要使用已移除的
`.agent/skills/obsidian-version-manager/`（其 tag 前缀与 CI 校验冲突）。

## 发布前（脚本自动检查）

- [ ] 在 `main` 分支
- [ ] 工作区干净（无未提交改动）
- [ ] `package.json` 与 `manifest.json` 版本一致
- [ ] `CHANGELOG.md` 存在 `## [Unreleased]` 小节，且内容非空
- [ ] 目标版本未出现在 `versions.json`，本地与远程均无同名 tag

## 脚本执行的步骤

1. 归档 CHANGELOG：`## [Unreleased]` → `## [x.y.z] - YYYY-MM-DD`
2. 同步版本号：`package.json`、`manifest.json`、`versions.json`（新版本映射到 `manifest.minAppVersion`）
3. 门禁：`lint` → `typecheck` → `test` → `build`，并校验 `dist/manifest.json` 版本
4. 提交：`chore: release x.y.z`（只提交 4 个版本相关文件）
5. 打 tag `x.y.z`（**不带 `v` 前缀**）并推送分支与 tag
6. 创建 GitHub Release（触发 `release.yml`）
7. 等待 `release.yml` 构建完成并校验产物

## 发布后验证（脚本自动完成）

- [ ] `release.yml` 运行成功
- [ ] Release 产物恰好为 `main.js`、`manifest.json`、`styles.css`
- [ ] 下载 `manifest.json` 的 `version` 与 tag 一致

## 版本递增规则

- `patch` — Bug 修复、文档、性能、依赖安全更新
- `minor` — 新增功能、新增主题、新增平台支持
- `major` — 移除功能、配置结构变更、不兼容 API 变更、最低 Obsidian 版本变更

## 关键约束：tag 不带 `v` 前缀

`release.yml` 校验 `tag == package.json.version == manifest.json.version`，
Obsidian 社区审核也按 `manifest.version` 查找 Release。因此 tag 必须是
`1.6.0` 这样的裸版本号。

用 `v1.6.0` 会导致 `release.yml` 直接失败，且审核机器人报
`Unable to find a release with the tag 1.6.0`。

历史 tag（`v1.1.x` 等早期版本）为遗留命名，不再沿用。
