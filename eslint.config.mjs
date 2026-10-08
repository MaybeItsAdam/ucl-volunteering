import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "apps-script/**",
    "maps/**",
    "next-env.d.ts",
    // The Capacitor shells: native projects, generated bridge JS, and gems.
    "android/**",
    "ios/**",
    "capacitor-dist/**",
    "vendor/**",
    ".claude/**",
  ]),
]);
