import {
  defineConfig,
  devices,
} from "@playwright/test";

/* =========================================================
   Runtime configuration
========================================================= */

const externalBaseUrl =
  process.env.E2E_BASE_URL
    ?.trim();

const localBaseUrl =
  "http://localhost:3100";

const baseUrl =
  externalBaseUrl ||
  localBaseUrl;

const isCi =
  Boolean(
    process.env.CI,
  );

/*
 * Playwright webServer.env expects string values.
 * Remove undefined values while preserving the current
 * shell environment for the spawned Next.js process.
 */
const inheritedEnvironment =
  Object.fromEntries(
    Object.entries(
      process.env,
    ).filter(
      (
        entry,
      ): entry is [
        string,
        string,
      ] =>
        typeof entry[1] ===
        "string",
    ),
  );

/* =========================================================
   Playwright configuration
========================================================= */

export default defineConfig({
  testDir:
    "./tests/e2e",

  outputDir:
    "./test-results",

  fullyParallel:
    true,

  forbidOnly:
    isCi,

  retries:
    isCi
      ? 2
      : 0,

  workers:
    isCi
      ? 1
      : undefined,

  timeout:
    30_000,

  expect: {
    timeout:
      10_000,
  },

  reporter: [
    [
      "list",
    ],

    [
      "html",
      {
        outputFolder:
          "playwright-report",

        open:
          "never",
      },
    ],
  ],

  use: {
    baseURL:
      baseUrl,

    trace:
      "retain-on-failure",

    screenshot:
      "only-on-failure",

    video:
      "retain-on-failure",

    actionTimeout:
      10_000,

    navigationTimeout:
      20_000,

    ignoreHTTPSErrors:
      false,
  },

  projects: [
    {
      name:
        "chromium",

      use: {
        ...devices[
          "Desktop Chrome"
        ],
      },
    },
  ],

  /*
   * E2E_BASE_URL means an external deployment is being
   * tested, so no local Next.js server is required.
   *
   * Otherwise, Playwright builds and starts the app on
   * port 3100 using a production server.
   */
  webServer:
    externalBaseUrl
      ? undefined
      : {
          command:
            "npm run build && npm run start -- -p 3100",

          url:
            localBaseUrl,

          reuseExistingServer:
            false,

          timeout:
            240_000,

          stdout:
            "pipe",

          stderr:
            "pipe",

          env: {
            ...inheritedEnvironment,

            /*
             * Auth.js must trust the Host header used by
             * the isolated local E2E production server.
             */
            AUTH_TRUST_HOST:
              "true",

            AUTH_URL:
              localBaseUrl,
          },
        },
});