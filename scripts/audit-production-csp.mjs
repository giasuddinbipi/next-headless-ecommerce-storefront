import nextEnv from "@next/env";

const {
  loadEnvConfig,
} = nextEnv;
/* =========================================================
   Environment loading
========================================================= */

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

const EXPECTED_REPORT_URI =
  "/api/security/csp-report";

const WOOCOMMERCE_CMS_ORIGIN =
  "https://cms.globalizedhost.com";

const REQUIRED_SECURITY_HEADERS = {
  "x-content-type-options":
    "nosniff",

  "x-frame-options":
    "DENY",

  "referrer-policy":
    "strict-origin-when-cross-origin",

  "cross-origin-opener-policy":
    "same-origin-allow-popups",

  "x-dns-prefetch-control":
    "off",

  "x-permitted-cross-domain-policies":
    "none",
};

const REQUIRED_POLICY_DIRECTIVES = {
  "default-src": [
    "'self'",
  ],

  "base-uri": [
    "'self'",
  ],

  "object-src": [
    "'none'",
  ],

  "frame-ancestors": [
    "'none'",
  ],

  "frame-src": [
    "'none'",
  ],

  "form-action": [
    "'self'",
  ],

  "script-src": [
    "'self'",
    "'unsafe-inline'",
  ],

  "style-src": [
    "'self'",
    "'unsafe-inline'",
  ],

  "img-src": [
    "'self'",
    "data:",
    "blob:",
    WOOCOMMERCE_CMS_ORIGIN,
  ],

  "font-src": [
    "'self'",
    "data:",
  ],

  "connect-src": [
    "'self'",
    WOOCOMMERCE_CMS_ORIGIN,
  ],

  "media-src": [
    "'self'",
    "blob:",
  ],

  "worker-src": [
    "'self'",
    "blob:",
  ],

  "manifest-src": [
    "'self'",
  ],

  "report-uri": [
    EXPECTED_REPORT_URI,
  ],
};

/* =========================================================
   Audit state
========================================================= */

let passedChecks =
  0;

let warningChecks =
  0;

let failedChecks =
  0;

const routeSummaries =
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

  const parsedValue =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isFinite(
      parsedValue,
    ) ||
    parsedValue <=
      0
  ) {
    return fallback;
  }

  return parsedValue;
}

