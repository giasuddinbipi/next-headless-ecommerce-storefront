#!/usr/bin/env node

import nextEnv from "@next/env";

const {
  loadEnvConfig,
} = nextEnv;

/*
 * Next.js-এর .env, .env.local এবং environment-specific
 * files load করা হচ্ছে।
 */
loadEnvConfig(
  process.cwd(),
);

/* =========================================================
   Constants
========================================================= */

const DEFAULT_BASE_URL =
  "http://localhost:3000";

const DEFAULT_TIMEOUT_MS =
  5_000;

const DEFAULT_RETRIES =
  3;

const DEFAULT_RETRY_DELAY_MS =
  1_000;

const MINIMUM_TOKEN_LENGTH =
  32;

const MAXIMUM_TOKEN_LENGTH =
  512;

const MAXIMUM_ERROR_TEXT_LENGTH =
  240;

/* =========================================================
   Environment parsing
========================================================= */

function readNonEmptyEnvironmentValue(
  name,
) {
  const value =
    process.env[name]
      ?.trim();

  return value || null;
}

function readIntegerEnvironmentValue({
  name,
  fallback,
  minimum,
  maximum,
}) {
  const rawValue =
    readNonEmptyEnvironmentValue(
      name,
    );

  if (!rawValue) {
    return fallback;
  }

  const parsedValue =
    Number.parseInt(
      rawValue,
      10,
    );

  if (
    !Number.isFinite(
      parsedValue,
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      parsedValue,
      minimum,
    ),
    maximum,
  );
}

function normalizeBaseUrl(
  rawValue,
) {
  let url;

  try {
    url =
      new URL(
        rawValue,
      );
  } catch {
    throw new Error(
      "HEALTH_BASE_URL must be a valid URL.",
    );
  }

  if (
    url.protocol !==
      "http:" &&
    url.protocol !==
      "https:"
  ) {
    throw new Error(
      "HEALTH_BASE_URL must use HTTP or HTTPS.",
    );
  }

  url.search =
    "";

  url.hash =
    "";

  url.pathname =
    url.pathname.replace(
      /\/+$/,
      "",
    );

  return url
    .toString()
    .replace(
      /\/$/,
      "",
    );
}

/* =========================================================
   Runtime configuration
========================================================= */

function readConfiguration() {
  const baseUrl =
    normalizeBaseUrl(
      readNonEmptyEnvironmentValue(
        "HEALTH_BASE_URL",
      ) ??
        DEFAULT_BASE_URL,
    );

  const token =
    readNonEmptyEnvironmentValue(
      "HEALTH_CHECK_TOKEN",
    );

  if (
    !token ||
    token.length <
      MINIMUM_TOKEN_LENGTH ||
    token.length >
      MAXIMUM_TOKEN_LENGTH
  ) {
    throw new Error(
      "HEALTH_CHECK_TOKEN must contain between 32 and 512 characters.",
    );
  }

  return {
    baseUrl,
    token,

    timeoutMs:
      readIntegerEnvironmentValue({
        name:
          "HEALTH_VERIFY_TIMEOUT_MS",

        fallback:
          DEFAULT_TIMEOUT_MS,

        minimum:
          500,

        maximum:
          30_000,
      }),

    retries:
      readIntegerEnvironmentValue({
        name:
          "HEALTH_VERIFY_RETRIES",

        fallback:
          DEFAULT_RETRIES,

        minimum:
          1,

        maximum:
          10,
      }),

    retryDelayMs:
      readIntegerEnvironmentValue({
        name:
          "HEALTH_VERIFY_RETRY_DELAY_MS",

        fallback:
          DEFAULT_RETRY_DELAY_MS,

        minimum:
          100,

        maximum:
          10_000,
      }),
  };
}

/* =========================================================
   Safe output helpers
========================================================= */

