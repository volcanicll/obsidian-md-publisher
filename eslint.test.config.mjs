import tsParser from "@typescript-eslint/parser";
import obsidianmd from "/tmp/obsidian-eslint/dist/lib/index.js";

export default [
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: { ecmaVersion: 2022, sourceType: "module" },
        },
        plugins: { obsidianmd },
        rules: {
            "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
            "obsidianmd/no-static-styles-assignment": "error",
            "obsidianmd/no-forbidden-elements": "error",
            "obsidianmd/settings-tab/no-manual-html-headings": "error",
            "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
            "obsidianmd/detach-leaves": "error",
            "obsidianmd/hardcoded-config-path": "error",
        },
    },
];
