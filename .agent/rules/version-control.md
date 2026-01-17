# 版本控制规范

本项目遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 规范。

## 版本号格式

```
MAJOR.MINOR.PATCH
```

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的问题修复

## 版本递增规则

### PATCH 版本 (x.x.1 → x.x.2)

- Bug 修复
- 文档更新
- 性能优化（无 API 变更）
- 依赖安全更新

### MINOR 版本 (x.1.x → x.2.0)

- 新增功能
- 新增主题样式
- 新增平台支持
- 废弃旧功能（但仍可用）

### MAJOR 版本 (1.x.x → 2.0.0)

- 移除已废弃功能
- 修改配置结构
- 不兼容的 API 变更
- 最低 Obsidian 版本要求变更

## 必须同步更新的文件

每次发布新版本时，以下文件的版本号必须保持一致：

1. `package.json` - `version` 字段
2. `manifest.json` - `version` 字段
3. `versions.json` - 添加新版本映射

## CHANGELOG 规范

每次版本更新必须在 CHANGELOG.md 中记录：

```markdown
## [x.x.x] - YYYY-MM-DD

### Added

- 新增功能描述

### Changed

- 变更内容描述

### Fixed

- 修复问题描述

### Removed

- 移除内容描述
```

## 版本发布命令

```bash
# 自动更新版本并同步所有文件
bun run version patch  # 补丁版本
bun run version minor  # 次版本
bun run version major  # 主版本
```
