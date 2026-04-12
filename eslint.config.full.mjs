import tsParser from "@typescript-eslint/parser";
import obsidianmd from "/tmp/obsidian-eslint/dist/lib/index.js";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { 
        ecmaVersion: 2022, 
        sourceType: "module",
      },
    },
    plugins: { obsidianmd },
    rules: {
      "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/no-forbidden-elements": "error",
      "obsidianmd/no-sample-code": "error",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-tfile-tfolder-cast": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/object-assign": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/sample-names": "error",
      "obsidianmd/validate-manifest": "error",
      "obsidianmd/validate-license": ["error"],
      "obsidianmd/detach-leaves": "error",
      "obsidianmd/hardcoded-config-path": "error",
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/prefer-abstract-input-suggest": "error",
      "obsidianmd/commands/no-command-in-command-id": "error",
      "obsidianmd/commands/no-command-in-command-name": "error",
      "obsidianmd/commands/no-default-hotkeys": "error",
      "obsidianmd/commands/no-plugin-id-in-command-id": "error",
      "obsidianmd/commands/no-plugin-name-in-command-name": "error",
      "obsidianmd/settings-tab/no-manual-html-headings": "error",
      "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
      "obsidianmd/vault/iterate": "error",
    },
  },
];

