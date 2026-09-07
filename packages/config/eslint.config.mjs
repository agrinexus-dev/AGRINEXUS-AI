import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Shared base ESLint flat config for AgriNexus AI workspace packages. */
export const baseConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", ".next/**", "node_modules/**", "coverage/**"],
  },
);

export default baseConfig;