function sanitizeOutputText(
  value,
  fallback =
    "Unknown error.",
) {
  const normalized =
    String(
      value ?? "",
    )
      .replace(
        /[\r\n\t]+/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(
    0,
    MAXIMUM_ERROR_TEXT_LENGTH,
  );
}

function logPass(
  message,
) {
  console.log(
    `[PASS] ${message}`,
  );
}

function logFail(
  message,
) {
  console.error(
    `[FAIL] ${message}`,
  );
}

function logInfo(
  message,
) {
  console.log(
    `[INFO] ${message}`,
  );
}

function wait(
  milliseconds,
) {
  return new Promise(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

/* =========================================================
   HTTP request helper
========================================================= */

async function fetchJson({
  url,
  timeoutMs,
  token,
}) {
  const controller =
    new AbortController();

  const timeoutHandle =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );

  try {
    const headers = {
      Accept:
        "application/json",

      "User-Agent":
        "storefront-health-verifier/1.0",
    };

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers,

          cache:
            "no-store",

          redirect:
            "manual",

          signal:
            controller.signal,
        },
      );

    const contentType =
      response.headers.get(
        "content-type",
      ) ??
      "";

    let body =
      null;

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      try {
        body =
          await response.json();
      } catch {
        throw new Error(
          "Endpoint returned invalid JSON.",
        );
      }
    } else {
      const text =
        await response.text();

      throw new Error(
        `Expected JSON but received ${sanitizeOutputText(
          text,
          "a non-JSON response",
        )}.`,
      );
    }

    return {
      response,
      body,
    };
  } catch (
    error
  ) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        `Request timed out after ${timeoutMs}ms.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timeoutHandle,
    );
  }
}

/* =========================================================
   Response validation helpers
========================================================= */

function isRecord(
  value,
) {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function requireRecord(
  value,
  label,
) {
  if (!isRecord(value)) {
    throw new Error(
      `${label} did not return a JSON object.`,
    );
  }

  return value;
}

function requireHeader({
  response,
  name,
  expectedValue,
}) {
  const actualValue =
    response.headers.get(
      name,
    );

  if (
    actualValue !==
    expectedValue
  ) {
    throw new Error(
      `${name} header must be "${expectedValue}".`,
    );
  }

  return actualValue;
}

function requireNoStoreHeader(
  response,
) {
  const cacheControl =
    response.headers.get(
      "cache-control",
    ) ??
    "";

  if (
    !cacheControl
      .toLowerCase()
      .includes(
        "no-store",
      )
  ) {
    throw new Error(
      "Cache-Control header must include no-store.",
    );
  }
}

/* =========================================================
   Liveness verification
========================================================= */

async function verifyLiveness({
  baseUrl,
  timeoutMs,
}) {
  const url =
    `${baseUrl}/api/health/live`;

  const {
    response,
    body: rawBody,
  } =
    await fetchJson({
      url,
      timeoutMs,
    });

  const body =
    requireRecord(
      rawBody,
      "Liveness endpoint",
    );

  if (
    response.status !==
    200
  ) {
    throw new Error(
      `Liveness endpoint returned HTTP ${response.status}.`,
    );
  }

  requireHeader({
    response,

    name:
      "x-health-check-type",

    expectedValue:
      "liveness",
  });

  requireNoStoreHeader(
    response,
  );

  if (
    body.status !==
      "alive" ||
    body.check !==
      "liveness"
  ) {
    throw new Error(
      "Liveness endpoint returned an unexpected status.",
    );
  }

  if (
    typeof body.checkedAt !==
    "string"
  ) {
    throw new Error(
      "Liveness endpoint did not return checkedAt.",
    );
  }

  return {
    status:
      body.status,

    checkedAt:
      body.checkedAt,
  };
}

/* =========================================================
   Readiness verification
========================================================= */

function validateDependencies(
  value,
) {
  if (
    !Array.isArray(
      value,
    ) ||
    value.length ===
      0
  ) {
    throw new Error(
      "Readiness endpoint did not return dependency results.",
    );
  }

  return value.map(
    (
      dependency,
    ) => {
      const item =
        requireRecord(
          dependency,
          "Readiness dependency",
        );

      if (
        typeof item.name !==
          "string" ||
        typeof item.status !==
          "string"
      ) {
        throw new Error(
          "Readiness dependency result is malformed.",
        );
      }

      return {
        name:
          sanitizeOutputText(
            item.name,
            "unknown",
          ),

        status:
          sanitizeOutputText(
            item.status,
            "unknown",
          ),

        latencyMs:
          typeof item.latencyMs ===
            "number"
            ? Math.max(
                0,
                Math.round(
                  item.latencyMs,
                ),
              )
            : null,

        code:
          typeof item.code ===
            "string"
            ? sanitizeOutputText(
                item.code,
              )
            : null,
      };
    },
  );
}

async function verifyReadiness({
  baseUrl,
  timeoutMs,
  token,
}) {
  const url =
    `${baseUrl}/api/health/checkout`;

  const {
    response,
    body: rawBody,
  } =
    await fetchJson({
      url,
      timeoutMs,
      token,
    });

  const body =
    requireRecord(
      rawBody,
      "Readiness endpoint",
    );

  requireHeader({
    response,

    name:
      "x-health-check-type",

    expectedValue:
      "readiness",
  });

  requireNoStoreHeader(
    response,
  );

  const responseRequestId =
    response.headers.get(
      "x-request-id",
    );

  if (
    !responseRequestId
  ) {
    throw new Error(
      "Readiness endpoint did not return X-Request-Id.",
    );
  }

  if (
    typeof body.requestId !==
      "string" ||
    body.requestId !==
      responseRequestId
  ) {
    throw new Error(
      "Readiness request ID does not match its response header.",
    );
  }

  const dependencies =
    validateDependencies(
      body.dependencies,
    );

  if (
    response.status !==
      200 ||
    body.status !==
      "healthy"
  ) {
    const dependencySummary =
      dependencies
        .map(
          (
            dependency,
          ) =>
            `${dependency.name}:${dependency.status}`,
        )
        .join(
          ", ",
        );

    throw new Error(
      `Readiness failed with HTTP ${response.status}, status ${sanitizeOutputText(
        body.status,
        "unknown",
      )}, dependencies ${dependencySummary}.`,
    );
  }

  const unhealthyDependency =
    dependencies.find(
      (
        dependency,
      ) =>
        dependency.status !==
        "healthy",
    );

  if (
    unhealthyDependency
  ) {
    throw new Error(
      `Dependency ${unhealthyDependency.name} reported ${unhealthyDependency.status}.`,
    );
  }

  return {
    status:
      body.status,

    requestId:
      responseRequestId,

    environment:
      typeof body.environment ===
        "string"
        ? sanitizeOutputText(
            body.environment,
          )
        : "unknown",

    release:
      typeof body.release ===
        "string"
        ? sanitizeOutputText(
            body.release,
          )
        : null,

    dependencies,
  };
}

/* =========================================================
   Retry runner
========================================================= */

async function runWithRetry({
  label,
  retries,
  retryDelayMs,
  operation,
}) {
  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <= retries;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (
      error
    ) {
      lastError =
        error;

      const message =
        error instanceof Error
          ? error.message
          : "Unknown verification error.";

      if (
        attempt <
        retries
      ) {
        logInfo(
          `${label} attempt ${attempt}/${retries} failed: ${sanitizeOutputText(
            message,
          )}`,
        );

        await wait(
          retryDelayMs,
        );
      }
    }
  }

  throw (
    lastError ??
    new Error(
      `${label} verification failed.`,
    )
  );
}

/* =========================================================
   Main verification
========================================================= */

async function main() {
  const configuration =
    readConfiguration();

  logInfo(
    `Verifying storefront health at ${configuration.baseUrl}`,
  );

  const liveness =
    await runWithRetry({
      label:
        "Liveness",

      retries:
        configuration.retries,

      retryDelayMs:
        configuration.retryDelayMs,

      operation:
        () =>
          verifyLiveness({
            baseUrl:
              configuration.baseUrl,

            timeoutMs:
              configuration.timeoutMs,
          }),
    });

  logPass(
    `Liveness is ${liveness.status}.`,
  );

  const readiness =
    await runWithRetry({
      label:
        "Readiness",

      retries:
        configuration.retries,

      retryDelayMs:
        configuration.retryDelayMs,

      operation:
        () =>
          verifyReadiness({
            baseUrl:
              configuration.baseUrl,

            timeoutMs:
              configuration.timeoutMs,

            token:
              configuration.token,
          }),
    });

  logPass(
    `Readiness is ${readiness.status}.`,
  );

  logInfo(
    `Request ID: ${readiness.requestId}`,
  );

  logInfo(
    `Environment: ${readiness.environment}`,
  );

  if (
    readiness.release
  ) {
    logInfo(
      `Release: ${readiness.release}`,
    );
  }

  for (
    const dependency of
    readiness.dependencies
  ) {
    const latency =
      dependency.latencyMs ===
      null
        ? "unknown latency"
        : `${dependency.latencyMs}ms`;

    const code =
      dependency.code
        ? `, ${dependency.code}`
        : "";

    logPass(
      `${dependency.name}: ${dependency.status} (${latency}${code})`,
    );
  }

  console.log(
    "",
  );

  logPass(
    "Checkout health verification completed successfully.",
  );
}

main().catch(
  (
    error,
  ) => {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown verification error.";

    console.log(
      "",
    );

    logFail(
      sanitizeOutputText(
        message,
      ),
    );

    process.exitCode =
      1;
  },
);