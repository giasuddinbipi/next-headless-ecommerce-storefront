import {
  fileURLToPath,
} from "node:url";

import react from "@vitejs/plugin-react";

import {
  defineConfig,
} from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    /*
     * tsconfig.json-এর @/* path alias
     * test files-এ resolve করবে।
     */
    tsconfigPaths(),

    /*
     * CheckoutClient-এর মতো TSX component
     * test করার জন্য React transform।
     */
    react(),
  ],

  resolve: {
    alias: {
      /*
       * Next.js server-only modules যেন
       * Vitest Node environment-এ import হয়।
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
     * Security tests প্রধানত API route এবং
     * server utility test করবে।
     */
    environment:
      "node",

    /*
     * Test functions প্রত্যেক test file-এ
     * explicitly import করা হবে।
     */
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

    /*
     * একটি test-এর mock অন্য test-এ
     * accidentalভাবে ব্যবহার হবে না।
     */
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
     * CI-তে accidental test.only commit
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
       * Task 48-এর security-critical files।
       */
      include: [
        "src/app/api/orders/route.ts",
        "src/app/api/orders/idempotency-status/route.ts",
        "src/lib/order-idempotency.ts",
        "src/lib/checkout-rate-limit.ts",
        "src/lib/request-audit.ts",
      ],

      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "src/test/**",
      ],
    },
  },
});