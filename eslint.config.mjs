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
      "obsidianmd/ui/sentence-case": "error",
    },
  },
];
