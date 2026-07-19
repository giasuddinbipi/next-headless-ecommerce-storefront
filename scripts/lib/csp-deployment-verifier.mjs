/* =========================================================
   Public constants
========================================================= */

export const CSP_REPORT_ONLY_MODE =
  "report-only";

export const CSP_ENFORCE_MODE =
  "enforce";

export const DEFAULT_EXPECTED_CSP_MODE =
  CSP_REPORT_ONLY_MODE;

export const CSP_REPORT_ONLY_HEADER_NAME =
  "content-security-policy-report-only";

export const CSP_ENFORCED_HEADER_NAME =
  "content-security-policy";

export const CSP_REPORTING_ENDPOINTS_HEADER_NAME =
  "reporting-endpoints";

export const EXPECTED_CSP_REPORT_URI =
  "/api/security/csp-report";

export const EXPECTED_CSP_REPORT_TO_GROUP =
  "csp-endpoint";

export const EXPECTED_REPORTING_ENDPOINTS_VALUE =
  `${EXPECTED_CSP_REPORT_TO_GROUP}="${EXPECTED_CSP_REPORT_URI}"`;

/* =========================================================
   Mode resolution
========================================================= */

export function resolveExpectedCspMode(
  value,
) {
  const normalized =
    (
      value ??
      DEFAULT_EXPECTED_CSP_MODE
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return DEFAULT_EXPECTED_CSP_MODE;
  }

  if (
    normalized ===
      CSP_REPORT_ONLY_MODE ||
    normalized ===
      CSP_ENFORCE_MODE
  ) {
    return normalized;
  }

  throw new Error(
    'Expected CSP mode must be either "report-only" or "enforce".',
  );
}

/* =========================================================
   Header helpers
========================================================= */

function readObjectHeader(
  headers,
  name,
) {
  const normalizedName =
    name.toLowerCase();

  for (
    const [
      headerName,
      headerValue,
    ] of Object.entries(
      headers,
    )
  ) {
    if (
      headerName
        .toLowerCase() !==
      normalizedName
    ) {
      continue;
    }

    if (
      typeof headerValue ===
      "string"
    ) {
      return headerValue;
    }

    if (
      Array.isArray(
        headerValue,
      )
    ) {
      return headerValue.join(
        ", ",
      );
    }

    if (
      headerValue ===
        null ||
      typeof headerValue ===
        "undefined"
    ) {
      return null;
    }

    return String(
      headerValue,
    );
  }

  return null;
}

export function readHeaderValue(
  headers,
  name,
) {
  if (
    headers &&
    typeof headers.get ===
      "function"
  ) {
    return headers.get(
      name,
    );
  }

  if (
    headers &&
    typeof headers ===
      "object"
  ) {
    return readObjectHeader(
      headers,
      name,
    );
  }

  return null;
}

/* =========================================================
   Policy helpers
========================================================= */

function hasControlCharacters(
  value,
) {
  return /[\r\n]/.test(
    value,
  );
}

function getExpectedPolicyHeaderName(
  expectedMode,
) {
  return (
    expectedMode ===
      CSP_ENFORCE_MODE
      ? CSP_ENFORCED_HEADER_NAME
      : CSP_REPORT_ONLY_HEADER_NAME
  );
}

function getOppositePolicyHeaderName(
  expectedMode,
) {
  return (
    expectedMode ===
      CSP_ENFORCE_MODE
      ? CSP_REPORT_ONLY_HEADER_NAME
      : CSP_ENFORCED_HEADER_NAME
  );
}

function createMissingPolicyMessage(
  expectedMode,
  headerName,
) {
  return (
    expectedMode ===
    CSP_ENFORCE_MODE
      ? `Expected enforced CSP header "${headerName}", but it is missing.`
      : `Expected report-only CSP header "${headerName}", but it is missing.`
  );
}

/* =========================================================
   Deployment validation
========================================================= */

export function validateCspDeploymentHeaders({
  headers,
  expectedMode,
  requireProductionPolicy =
    false,
}) {
  const resolvedExpectedMode =
    resolveExpectedCspMode(
      expectedMode,
    );

  const expectedHeaderName =
    getExpectedPolicyHeaderName(
      resolvedExpectedMode,
    );

  const oppositeHeaderName =
    getOppositePolicyHeaderName(
      resolvedExpectedMode,
    );

  const activePolicy =
    readHeaderValue(
      headers,
      expectedHeaderName,
    );

  const oppositePolicy =
    readHeaderValue(
      headers,
      oppositeHeaderName,
    );

  const reportingEndpoints =
    readHeaderValue(
      headers,
      CSP_REPORTING_ENDPOINTS_HEADER_NAME,
    );

  const failures =
    [];

  const warnings =
    [];

  if (!activePolicy) {
    failures.push(
      createMissingPolicyMessage(
        resolvedExpectedMode,
        expectedHeaderName,
      ),
    );
  }

  if (oppositePolicy) {
    failures.push(
      `Unexpected CSP header "${oppositeHeaderName}" is also present.`,
    );
  }

  if (
    reportingEndpoints !==
    EXPECTED_REPORTING_ENDPOINTS_VALUE
  ) {
    failures.push(
      `Expected Reporting-Endpoints="${EXPECTED_REPORTING_ENDPOINTS_VALUE}", received "${reportingEndpoints ?? "missing"}".`,
    );
  }

  if (activePolicy) {
    const requiredPolicyFragments = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `report-uri ${EXPECTED_CSP_REPORT_URI}`,
      `report-to ${EXPECTED_CSP_REPORT_TO_GROUP}`,
    ];

    for (
      const fragment of
      requiredPolicyFragments
    ) {
      if (
        activePolicy.includes(
          fragment,
        )
      ) {
        continue;
      }

      failures.push(
        `Active CSP policy does not include "${fragment}".`,
      );
    }

    if (
      hasControlCharacters(
        activePolicy,
      )
    ) {
      failures.push(
        "Active CSP policy contains CR/LF control characters.",
      );
    }

    if (
      requireProductionPolicy
    ) {
      if (
        activePolicy.includes(
          "'unsafe-eval'",
        )
      ) {
        failures.push(
          "Production CSP policy contains 'unsafe-eval'.",
        );
      }

      if (
        !activePolicy.includes(
          "upgrade-insecure-requests",
        )
      ) {
        failures.push(
          "Production CSP policy is missing upgrade-insecure-requests.",
        );
      }
    }

    /*
     * Current compatibility policy intentionally allows
     * inline scripts and styles. This is not yet a strict,
     * nonce-based CSP.
     */
    if (
      resolvedExpectedMode ===
        CSP_ENFORCE_MODE &&
      activePolicy.includes(
        "'unsafe-inline'",
      )
    ) {
      warnings.push(
        "Enforced compatibility CSP still contains 'unsafe-inline'; strict nonce-based hardening is not active yet.",
      );
    }
  }

  if (
    reportingEndpoints &&
    hasControlCharacters(
      reportingEndpoints,
    )
  ) {
    failures.push(
      "Reporting-Endpoints contains CR/LF control characters.",
    );
  }

  return {
    valid:
      failures.length ===
      0,

    expectedMode:
      resolvedExpectedMode,

    activeHeaderName:
      expectedHeaderName,

    oppositeHeaderName,

    activePolicy,

    reportingEndpoints,

    failures,

    warnings,
  };
}