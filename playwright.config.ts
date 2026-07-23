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

const isExternalTarget =
  Boolean(
    externalBaseUrl,
  );

/*
 * Playwright webServer.env requires string values.
 * Remove undefined entries while preserving the current
 * environment for the spawned local Next.js process.
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

  /*
   * Local E2E tests may run in parallel.
   *
   * External deployment tests run sequentially to avoid
   * sending multiple expensive SSR requests at once.
   */
  fullyParallel:
    !isExternalTarget,

  forbidOnly:
    isCi,

  retries:
    isCi
      ? 2
      : isExternalTarget
        ? 1
        : 0,

  workers:
    isCi ||
    isExternalTarget
      ? 1
      : undefined,

  timeout:
    isExternalTarget
      ? 90_000
      : 30_000,

  expect: {
    timeout:
      isExternalTarget
        ? 20_000
        : 10_000,
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
      isExternalTarget
        ? 20_000
        : 10_000,

    navigationTimeout:
      isExternalTarget
        ? 60_000
        : 20_000,

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
   * When E2E_BASE_URL is configured, Playwright tests the
   * external deployment and does not start a local server.
   *
   * Otherwise, it builds the application and starts a
   * production Next.js server on port 3100.
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
             * Trust the isolated local E2E server host so
             * Auth.js session requests do not return 500.
             */
            AUTH_TRUST_HOST:
              "true",

            AUTH_URL:
              localBaseUrl,

            /*
             * Keep local E2E execution in the safe CSP
             * compatibility configuration.
             */
            STRICT_CSP_RUNTIME_MODE:
              "disabled",

            CSP_DEPLOYMENT_MODE:
              "report-only",
          },
        },
});