function normalizeBaseUrl(
  value,
) {
  const candidate =
    value.trim();

  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        candidate,
      );
  } catch {
    throw new Error(
      `Invalid CSP audit base URL: ${candidate}`,
    );
  }

  if (
    parsedUrl.protocol !==
      "http:" &&
    parsedUrl.protocol !==
      "https:"
  ) {
    throw new Error(
      "CSP audit base URL must use HTTP or HTTPS.",
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

  if (
    routes.length ===
    0
  ) {
    return [
      ...DEFAULT_ROUTES,
    ];
  }

  return [
    ...new Set(
      routes,
    ),
  ];
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
   Fetch helpers
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      auditTimeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        ...options,

        signal:
          controller.signal,

        redirect:
          options.redirect ??
          "follow",

        headers: {
          "User-Agent":
            "storefront-csp-audit/1.0",

          "Cache-Control":
            "no-cache",

          ...options.headers,
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
   CSP parsing
========================================================= */

function parseContentSecurityPolicy(
  policy,
) {
  const directives =
    new Map();

  const serializedDirectives =
    policy
      .split(
        ";",
      )
      .map(
        (
          directive,
        ) =>
          directive.trim(),
      )
      .filter(
        Boolean,
      );

  for (
    const serializedDirective of
    serializedDirectives
  ) {
    const [
      rawName,
      ...rawValues
    ] =
      serializedDirective.split(
        /\s+/,
      );

    const name =
      rawName
        ?.trim()
        .toLowerCase();

    if (!name) {
      continue;
    }

    const values =
      rawValues
        .map(
          (
            value,
          ) =>
            value.trim(),
        )
        .filter(
          Boolean,
        );

    directives.set(
      name,
      values,
    );
  }

  return directives;
}

function hasDirectiveValue(
  directives,
  directiveName,
  expectedValue,
) {
  const values =
    directives.get(
      directiveName,
    );

  return (
    Array.isArray(
      values,
    ) &&
    values.includes(
      expectedValue,
    )
  );
}

function checkRequiredDirective({
  route,
  directives,
  directiveName,
  expectedValues,
}) {
  if (
    !directives.has(
      directiveName,
    )
  ) {
    writeFailure(
      `${route}: CSP directive "${directiveName}" is missing.`,
    );

    return;
  }

  for (
    const expectedValue of
    expectedValues
  ) {
    if (
      hasDirectiveValue(
        directives,
        directiveName,
        expectedValue,
      )
    ) {
      writePass(
        `${route}: ${directiveName} includes ${expectedValue}.`,
      );

      continue;
    }

    writeFailure(
      `${route}: ${directiveName} does not include ${expectedValue}.`,
    );
  }
}

/* =========================================================
   Header validation
========================================================= */

function validateSecurityHeaders({
  route,
  response,
}) {
  for (
    const [
      headerName,
      expectedValue,
    ] of Object.entries(
      REQUIRED_SECURITY_HEADERS,
    )
  ) {
    const actualValue =
      response.headers.get(
        headerName,
      );

    if (
      actualValue ===
      expectedValue
    ) {
      writePass(
        `${route}: ${headerName} is correctly configured.`,
      );

      continue;
    }

    writeFailure(
      `${route}: expected ${headerName}="${expectedValue}", received "${actualValue ?? "missing"}".`,
    );
  }

  const permissionsPolicy =
    response.headers.get(
      "permissions-policy",
    );

  const expectedPermissionTokens = [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "usb=()",
    "browsing-topics=()",
  ];

  if (!permissionsPolicy) {
    writeFailure(
      `${route}: Permissions-Policy header is missing.`,
    );
  } else {
    for (
      const token of
      expectedPermissionTokens
    ) {
      if (
        permissionsPolicy.includes(
          token,
        )
      ) {
        writePass(
          `${route}: Permissions-Policy includes ${token}.`,
        );
      } else {
        writeFailure(
          `${route}: Permissions-Policy does not include ${token}.`,
        );
      }
    }
  }

  const poweredBy =
    response.headers.get(
      "x-powered-by",
    );

  if (!poweredBy) {
    writePass(
      `${route}: X-Powered-By is absent.`,
    );
  } else {
    writeFailure(
      `${route}: X-Powered-By exposes "${poweredBy}".`,
    );
  }

  const hsts =
    response.headers.get(
      "strict-transport-security",
    );

  if (isProductionTarget) {
    const expectedHsts =
      "max-age=63072000; includeSubDomains; preload";

    if (
      hsts ===
      expectedHsts
    ) {
      writePass(
        `${route}: production HSTS policy is correct.`,
      );
    } else {
      writeFailure(
        `${route}: production HSTS is missing or incorrect.`,
      );
    }
  } else if (hsts) {
    writePass(
      `${route}: production-mode local server returned HSTS.`,
    );
  } else {
    writeWarning(
      `${route}: HSTS is absent on the local HTTP target.`,
    );
  }
}

/* =========================================================
   CSP header validation
========================================================= */

function validateCspHeaders({
  route,
  response,
}) {
  const reportOnlyPolicy =
    response.headers.get(
      "content-security-policy-report-only",
    );

  const enforcedPolicy =
    response.headers.get(
      "content-security-policy",
    );

  if (!reportOnlyPolicy) {
    writeFailure(
      `${route}: Content-Security-Policy-Report-Only is missing.`,
    );

    return null;
  }

  writePass(
    `${route}: Content-Security-Policy-Report-Only is present.`,
  );

  if (enforcedPolicy) {
    writeFailure(
      `${route}: enforced Content-Security-Policy is active before compatibility approval.`,
    );
  } else {
    writePass(
      `${route}: enforced CSP is not active yet.`,
    );
  }

  if (
    /[\r\n]/.test(
      reportOnlyPolicy,
    )
  ) {
    writeFailure(
      `${route}: CSP header contains control characters.`,
    );
  } else {
    writePass(
      `${route}: CSP header contains no CR/LF control characters.`,
    );
  }

  const directives =
    parseContentSecurityPolicy(
      reportOnlyPolicy,
    );

  for (
    const [
      directiveName,
      expectedValues,
    ] of Object.entries(
      REQUIRED_POLICY_DIRECTIVES,
    )
  ) {
    checkRequiredDirective({
      route,
      directives,
      directiveName,
      expectedValues,
    });
  }

  const scriptSources =
    directives.get(
      "script-src",
    ) ??
    [];

  if (isProductionTarget) {
    if (
      scriptSources.includes(
        "'unsafe-eval'",
      )
    ) {
      writeFailure(
        `${route}: production script-src contains 'unsafe-eval'.`,
      );
    } else {
      writePass(
        `${route}: production script-src excludes 'unsafe-eval'.`,
      );
    }

    if (
      directives.has(
        "upgrade-insecure-requests",
      )
    ) {
      writePass(
        `${route}: upgrade-insecure-requests is active.`,
      );
    } else {
      writeFailure(
        `${route}: upgrade-insecure-requests is missing in production.`,
      );
    }
  } else {
    if (
      scriptSources.includes(
        "'unsafe-eval'",
      )
    ) {
      writeWarning(
        `${route}: local policy includes development 'unsafe-eval'.`,
      );
    } else {
      writePass(
        `${route}: local production build excludes 'unsafe-eval'.`,
      );
    }
  }

  if (
    directives.has(
      "report-to",
    )
  ) {
    writePass(
      `${route}: modern report-to directive is configured.`,
    );
  } else {
    writeWarning(
      `${route}: report-to is not configured yet; legacy report-uri remains active.`,
    );
  }

  return {
    policyLength:
      reportOnlyPolicy.length,

    directiveCount:
      directives.size,
  };
}

/* =========================================================
   Route audit
========================================================= */

async function auditRoute(
  route,
) {
  const targetUrl =
    new URL(
      route,
      `${auditBaseUrl}/`,
    );

  writeSection(
    `Route ${route}`,
  );

  let response;

  const startedAt =
    Date.now();

  try {
    response =
      await fetchWithTimeout(
        targetUrl,
        {
          method:
            "GET",

          headers: {
            Accept:
              "text/html,application/xhtml+xml",
          },
        },
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

    routeSummaries.push({
      route,
      status:
        null,

      finalUrl:
        null,

      durationMs:
        Date.now() -
        startedAt,

      policyLength:
        null,

      directiveCount:
        null,
    });

    return;
  }

  const durationMs =
    Date.now() -
    startedAt;

  if (
    response.status >=
    500
  ) {
    writeFailure(
      `${route}: returned HTTP ${response.status}.`,
    );
  } else if (
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

  validateSecurityHeaders({
    route,
    response,
  });

  const policySummary =
    validateCspHeaders({
      route,
      response,
    });

  routeSummaries.push({
    route,

    status:
      response.status,

    finalUrl:
      response.url,

    durationMs,

    policyLength:
      policySummary
        ?.policyLength ??
      null,

    directiveCount:
      policySummary
        ?.directiveCount ??
      null,
  });
}

/* =========================================================
   CSP report receiver audit
========================================================= */

async function auditReportReceiver() {
  writeSection(
    "CSP report receiver",
  );

  const reportEndpoint =
    new URL(
      EXPECTED_REPORT_URI,
      `${auditBaseUrl}/`,
    );

  const payload = {
    "csp-report": {
      "document-uri":
        `${auditBaseUrl}/csp-audit`,

      "blocked-uri":
        "chrome-extension://storefront-csp-audit/script.js",

      "effective-directive":
        "script-src-elem",

      "violated-directive":
        "script-src 'self'",

      disposition:
        "report",

      "status-code":
        200,
    },
  };

  let response;

  try {
    response =
      await fetchWithTimeout(
        reportEndpoint,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/csp-report",

            Accept:
              "*/*",
          },

          body:
            JSON.stringify(
              payload,
            ),
        },
      );
  } catch (
    error
  ) {
    const errorName =
      error instanceof Error
        ? error.name
        : "UnknownError";

    writeFailure(
      `CSP report receiver request failed with ${errorName}.`,
    );

    return;
  }

  if (
    response.status ===
    204
  ) {
    writePass(
      "CSP report receiver returned HTTP 204.",
    );
  } else {
    writeFailure(
      `CSP report receiver returned HTTP ${response.status}.`,
    );
  }

  const acceptedReports =
    response.headers.get(
      "x-csp-reports-accepted",
    );

  if (
    acceptedReports ===
    "1"
  ) {
    writePass(
      "CSP report receiver accepted one report.",
    );
  } else {
    writeFailure(
      `Expected one accepted report, received "${acceptedReports ?? "missing"}".`,
    );
  }

  const requestId =
    response.headers.get(
      "x-request-id",
    );

  if (
    requestId &&
    requestId.trim()
  ) {
    writePass(
      "CSP report receiver returned a request ID.",
    );
  } else {
    writeFailure(
      "CSP report receiver did not return a request ID.",
    );
  }

  const acceptedHeader =
    response.headers.get(
      "x-csp-reports-accepted",
    );

  const actionableHeader =
    response.headers.get(
      "x-csp-actionable-reports",
    );

  const noiseHeader =
    response.headers.get(
      "x-csp-noise-reports",
    );

  const duplicateHeader =
    response.headers.get(
      "x-csp-duplicate-reports",
    );

  const loggedHeader =
    response.headers.get(
      "x-csp-logged-reports",
    );

  if (
    acceptedHeader ===
      "1" &&
    actionableHeader ===
      "0" &&
    noiseHeader ===
      "1"
  ) {
    writePass(
      "Synthetic browser-extension report was classified as non-actionable noise.",
    );
  } else {
    writeFailure(
      `Unexpected classification headers: accepted=${acceptedHeader}, actionable=${actionableHeader}, noise=${noiseHeader}.`,
    );
  }

  if (
    duplicateHeader ===
      "0" ||
    duplicateHeader ===
      "1"
  ) {
    writePass(
      `Duplicate-report counter is valid (${duplicateHeader}).`,
    );
  } else {
    writeFailure(
      `Invalid duplicate-report counter "${duplicateHeader ?? "missing"}".`,
    );
  }

  if (
    loggedHeader ===
      "0" ||
    loggedHeader ===
      "1"
  ) {
    writePass(
      `Logged-report counter is valid (${loggedHeader}).`,
    );
  } else {
    writeFailure(
      `Invalid logged-report counter "${loggedHeader ?? "missing"}".`,
    );
  }

  const rateLimitDegraded =
    response.headers.get(
      "x-csp-ratelimit-degraded",
    );

  if (
    rateLimitDegraded ===
      "false"
  ) {
    writePass(
      "CSP report rate limiting is healthy.",
    );
  } else if (
    rateLimitDegraded ===
      "true"
  ) {
    writeWarning(
      "CSP report rate limiting is operating in degraded fail-open mode.",
    );
  } else {
    writeFailure(
      "CSP report rate-limit status header is missing.",
    );
  }

  const duplicateProtectionDegraded =
    response.headers.get(
      "x-csp-duplicate-protection-degraded",
    );

  if (
    duplicateProtectionDegraded ===
      "false"
  ) {
    writePass(
      "CSP duplicate protection is healthy.",
    );
  } else if (
    duplicateProtectionDegraded ===
      "true"
  ) {
    writeWarning(
      "CSP duplicate protection is operating in degraded fail-open mode.",
    );
  } else {
    writeFailure(
      "CSP duplicate-protection status header is missing.",
    );
  }
}

/* =========================================================
   Summary
========================================================= */

function printRouteSummary() {
  writeSection(
    "Route summary",
  );

  console.table(
    routeSummaries.map(
      (
        summary,
      ) => ({
        Route:
          summary.route,

        Status:
          summary.status ??
          "request-failed",

        "Duration (ms)":
          summary.durationMs,

        "CSP length":
          summary.policyLength ??
          "missing",

        Directives:
          summary.directiveCount ??
          "missing",

        "Final URL":
          summary.finalUrl ??
          "unavailable",
      }),
    ),
  );
}

function printFinalSummary() {
  writeSection(
    "Final audit summary",
  );

  console.log(
    `Target: ${auditBaseUrl}`,
  );

  console.log(
    `Production target: ${String(isProductionTarget)}`,
  );

  console.log(
    `Routes audited: ${auditRoutes.length}`,
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
      "CSP compatibility audit failed.",
    );

    process.exitCode =
      1;

    return;
  }

  console.log(
    "",
  );

  console.log(
    "CSP compatibility audit completed successfully.",
  );
}

/* =========================================================
   Runtime configuration
========================================================= */

const auditBaseUrl =
  normalizeBaseUrl(
    readFirstNonEmptyEnvironmentValue([
      "CSP_AUDIT_BASE_URL",
      "HEALTH_BASE_URL",
    ]) ??
      DEFAULT_BASE_URL,
  );

const auditTimeoutMs =
  parsePositiveInteger(
    readFirstNonEmptyEnvironmentValue([
      "CSP_AUDIT_TIMEOUT_MS",
    ]),
    DEFAULT_TIMEOUT_MS,
  );

const auditRoutes =
  parseRoutes(
    readFirstNonEmptyEnvironmentValue([
      "CSP_AUDIT_ROUTES",
    ]),
  );

const parsedAuditBaseUrl =
  new URL(
    auditBaseUrl,
  );

const isProductionTarget =
  parsedAuditBaseUrl.protocol ===
    "https:" &&
  !isLoopbackHostname(
    parsedAuditBaseUrl.hostname,
  );

/* =========================================================
   Main execution
========================================================= */

async function main() {
  console.log(
    "Storefront CSP Compatibility Audit",
  );

  console.log(
    `Base URL: ${auditBaseUrl}`,
  );

  console.log(
    `Timeout: ${auditTimeoutMs}ms`,
  );

  console.log(
    `Routes: ${auditRoutes.join(", ")}`,
  );

  for (
    const route of
    auditRoutes
  ) {
    await auditRoute(
      route,
    );
  }

  await auditReportReceiver();

  printRouteSummary();
  printFinalSummary();
}

main().catch(
  (
    error,
  ) => {
    const errorName =
      error instanceof Error
        ? error.name
        : "UnknownError";

    console.error(
      `[FATAL] CSP audit failed with ${errorName}.`,
    );

    process.exitCode =
      1;
  },
);