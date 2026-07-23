/* =========================================================
   Constants
========================================================= */

export const STRICT_CSP_REPORT_ONLY_MODE =
  "report-only";

export const STRICT_CSP_ENFORCE_MODE =
  "enforce";

export const DEFAULT_EXPECTED_STRICT_CSP_MODE =
  STRICT_CSP_REPORT_ONLY_MODE;

export const STRICT_CSP_REPORT_ONLY_HEADER =
  "content-security-policy-report-only";

export const STRICT_CSP_ENFORCED_HEADER =
  "content-security-policy";

export const REPORTING_ENDPOINTS_HEADER =
  "reporting-endpoints";

export const EXPECTED_REPORTING_ENDPOINTS_VALUE =
  'csp-endpoint="/api/security/csp-report"';

const NONCE_SOURCE_PATTERN =
  /'nonce-([A-Za-z0-9_-]{22,128})'/g;

/* =========================================================
   Expected-mode resolution
========================================================= */

export function resolveExpectedStrictCspMode(
  value,
) {
  const normalized =
    (
      value ??
      DEFAULT_EXPECTED_STRICT_CSP_MODE
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return DEFAULT_EXPECTED_STRICT_CSP_MODE;
  }

  if (
    normalized ===
      STRICT_CSP_REPORT_ONLY_MODE ||
    normalized ===
      STRICT_CSP_ENFORCE_MODE
  ) {
    return normalized;
  }

  throw new Error(
    'Expected strict CSP mode must be either "report-only" or "enforce".',
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

export function readStrictCspHeader(
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
   Nonce extraction
========================================================= */

export function extractStrictCspNonces(
  policy,
) {
  if (
    typeof policy !==
      "string" ||
    !policy
  ) {
    return [];
  }

  const nonces =
    [];

  for (
    const match of
    policy.matchAll(
      NONCE_SOURCE_PATTERN,
    )
  ) {
    const nonce =
      match[1];

    if (
      nonce &&
      !nonces.includes(
        nonce,
      )
    ) {
      nonces.push(
        nonce,
      );
    }
  }

  return nonces;
}

export function extractStrictCspNonce(
  policy,
) {
  const nonces =
    extractStrictCspNonces(
      policy,
    );

  return (
    nonces.length ===
      1
      ? nonces[0]
      : null
  );
}

/* =========================================================
   Rendered HTML validation
========================================================= */

function escapeRegularExpression(
  value,
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

export function hasMatchingScriptNonce(
  html,
  nonce,
) {
  if (
    typeof html !==
      "string" ||
    typeof nonce !==
      "string" ||
    !nonce
  ) {
    return false;
  }

  const escapedNonce =
    escapeRegularExpression(
      nonce,
    );

  const scriptNoncePattern =
    new RegExp(
      `<script\\b[^>]*\\bnonce\\s*=\\s*(?:"${escapedNonce}"|'${escapedNonce}'|${escapedNonce}(?=\\s|>))`,
      "i",
    );

  return scriptNoncePattern.test(
    html,
  );
}

/* =========================================================
   Deployment validation
========================================================= */

export function validateStrictCspDeployment({
  headers,
  html,
  expectedMode,
  requireProductionPolicy =
    false,
}) {
  const resolvedMode =
    resolveExpectedStrictCspMode(
      expectedMode,
    );

  const activeHeaderName =
    resolvedMode ===
      STRICT_CSP_ENFORCE_MODE
      ? STRICT_CSP_ENFORCED_HEADER
      : STRICT_CSP_REPORT_ONLY_HEADER;

  const oppositeHeaderName =
    resolvedMode ===
      STRICT_CSP_ENFORCE_MODE
      ? STRICT_CSP_REPORT_ONLY_HEADER
      : STRICT_CSP_ENFORCED_HEADER;

  const activePolicy =
    readStrictCspHeader(
      headers,
      activeHeaderName,
    );

  const oppositePolicy =
    readStrictCspHeader(
      headers,
      oppositeHeaderName,
    );

  const reportingEndpoints =
    readStrictCspHeader(
      headers,
      REPORTING_ENDPOINTS_HEADER,
    );

  const failures =
    [];

  const warnings =
    [];

  if (!activePolicy) {
    failures.push(
      `Expected strict CSP header "${activeHeaderName}" is missing.`,
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

  const nonces =
    extractStrictCspNonces(
      activePolicy,
    );

  if (
    nonces.length ===
      0
  ) {
    failures.push(
      "Strict CSP policy does not contain a nonce source.",
    );
  }

  if (
    nonces.length >
      1
  ) {
    failures.push(
      "Strict CSP policy contains more than one unique nonce.",
    );
  }

  const nonce =
    nonces.length ===
      1
      ? nonces[0]
      : null;

  if (
    activePolicy
  ) {
    const requiredFragments = [
      "default-src 'self'",
      "script-src",
      "'strict-dynamic'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "report-uri /api/security/csp-report",
      "report-to csp-endpoint",
    ];

    for (
      const fragment of
      requiredFragments
    ) {
      if (
        !activePolicy.includes(
          fragment,
        )
      ) {
        failures.push(
          `Strict CSP policy does not include "${fragment}".`,
        );
      }
    }

    if (
      /[\r\n]/.test(
        activePolicy,
      )
    ) {
      failures.push(
        "Strict CSP policy contains CR/LF control characters.",
      );
    }

    if (
      activePolicy.includes(
        "'unsafe-inline'",
      )
    ) {
      failures.push(
        "Strict CSP policy contains 'unsafe-inline'.",
      );
    }

    if (
      requireProductionPolicy &&
      activePolicy.includes(
        "'unsafe-eval'",
      )
    ) {
      failures.push(
        "Production strict CSP policy contains 'unsafe-eval'.",
      );
    }

    if (
      requireProductionPolicy &&
      !activePolicy.includes(
        "upgrade-insecure-requests",
      )
    ) {
      failures.push(
        "Production strict CSP policy is missing upgrade-insecure-requests.",
      );
    }
  }

  if (
    nonce &&
    !hasMatchingScriptNonce(
      html,
      nonce,
    )
  ) {
    failures.push(
      "Rendered HTML does not contain a script using the CSP nonce.",
    );
  }

  if (
    resolvedMode ===
      STRICT_CSP_REPORT_ONLY_MODE
  ) {
    warnings.push(
      "Strict CSP is operating in report-only mode and is not blocking violations.",
    );
  }

  return {
    valid:
      failures.length ===
      0,

    expectedMode:
      resolvedMode,

    activeHeaderName,

    oppositeHeaderName,

    activePolicy,

    reportingEndpoints,

    nonce,

    failures,

    warnings,
  };
}