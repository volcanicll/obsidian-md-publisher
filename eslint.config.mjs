import tsParser from "@typescript-eslint/parser";
import * as obsidianmd from "eslint-plugin-obsidianmd";

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
    },
  },
];

