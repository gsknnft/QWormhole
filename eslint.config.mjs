import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.config(eslint.configs.recommended, tseslint.configs.recommended),
  {
    ignores: ["*", "!src/", "src/wasm/*", "!src/wasm/wavelib.d.ts"],
  },
  {
    rules: {
      "no-unused-vars": "off",
      "prefer-const": "warn",
      "no-empty": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-as-const": "warn",
    },
  },
];
