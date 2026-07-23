import nextEnv from "@next/env";

import {
  createVercelPreviewAccessHeaders,
  hasVercelPreviewAccessSecret,
} from "./lib/vercel-preview-access.mjs";

import {
  resolveExpectedStrictCspMode,
  validateStrictCspDeployment,
} from "./lib/strict-csp-deployment-verifier.mjs";

/* =========================================================
   Environment loading
========================================================= */

const {
  loadEnvConfig,
} = nextEnv;

loadEnvConfig(
  process.cwd(),
);

/* =========================================================
   Defaults
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
   Result counters
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
   Output
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

function normalizeBaseUrl(
  value,
) {
  const parsedUrl =
    new URL(
      value.trim(),
    );

  if (
    parsedUrl.protocol !==
      "http:" &&
    parsedUrl.protocol !==
      "https:"
  ) {
    throw new Error(
      "Strict CSP verification URL must use HTTP or HTTPS.",
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

  return [
    ...new Set(
      routes,
    ),
  ];
}

function parseTimeout(
  value,
) {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed =
    Number.parseInt(
      value,
      10,
    );

  return (
    Number.isFinite(
      parsed,
    ) &&
    parsed >
      0
      ? parsed
      : DEFAULT_TIMEOUT_MS
  );
}

function isProductionLikeTarget(
  url,
) {
  const parsedUrl =
    new URL(
      url,
    );

  return (
    parsedUrl.protocol ===
      "https:" &&
    parsedUrl.hostname !==
      "localhost" &&
    parsedUrl.hostname !==
      "127.0.0.1"
  );
}

/* =========================================================
   Runtime configuration
========================================================= */

const baseUrl =
  normalizeBaseUrl(
    readFirstNonEmptyEnvironmentValue([
      "STRICT_CSP_VERIFY_BASE_URL",
      "CSP_VERIFY_BASE_URL",
    ]) ??
      DEFAULT_BASE_URL,
  );

const expectedMode =
  resolveExpectedStrictCspMode(
    readFirstNonEmptyEnvironmentValue([
      "STRICT_CSP_EXPECTED_MODE",
      "STRICT_CSP_RUNTIME_MODE",
    ]),
  );

const routes =
  parseRoutes(
    readFirstNonEmptyEnvironmentValue([
      "STRICT_CSP_VERIFY_ROUTES",
    ]),
  );

const timeoutMs =
  parseTimeout(
    readFirstNonEmptyEnvironmentValue([
      "STRICT_CSP_VERIFY_TIMEOUT_MS",
    ]),
  );

const bypassSecret =
  readFirstNonEmptyEnvironmentValue([
    "STRICT_CSP_VERIFY_BYPASS_SECRET",
    "CSP_VERIFY_BYPASS_SECRET",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
  ]);

const previewAccessHeaders =
  createVercelPreviewAccessHeaders(
    bypassSecret,
  );

const bypassConfigured =
  hasVercelPreviewAccessSecret(
    bypassSecret,
  );

const productionLikeTarget =
  isProductionLikeTarget(
    baseUrl,
  );

/* =========================================================
   Fetch
========================================================= */

