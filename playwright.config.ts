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

const previewBypassSecret =
  process.env
    .STRICT_CSP_VERIFY_BYPASS_SECRET
    ?.trim();

/*
 * Playwright webServer.env requires string values.
 * Remove undefined values while preserving the current
 * environment for the local Next.js process.
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
  ) as Record<
    string,
    string
  >;

/*
 * Headers used only for external Preview or Production
 * deployments.
 *
 * x-vercel-skip-toolbar prevents Vercel Toolbar resources
 * from interfering with strict CSP tests.
 *
 * The protection-bypass headers allow Playwright to access
 * protected Preview deployments.
 */
const externalExtraHttpHeaders:
  Record<
    string,
    string
  > |
  undefined =
  isExternalTarget
    ? {
        "x-vercel-skip-toolbar":
          "1",

        ...(previewBypassSecret
          ? {
              "x-vercel-protection-bypass":
                previewBypassSecret,

              "x-vercel-set-bypass-cookie":
                "true",
            }
          : {}),
      }
    : undefined;

/* =========================================================
   Playwright configuration
========================================================= */

export default defineConfig({
  testDir:
    "./tests/e2e",

  outputDir:
    "./test-results",

  /*
   * Local tests can run in parallel.
   *
   * External deployments run sequentially to avoid several
   * expensive SSR requests running simultaneously.
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

    /*
     * For external deployments this disables Vercel Toolbar
     * and authenticates protected Preview requests.
     */
    extraHTTPHeaders:
      externalExtraHttpHeaders,

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
   * When E2E_BASE_URL exists, Playwright tests that external
   * deployment and does not start a local server.
   *
   * Otherwise, Playwright builds the project and starts a
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
             * Allow Auth.js to accept the isolated local
             * E2E server host.
             */
            AUTH_TRUST_HOST:
              "true",

            AUTH_URL:
              localBaseUrl,

            /*
             * Local E2E tests use compatibility CSP.
             * Strict enforcement is tested against Preview
             * and Production deployments.
             */
            STRICT_CSP_RUNTIME_MODE:
              "disabled",

            CSP_DEPLOYMENT_MODE:
              "report-only",
          },
        },
});