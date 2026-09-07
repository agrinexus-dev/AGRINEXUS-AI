import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // `tests/**` is plain Playwright test code, not React. `next/core-web-vitals`
  // pulls in `eslint-plugin-react-hooks`, whose `rules-of-hooks` rule false-positives
  // on `@playwright/test`'s own fixture callback parameter, which Playwright
  // itself names `use` (colliding with React's `use()` naming convention
  // this rule enforces) — a well-known friction point, not a real hooks
  // violation, since `tests/` contains no React components or hooks at all.
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];

export default eslintConfig;
