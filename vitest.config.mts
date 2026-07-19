import {
  fileURLToPath,
} from "node:url";

import react from "@vitejs/plugin-react";

import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  plugins: [
    /*
     * CheckoutClient-এর মতো TSX component
     * transform করার জন্য React plugin।
     */
    react(),
  ],

  resolve: {
    /*
     * Vite-এর native tsconfig path resolution।
     *
     * tsconfig.json-এর @/* alias test files-এ
     * resolve করবে।
     */
    tsconfigPaths:
      true,

    alias: {
      /*
       * Next.js-এর server-only package
       * Vitest Node environment-এ import
       * করার জন্য intentional test mock।
       */
      "server-only":
        fileURLToPath(
          new URL(
            "./src/test/mocks/server-only.ts",
            import.meta.url,
          ),
        ),
    },
  },

  test: {
    /*
     * API routes এবং server utilities-এর
     * default test environment।
     */
    environment:
      "node",

    globals:
      false,

    setupFiles: [
      "./src/test/setup.ts",
    ],

    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],

    exclude: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "e2e/**",
    ],

    clearMocks:
      true,

    mockReset:
      true,

    restoreMocks:
      true,

    unstubEnvs:
      true,

    unstubGlobals:
      true,

    testTimeout:
      10_000,

    hookTimeout:
      10_000,

    /*
     * CI-তে accidental test.only
     * test suite fail করবে।
     */
    allowOnly:
      !process.env.CI,

    passWithNoTests:
      false,

    coverage: {
      provider:
        "v8",

      reporter: [
        "text",
        "html",
        "json-summary",
      ],

      reportsDirectory:
        "./coverage",

      /*
       * শুধু checkout security-critical
       * production files coverage report-এ
       * অন্তর্ভুক্ত হবে।
       *
       * Vitest 4-এ explicit coverage.include
       * ব্যবহার করলে uncovered matching files-ও
       * report-এর অংশ হয়।
       */
      include: [
  "src/app/api/orders/route.ts",

  "src/app/api/orders/idempotency-status/route.ts",

  "src/app/api/health/checkout/route.ts",

  "src/app/api/health/live/route.ts",

  "src/components/checkout/CheckoutClient.tsx",

  "src/lib/order-idempotency.ts",

  "src/lib/checkout-rate-limit.ts",

  "src/lib/request-audit.ts",

  "src/lib/health-check.ts",

  "src/lib/health-dependencies.ts",
  "src/lib/health-monitoring.ts",
  "src/lib/browser-security-headers.ts",
  "src/lib/content-security-policy.ts",
  "src/app/api/security/csp-report/route.ts",
  "src/lib/csp-violation-analysis.ts",
  "src/lib/csp-report-protection.ts",
  "src/lib/csp-deployment.ts",
],

      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "src/test/**",
      ],

      /*
       * Initial security coverage gate।
       *
       * নতুন untested code যোগ হয়ে coverage
       * এই সীমার নিচে গেলে command fail করবে।
       */
      thresholds: {
        statements:
          65,

        branches:
          50,

        functions:
          65,

        lines:
          65,
      },
    },
  },
});