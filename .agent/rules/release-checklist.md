# 发布检查清单

每次发布新版本前，必须按顺序完成以下步骤。

## 发布前检查

- [ ] 确保所有更改已提交
- [ ] 确保测试通过 (`bun run build`)
- [ ] 确保 CHANGELOG.md 已更新
- [ ] 确认版本号递增类型 (patch/minor/major)

## 版本文件同步

运行版本更新命令后，检查以下文件版本号一致：

- [ ] `package.json` 中的 `version`
- [ ] `manifest.json` 中的 `version`
- [ ] `versions.json` 中已添加新版本映射

## 发布步骤

```bash
# 1. 确保工作区干净
git status

# 2. 运行版本更新脚本
bun run version [patch|minor|major]

# 3. 提交版本更新
git add .
git commit -m "chore: release v[VERSION]"

# 4. 创建版本标签
git tag v[VERSION]

# 5. 推送代码和标签
git push origin main
git push origin v[VERSION]
```

## 发布后验证

- [ ] GitHub Actions 工作流成功运行
- [ ] GitHub Releases 页面包含新版本
- [ ] 下载的文件可正常使用
  - `main.js`
  - `manifest.json`
  - `styles.css`

## Git 标签格式

- 标签名: `v[MAJOR].[MINOR].[PATCH]`
- 示例: `v1.0.0`, `v1.2.3`, `v2.0.0`
