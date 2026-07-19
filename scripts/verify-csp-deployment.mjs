import nextEnv from "@next/env";

import {
  CSP_ENFORCE_MODE,
  resolveExpectedCspMode,
  validateCspDeploymentHeaders,
} from "./lib/csp-deployment-verifier.mjs";

/* =========================================================
   Environment loading
========================================================= */

const {
  loadEnvConfig,
} = nextEnv;

if (
  typeof loadEnvConfig !==
  "function"
) {
  throw new Error(
    "@next/env did not provide loadEnvConfig.",
  );
}

loadEnvConfig(
  process.cwd(),
);

/* =========================================================
   Constants
========================================================= */

const DEFAULT_BASE_URL =
  "http://localhost:3000";

const DEFAULT_TIMEOUT_MS =
  15_000;

const DEFAULT_ROUTES = [
  "/",
  "/shop",
  "/cart",
  "/checkout",
  "/account",
];

/* =========================================================
   State
========================================================= */

let passedChecks =
  0;

let warningChecks =
  0;

let failedChecks =
  0;

const routeResults =
  [];

/* =========================================================
   Output helpers
========================================================= */

function writePass(
  message,
) {
  passedChecks +=
    1;

  console.log(
    `[PASS] ${message}`,
  );
}

function writeWarning(
  message,
) {
  warningChecks +=
    1;

  console.warn(
    `[WARN] ${message}`,
  );
}

function writeFailure(
  message,
) {
  failedChecks +=
    1;

  console.error(
    `[FAIL] ${message}`,
  );
}

function writeSection(
  title,
) {
  console.log(
    "",
  );

  console.log(
    `=== ${title} ===`,
  );
}

/* =========================================================
   Environment helpers
========================================================= */

function readFirstNonEmptyEnvironmentValue(
  names,
) {
  for (
    const name of names
  ) {
    const value =
      process.env[
        name
      ]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function parsePositiveInteger(
  value,
  fallback,
) {
  if (!value) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }

  return parsed;
}

function normalizeBaseUrl(
  value,
) {
  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        value.trim(),
      );
  } catch {
    throw new Error(
      `Invalid CSP verification base URL: ${value}`,
    );
  }

  if (
    parsedUrl.protocol !==
      "http:" &&
    parsedUrl.protocol !==
      "https:"
  ) {
    throw new Error(
      "CSP verification URL must use HTTP or HTTPS.",
    );
  }

  parsedUrl.pathname =
    "/";

  parsedUrl.search =
    "";

  parsedUrl.hash =
    "";

  return parsedUrl
    .toString()
    .replace(
      /\/$/,
      "",
    );
}

function parseRoutes(
  value,
) {
  if (!value) {
    return [
      ...DEFAULT_ROUTES,
    ];
  }

  const routes =
    value
      .split(
        ",",
      )
      .map(
        (
          route,
        ) =>
          route.trim(),
      )
      .filter(
        Boolean,
      )
      .map(
        (
          route,
        ) =>
          route.startsWith(
            "/",
          )
            ? route
            : `/${route}`,
      );

  return (
    routes.length >
    0
      ? [
          ...new Set(
            routes,
          ),
        ]
      : [
          ...DEFAULT_ROUTES,
        ]
  );
}

function isLoopbackHostname(
  hostname,
) {
  const normalized =
    hostname.toLowerCase();

  return (
    normalized ===
      "localhost" ||
    normalized ===
      "127.0.0.1" ||
    normalized ===
      "::1" ||
    normalized ===
      "[::1]"
  );
}

/* =========================================================
   Fetch helper
========================================================= */

