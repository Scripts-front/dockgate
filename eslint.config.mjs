// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Target ONLY src/**/*.ts — config files at root are excluded (per D-07)
  { files: ["src/**/*.ts"] },

  // typescript-eslint/strict preset — more rigorous than recommended,
  // no type-checking overhead (no parserOptions.project) (per D-02, D-03)
  ...tseslint.configs.strict,

  // Discretion: enforce import type for type-only imports
  // Required because tsconfig has verbatimModuleSyntax: true
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      // Discretion: warn on console usage (not an error — health route uses it)
      "no-console": "warn",
    },
  }
);