async function fetchRoute(
  route,
) {
  const targetUrl =
    new URL(
      route,
      `${baseUrl}/`,
    );

  targetUrl.searchParams.set(
    "__strict_csp_verify",
    `${Date.now()}-${Math.random()}`,
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        targetUrl,
        {
          method:
            "GET",

          redirect:
            "follow",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            Accept:
              "text/html,application/xhtml+xml",

            "Cache-Control":
              "no-cache, no-store",

            "User-Agent":
              "storefront-strict-csp-verifier/1.0",

            ...previewAccessHeaders,
          },
        },
      );

    const html =
      await response.text();

    return {
      response,
      html,
      targetUrl,
    };
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

  const startedAt =
    Date.now();

  let result;

  try {
    result =
      await fetchRoute(
        route,
      );
  } catch (
    error
  ) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Unknown request failure.";

    writeFailure(
      `${route}: request failed with ${message}`,
    );

    routeResults.push({
      route,
      status:
        "request-failed",
      durationMs:
        Date.now() -
        startedAt,
      nonce:
        "unavailable",
      result:
        "failed",
      finalUrl:
        "unavailable",
    });

    return null;
  }

  const {
    response,
    html,
    targetUrl,
  } = result;

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

  const expectedOrigin =
    new URL(
      baseUrl,
    ).origin;

  const finalOrigin =
    new URL(
      response.url,
    ).origin;

  if (
    finalOrigin !==
    expectedOrigin
  ) {
    writeFailure(
      `${route}: redirected outside the target deployment to ${response.url}.`,
    );
  } else if (
    response.url !==
    targetUrl.toString()
  ) {
    writeWarning(
      `${route}: finished at ${response.url}.`,
    );
  }

  const contentType =
    response.headers.get(
      "content-type",
    ) ??
    "";

  if (
    contentType.includes(
      "text/html",
    )
  ) {
    writePass(
      `${route}: returned HTML content.`,
    );
  } else {
    writeFailure(
      `${route}: expected text/html but received "${contentType || "missing"}".`,
    );
  }

  const validation =
    validateStrictCspDeployment({
      headers:
        response.headers,

      html,

      expectedMode,

      requireProductionPolicy:
        productionLikeTarget,
    });

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
      `${route}: strict CSP and rendered nonce are valid.`,
    );
  }

  routeResults.push({
    route,
    status:
      response.status,
    durationMs,
    nonce:
      validation.nonce ??
      "missing",
    result:
      validation.valid
        ? "valid"
        : "invalid",
    finalUrl:
      response.url,
  });

  return validation.nonce;
}

/* =========================================================
   Nonce uniqueness
========================================================= */

function verifyNonceUniqueness(
  nonces,
) {
  writeSection(
    "Nonce uniqueness",
  );

  const availableNonces =
    nonces.filter(
      (
        nonce,
      ) =>
        typeof nonce ===
          "string" &&
        nonce.length >
          0,
    );

  if (
    availableNonces.length !==
    routes.length
  ) {
    writeFailure(
      "One or more routes did not produce a verifiable nonce.",
    );

    return;
  }

  const uniqueNonces =
    new Set(
      availableNonces,
    );

  if (
    uniqueNonces.size !==
    availableNonces.length
  ) {
    writeFailure(
      "Two or more requests received the same CSP nonce.",
    );

    return;
  }

  writePass(
    `All ${availableNonces.length} route requests received unique nonces.`,
  );
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

        Nonce:
          result.nonce,

        Result:
          result.result,

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
    `Expected strict CSP mode: ${expectedMode}`,
  );

  console.log(
    `Preview protection bypass: ${
      bypassConfigured
        ? "configured"
        : "not configured"
    }`,
  );

  console.log(
    `Production-like target: ${String(productionLikeTarget)}`,
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
      "Strict CSP deployment verification failed.",
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    "",
  );

  console.log(
    `Strict CSP "${expectedMode}" deployment verification completed successfully.`,
  );
}

/* =========================================================
   Main
========================================================= */

async function main() {
  console.log(
    "Storefront Strict CSP Deployment Verification",
  );

  console.log(
    `Base URL: ${baseUrl}`,
  );

  console.log(
    `Expected mode: ${expectedMode}`,
  );

  console.log(
    `Preview protection bypass: ${
      bypassConfigured
        ? "configured"
        : "not configured"
    }`,
  );

  const nonces =
    [];

  for (
    const route of
    routes
  ) {
    const nonce =
      await verifyRoute(
        route,
      );

    nonces.push(
      nonce,
    );
  }

  verifyNonceUniqueness(
    nonces,
  );

  printSummary();
}

main().catch(
  (
    error,
  ) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Unknown fatal error.";

    console.error(
      `[FATAL] ${message}`,
    );

    process.exitCode =
      1;
  },
);