async function fetchWithTimeout(
  url,
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        method:
          "GET",

        redirect:
          "follow",

        signal:
          controller.signal,

        headers: {
          Accept:
            "text/html,application/xhtml+xml",

          "Cache-Control":
            "no-cache",

          "User-Agent":
            "storefront-csp-deployment-verifier/1.0",
        },
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/* =========================================================
   Route verification
========================================================= */

async function verifyRoute(
  route,
) {
  writeSection(
    `Route ${route}`,
  );

  const targetUrl =
    new URL(
      route,
      `${baseUrl}/`,
    );

  const startedAt =
    Date.now();

  let response;

  try {
    response =
      await fetchWithTimeout(
        targetUrl,
      );
  } catch (
    error
  ) {
    const errorName =
      error instanceof Error
        ? error.name
        : "UnknownError";

    writeFailure(
      `${route}: request failed with ${errorName}.`,
    );

    routeResults.push({
      route,

      status:
        "request-failed",

      durationMs:
        Date.now() -
        startedAt,

      mode:
        expectedMode,

      finalUrl:
        "unavailable",
    });

    return;
  }

  const durationMs =
    Date.now() -
    startedAt;

  if (
    response.status >=
    400
  ) {
    writeFailure(
      `${route}: returned HTTP ${response.status}.`,
    );
  } else {
    writePass(
      `${route}: returned HTTP ${response.status}.`,
    );
  }

  if (
    response.url !==
    targetUrl.toString()
  ) {
    writeWarning(
      `${route}: redirected to ${response.url}.`,
    );
  }

  const validation =
    validateCspDeploymentHeaders({
      headers:
        response.headers,

      expectedMode,

      requireProductionPolicy:
        isProductionTarget,
    });

  if (
    validation.activePolicy
  ) {
    writePass(
      `${route}: ${validation.activeHeaderName} is present.`,
    );
  }

  if (
    !response.headers.get(
      validation.oppositeHeaderName,
    )
  ) {
    writePass(
      `${route}: opposite CSP deployment header is absent.`,
    );
  }

  for (
    const warning of
    validation.warnings
  ) {
    writeWarning(
      `${route}: ${warning}`,
    );
  }

  for (
    const failure of
    validation.failures
  ) {
    writeFailure(
      `${route}: ${failure}`,
    );
  }

  if (
    validation.valid
  ) {
    writePass(
      `${route}: CSP deployment mode matches "${expectedMode}".`,
    );
  }

  routeResults.push({
    route,

    status:
      response.status,

    durationMs,

    mode:
      validation.valid
        ? expectedMode
        : "invalid",

    finalUrl:
      response.url,
  });
}

/* =========================================================
   Summary
========================================================= */

function printSummary() {
  writeSection(
    "Route summary",
  );

  console.table(
    routeResults.map(
      (
        result,
      ) => ({
        Route:
          result.route,

        Status:
          result.status,

        "Duration (ms)":
          result.durationMs,

        "Expected mode":
          expectedMode,

        Result:
          result.mode,

        "Final URL":
          result.finalUrl,
      }),
    ),
  );

  writeSection(
    "Final verification summary",
  );

  console.log(
    `Target: ${baseUrl}`,
  );

  console.log(
    `Expected CSP mode: ${expectedMode}`,
  );

  console.log(
    `Production-like target: ${String(isProductionTarget)}`,
  );

  console.log(
    `Routes verified: ${routes.length}`,
  );

  console.log(
    `Passed checks: ${passedChecks}`,
  );

  console.log(
    `Warnings: ${warningChecks}`,
  );

  console.log(
    `Failed checks: ${failedChecks}`,
  );

  if (
    failedChecks >
    0
  ) {
    console.error(
      "",
    );

    console.error(
      "CSP deployment verification failed.",
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    "",
  );

  console.log(
    `CSP "${expectedMode}" deployment verification completed successfully.`,
  );
}

/* =========================================================
   Runtime configuration
========================================================= */

const baseUrl =
  normalizeBaseUrl(
    readFirstNonEmptyEnvironmentValue([
      "CSP_VERIFY_BASE_URL",
      "CSP_AUDIT_BASE_URL",
      "HEALTH_BASE_URL",
    ]) ??
      DEFAULT_BASE_URL,
  );

const expectedMode =
  resolveExpectedCspMode(
    readFirstNonEmptyEnvironmentValue([
      "CSP_EXPECTED_DEPLOYMENT_MODE",
      "CSP_DEPLOYMENT_MODE",
    ]),
  );

const timeoutMs =
  parsePositiveInteger(
    readFirstNonEmptyEnvironmentValue([
      "CSP_VERIFY_TIMEOUT_MS",
    ]),
    DEFAULT_TIMEOUT_MS,
  );

const routes =
  parseRoutes(
    readFirstNonEmptyEnvironmentValue([
      "CSP_VERIFY_ROUTES",
    ]),
  );

const parsedBaseUrl =
  new URL(
    baseUrl,
  );

const isProductionTarget =
  parsedBaseUrl.protocol ===
    "https:" &&
  !isLoopbackHostname(
    parsedBaseUrl.hostname,
  );

/* =========================================================
   Main execution
========================================================= */

async function main() {
  console.log(
    "Storefront CSP Deployment Verification",
  );

  console.log(
    `Base URL: ${baseUrl}`,
  );

  console.log(
    `Expected mode: ${expectedMode}`,
  );

  console.log(
    `Timeout: ${timeoutMs}ms`,
  );

  console.log(
    `Routes: ${routes.join(", ")}`,
  );

  if (
    expectedMode ===
    CSP_ENFORCE_MODE
  ) {
    console.warn(
      "Enforcement verification mode is active. Use this against a controlled Preview deployment before Production.",
    );
  }

  for (
    const route of
    routes
  ) {
    await verifyRoute(
      route,
    );
  }

  printSummary();
}

main().catch(
  (
    error,
  ) => {
    const errorName =
      error instanceof Error
        ? error.name
        : "UnknownError";

    const message =
      error instanceof Error
        ? error.message
        : "Unknown verification error.";

    console.error(
      `[FATAL] ${errorName}: ${message}`,
    );

    process.exitCode =
      1;
  },
);