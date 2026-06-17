---
phase: 04-add-eslint-configuration-eslintrc
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - .husky/pre-commit
  - eslint.config.mjs
  - package.json
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files were reviewed: the ESLint flat config, `package.json`, and the Husky pre-commit hook. The configuration is functional and will work correctly in the common cases (running `eslint src` or committing files under `src/`). However, there are three warnings worth addressing: the `{ files: [...] }` scoping pattern in `eslint.config.mjs` does not work as the comment claims, the `tseslint.config()` helper is deprecated in favour of ESLint's `defineConfig()`, and the `typescript-eslint` peer dependency on TypeScript is pinned narrowly enough that a TypeScript minor version bump will break it. The two info items cover the `npx` invocation in the pre-commit hook and an unused `no-console` rule that applies to files outside `src/`.

---

## Warnings

### WR-01: `{ files }` standalone object does not scope the spread of `tseslint.configs.strict`

**File:** `eslint.config.mjs:6-10`

**Issue:** In ESLint flat config, each element of the config array is an independent object. A config object containing only `files` does not create an inherited scope for objects that follow it — each object's `files` key is evaluated independently. The spread `...tseslint.configs.strict` expands to three independent config objects; two of them have no `files` filter at all and therefore apply globally. The third uses `['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']`, which covers any `.ts` file in the project, not just those under `src/`. The comment on line 5 (`"config files at root are excluded (per D-07)"`) is incorrect.

In practice this does not break linting because both the `lint` script (`eslint src`) and `lint-staged` (`src/**/*.ts`) already limit which files are passed to ESLint. But if anyone runs `eslint .`, root-level `.ts` files (e.g., `eslint.config.mjs` if it were `.ts`) would be linted unexpectedly, and the comment creates a false sense of safety.

**Fix:** Move `files` inside the same config object as `extends` (using `tseslint.config()`'s built-in `extends` short-hand), which correctly stamps the `files` constraint onto every spread config:

```js
export default tseslint.config(
  {
    files: ["src/**/*.ts"],
    extends: [
      ...tseslint.configs.strict,
    ],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      "no-console": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
```

This is also the canonical pattern shown in typescript-eslint's own docs for the `extends` short-hand.

---

### WR-02: `tseslint.config()` is deprecated — use ESLint's `defineConfig()` instead

**File:** `eslint.config.mjs:4`

**Issue:** The installed `typescript-eslint@8.61.1` marks `tseslint.config()` as `@deprecated`. The type definition explicitly states: _"ESLint core now provides this functionality via `defineConfig()`, which we now recommend instead."_ Using a deprecated helper means future major versions of `typescript-eslint` may remove it without a migration path.

**Fix:** Switch to ESLint's built-in `defineConfig()` (available in ESLint 9+, included in ESLint 10):

```js
// @ts-check
import { defineConfig } from "eslint";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    files: ["src/**/*.ts"],
    extends: [
      ...tseslint.configs.strict,
    ],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      "no-console": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
```

Note: `defineConfig()` does not support the `extends` short-hand natively — if migrating, expand `extends` manually or keep using `tseslint.config()` until typescript-eslint provides a `defineConfig`-compatible equivalent.

---

### WR-03: `typescript-eslint@8.61.1` peer dependency on TypeScript is narrower than the installed range

**File:** `package.json:26`

**Issue:** `typescript-eslint@8.61.1` declares `peerDependencies: { typescript: ">=4.8.4 <6.1.0" }`. The project pins `typescript: "^6.0.3"`, which today resolves to `6.0.3` (within range), but `^6.0.3` allows any `6.x.y` release. TypeScript `6.1.0` or higher will violate the peer dependency, causing peer dependency warnings or, depending on the package manager, install failures.

**Fix:** Either pin TypeScript below `6.1.0` explicitly, or upgrade to `typescript-eslint` v9+ which supports TypeScript 6.x without this restriction:

```json
// Option A: pin TypeScript upper bound
"typescript": ">=6.0.3 <6.1.0"

// Option B: upgrade typescript-eslint (if v9 is available and stable)
"typescript-eslint": "^9.0.0"
```

Check `typescript-eslint` v9 release availability before choosing option B.

---

## Info

### IN-01: Pre-commit hook uses `npx lint-staged` instead of the local binary

**File:** `.husky/pre-commit:4`

**Issue:** `npx lint-staged` resolves the binary via npm's registry-aware resolution, which adds latency and can pull a cached or mismatched version. `lint-staged` is already in `devDependencies`, so the local binary is always available. This project also uses Bun as its runtime, making `npx` an inconsistency.

**Fix:** Invoke the local binary directly:

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

./node_modules/.bin/lint-staged
```

Or, if staying consistent with Bun:

```sh
bunx lint-staged
```

---

### IN-02: `no-console: "warn"` applies globally due to the scoping issue in WR-01

**File:** `eslint.config.mjs:21`

**Issue:** Because the custom rules object also lacks a `files` filter, `no-console` applies to any JavaScript or TypeScript file ESLint processes if someone runs `eslint .`. This is a consequence of WR-01 and will be resolved automatically if the fix from WR-01 is applied.

**Fix:** Addressed by applying the fix from WR-01 (move all rules into the scoped config object).

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
