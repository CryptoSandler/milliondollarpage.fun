import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    /*
      EVERY BUILD DIRECTORY, BY PATTERN RATHER THAN BY NAME.

      It used to list `.next` and `.next-e2e` one at a time, and on 2026-09-03 a
      third appeared — `.next-preview`, where the local preview server writes so
      its turbopack cache never lands in what a build reads. Nothing ignored it,
      so `npm run lint` walked a build output and reported **6,245 problems, 481
      of them errors**, none of which were in this repository's own code.

      `check-build-secrets` already treats these as a family — it scans `.next`
      and anything starting with `.next-` — and this is the same family said in
      the same way, so a fourth dist dir needs no fourth line here.
    */
    ".next*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
