---
name: obsidian-version-manager
description: Manage version bumping for Obsidian plugins, syncing package.json, manifest.json, and versions.json.
---

# Obsidian Version Manager Skill

This skill helps you manage the version lifecycle of an Obsidian plugin. It handles everything from version bumping to Git tagging, committing, and optionally pushing to the remote repository.

## Files Handled

- `package.json`: Main project version.
- `manifest.json`: Obsidian plugin manifest version.
- `versions.json`: Version history mapping to minimum Obsidian app version.

## Usage

You can run this skill via `bun` or `node` using the included script.

### Bump Version & Full Release Automation

Run the script from the root of your project:

```bash
bun run .agent/skills/obsidian-version-manager/scripts/version_bump.ts [patch|minor|major]
```

If no argument is provided, it will start an interactive prompt.

**This skill will now automatically:**

1. Update `package.json`, `manifest.json`, and `versions.json`.
2. Stage the modified JSON files.
3. Create a Git commit: `chore: release X.X.X`.
4. Create a Git tag: `X.X.X`.
5. **Push** the current branch and the new tag to `origin` (with user confirmation).

### Bumping Rules

- **patch**: `1.0.0` -> `1.0.1` (Bug fixes)
- **minor**: `1.0.0` -> `1.1.0` (New features)
- **major**: `1.0.0` -> `2.0.0` (Breaking changes)

## Benefits

- Ensures version consistency across all required files.
- Simplifies the release workflow into a single command.
- Automates repetitive Git tasks and reduces human error.
